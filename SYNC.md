# Action Reminders — sync & storage spec (v5)

## State at rest
`state.json` is **encrypted**. Envelope: `{"enc":1,"v":1,"iv":"<b64>","data":"<b64>"}`.
- Cipher: AES-256-GCM, 12-byte IV per write, tag appended to ciphertext (WebCrypto + Python `cryptography` layouts match).
- Key: PBKDF2-HMAC-SHA256(secret = the GitHub PAT, salt = `hmar-v1-salt-2026`, 200000 iterations, 32 bytes).
- Plaintext inside: `{"a":[...active tasks...],"c":[...completed...]}`.
- Legacy plaintext state is read transparently by the app and re-encrypted on next save.

## Sync rules (for Claude sessions and scripts)
1. **Only `state.json` carries data.** The SEED in `index.html` is permanently empty — never write task data into the HTML.
2. To sync: GET state.json -> decrypt -> merge new tasks by id -> encrypt -> PUT with the GET's sha.
3. Merge semantics (match the app): completed = union, newer `completedAt` wins; active = union, newer `updatedAt` wins; active-vs-completed conflict resolved by newest of `updatedAt`/`uncompletedAt` vs `completedAt`.
4. Mutations must stamp `updatedAt` (ms epoch).

## Public exposure
The Pages site and repo are public; the app shell contains no task data and the state file is ciphertext. The PAT (in each device's localStorage and in Claude memory) is the only secret.

## Rollback
Pre-v5 snapshot: `backups/backup_2026-06-09_2242_v5_pre/` (plaintext index.html + state.json). Restoring it re-exposes data — prefer rolling forward.

## Task schema addition (v5.3)
- `people` (string, optional): comma-separated names tagged on the task. Fully user-editable (PEOPLE field in the edit panel and new-task modal).
- The People view derives its roster ONLY from `assignedBy` (THEY ASKED) and `people` (TAGGED). No name inference from dependencies, titles, or meeting names.
- User-typed names are authoritative; never let transcript spellings override a user's edit. Sync scripts should populate `people` for new tasks where participants are known.


## Meetings (`m`) — calendar sync (v6.0)
State now has a third array, `m`, alongside `a` (active) and `c` (completed). It is encrypted, merged, and persisted exactly like tasks (union by `id`, newer `updatedAt` wins). localStorage key `ar6_m`.

Meeting object:
- `id` (e.g. `mtg-aaron-0616`), `title` (match a task's `meetingTitle` to auto-link agreed actions), `start` (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`; empty/future = Upcoming, past = Past), `attendees` (comma-separated names — drives Upcoming "related actions" by matching task `people`/`assignedBy`), `summary` (Zoom AI summary, past meetings), `link` (Zoom doc/recording URL), `discussionPoints` (`[{id,text,done}]`, user-editable in-app), `addedAt`/`updatedAt`.

The view derives, never duplicates: Upcoming "related actions" = active tasks whose `people`/`assignedBy` include an attendee; Past "agreed actions" = tasks whose `meetingTitle` equals the meeting `title`.

Meeting sync workflow (Claude-driven, same as tasks):
- Past: pull AI summaries (recordings_list -> get_recording_resource; or search_zoom zoom_doc/notes -> get_file_content). Create one `m` entry per meeting with `title`, `start`, `attendees`, `summary`, `link`. Tasks already carry `meetingTitle`, so agreed actions link automatically.
- Upcoming: requires a scheduled-meetings/calendar source (Zoom scheduled meetings or Google Calendar). Until connected, add upcoming meetings in-app (+ Add meeting) and use the discussion-points editor. Populate `attendees` so related actions surface.
- Only the user's own meetings; dedupe by `id`.


## Meeting sync — pull the FULL payload, every time (added 22 Jun 2026)

A meeting sync must hydrate everything the Meetings tab renders, not just actions. For each meeting in the window:

1. **Summary** — `get_recording_resource(meetingId=<uuid>, types="summary")` -> `overall_summary`. (This response also carries a large `smart_pic_url` thumbnail blob; ignore it.)
2. **Agreed actions / next steps** — `get_recording_resource(meetingId=<uuid>, types="nextStep")` (lean; no thumbnail bloat). Create tasks ONLY for Harrison-owned items; skip items owned by others; dedupe by id and by title signature against `state.a`/`state.c`.
3. **Attendees** — from the calendar event / recording topic. Comma-separated string on the meeting object (drives the prep engine's people-overlap).
4. **Zoom link** — recording `share_url` (from `recordings_list`) or the zoom_doc link, stored as `link`.
5. Write meetings to **meetings.json** (never state.json). Tasks go to **state.json** (`a`), prepended.

Task due dates: EOW (Fri) by default; pull earlier when an item blocks someone or a dated milestone (e.g. a dependency for another person, or a launch like IKU ~1 Sep).

## Recurring meetings — next instance always visible in Upcoming

Recurring 1:1s/series carry `recurring:true` and `recur:"weekly"|"monthly"` plus their Google Calendar series id in `gcal`. On every sync:

- If a recurring card's `start` has passed, **archive that instance** as its own past meeting (new id e.g. `mtg-reut-0622`, with the pulled summary + link), then **roll the recurring card forward** to the next future instance's date (recompute from Google Calendar via the stored `gcal` id; keep the same card id, attendees, link, gcal).
- Net effect: the next occurrence of every recurring series is always present under Upcoming, and each past occurrence is preserved with its own summary/actions.
- Tagged series: mtg-reut-weekly, mtg-aaron-next, mtg-gavin-weekly, mtg-itsik-weekly (weekly); mtg-release-may (monthly).

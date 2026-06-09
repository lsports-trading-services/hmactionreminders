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

# Lab 3 API Specification

Base URL: `/api` · Content type: JSON unless noted · Auth: session cookie `toktickit_session` (httpOnly, SameSite=Lax, Secure in production, path `/`). The Lab 2 `X-Requester-Id` header is **removed entirely** — sending it has no effect (BR-12). Requester identity always comes from the session (BR-03).

## 0. Conventions

### Safe error shape (all endpoints, BR-29 — Lab 2 shape retained)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable safe message",
    "details": [ { "field": "summary", "message": "Summary is required" } ]
  }
}
```

No stack traces, SQL, file paths, password hashes, session tokens, or internal identifiers are ever exposed. Unexpected failures → `500` (`INTERNAL_ERROR`, generic message).

CSRF posture (BR-10): the session cookie is `SameSite=Lax`; all state-changing JSON endpoints require `Content-Type: application/json` and reject cross-site form-shaped bodies. No dedicated CSRF token at lab scale.

### Error codes used

| code | meaning |
|---|---|
| `VALIDATION_ERROR` | 400 — invalid body/query values (with `details`) |
| `UNAUTHENTICATED` | 401 — missing/expired/unknown session |
| `FORBIDDEN` | 403 — authenticated but not permitted (wrong role, requester on notes/admin, inactive account) |
| `PASSWORD_CHANGE_REQUIRED` | 403 — must-change session calling normal APIs (BR-02) |
| `NOT_FOUND` | 404 — missing resource, or non-owned / role-hidden resource (no leakage) |
| `CONFLICT` | 409 — duplicate email, last-admin removal, claim-on-owned, already-removed attachment |
| `GONE` | 410 — removed attachment download (Lab 2) |
| `PAYLOAD_TOO_LARGE` | 413 — oversize upload (Lab 2) |
| `UNSUPPORTED_MEDIA` | 415 — bad attachment type (Lab 2) |
| `INTERNAL_ERROR` | 500 — unexpected |
| `SERVICE_UNAVAILABLE` | 503 — health dependency down |

### Status code summary

200 retrieval/update success · 201 creation success · 400 invalid input · 401 no/invalid session · 403 forbidden / must-change / inactive · 404 missing or hidden resource · 409 conflict (email, admin safety, claim) · 410/413/415 attachment cases (Lab 2 unchanged) · 500 unexpected · 503 health dependency down.

### Safe user shape (never includes hash/token)

```json
{ "id": 3, "name": "Mina Staff", "email": "mina.staff@example.test", "role": "IT_STAFF", "active": true, "mustChangePassword": false }
```

---

## 1. Authentication

### POST /api/auth/login — establish session
Body: `{ "email": "...", "password": "..." }` (email normalized to lowercase, trimmed).
- **200**: sets `toktickit_session` cookie + returns `{ "user": <safe user> }`. If `mustChangePassword` is true, the session is flagged pending-change (BR-02): the client must route to `/change-password`; normal APIs return `PASSWORD_CHANGE_REQUIRED`. Pending-change sessions expire after 30 minutes (vs 8h normal) — a half-finished first login must not linger.
- **401** `UNAUTHENTICATED` with the generic message `"Invalid email or password"` — identical for unknown email, wrong password (BR-06).
- **403** `FORBIDDEN` `"This account has been deactivated. Contact your administrator."` — only when credentials are otherwise valid (BR-07).
- **400**: malformed body (missing fields).

### POST /api/auth/logout — invalidate session
- **200**: `{ "ok": true }`, session row deleted, cookie cleared with an expired Set-Cookie. No session → still 200 with clear (idempotent). Never redirects (client routes to `/login`).

### GET /api/auth/me — current identity
- **200**: `{ "user": <safe user> }`. Pending-change sessions may call this (needed for the change-password screen greeting).
- **401**: no/invalid/expired session.

### POST /api/auth/change-password — initial or voluntary change
Body: `{ "currentPassword": "...", "newPassword": "...", "confirmPassword": "..." }`.
- `currentPassword` is always required and verified — in the pending-initial flow it is the issued initial password, which lets the BR-09 differ-check apply uniformly (re-choosing the initial password is rejected).
- New password rules (BR-09): 8–72 chars, ≥1 letter + ≥1 digit, must differ from current; `confirmPassword` must match.
- **200**: `{ "user": <safe user with mustChangePassword:false> }`; pending flag cleared; other sessions of the same user are invalidated (password change kills siblings — safe default).
- **400**: rule violations with field `details`. **401**: bad session. **403**: `currentPassword` wrong (generic `"Current password is incorrect"`).

---

## 2. Requester ticket APIs (Lab 2 paths, session identity)

All Lab 2 `/api/tickets*` and `/api/attachments*` endpoints behave identically except:
- No `X-Requester-Id` header. The requester is `session.user` (must have role REQUESTER; staff/admin calling requester endpoints get 403 — they use §4–§5 instead).
- `POST /api/tickets` no longer accepts `requesterId` in the body — if present it is ignored (BR-03, AC-03).
- Inactive requesters: reads of existing owned data still allowed (audit retention — carryover of Lab 2 BR-23); writes (create/upload/remove/comment/indicate) → 403.
- Staff/Administrator users do not call these requester endpoints (403 when role ≠ REQUESTER); they operate through §3–§4 and download attachments via the staff path in §4.
- Error set gains 401/403; all Lab 2 codes (400/404/409/410/413/415) unchanged.

### GET /api/tickets/:id — owned detail (extended)
- **200**: Lab 2 detail shape **plus** `owner` (`{id,name} | null`), `itPriority`, `requesterResolved`, `requesterResolvedAt`, and `comments` (public only) newest-first. Internal notes are **never** included here (BR-04, AC-19).

### GET+POST /api/tickets/:id/comments — public comments
- GET **200**: `[{ id, body, authorName, authorRole, createdAt }]` newest-first. Non-owned → 404.
- POST body `{ "body": "..." }` (BR-20: trim, 1–2000) → **201** with the entry (author/time from server, BR-19). Cancelled ticket → 400 (BR-22). Non-owned → 404.

### GET+POST /api/tickets/:id/notes — requester-side path (always 403 for Requesters)
- Any Requester caller → **403** `FORBIDDEN`, no note content (AC-04). (Full contract under §4 — this path exists only to reject requesters cleanly.)

### POST /api/tickets/:id/resolved-indication — "appears resolved"
- Requester-owned ticket with status ∈ {OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER} → **200** `{ requesterResolved: true, requesterResolvedAt }` + automatic public comment `"Requester indicated the problem appears resolved."`. Repeat call → 200 no-op. Other statuses → 400; non-owned → 404; staff calling → 403 (they use status transitions).

---

## 3. IT Staff Ticket Queue

### GET /api/staff/tickets — queue retrieval (roles: IT_STAFF, ADMINISTRATOR)
Query parameters:

| param | meaning | rules |
|---|---|---|
| `search` | case-insensitive substring over ticketNumber + summary + description | optional; blank ignored |
| `status` | exact status filter | optional; must be valid status → else 400 |
| `categoryId` | exact filter | optional int, must exist → else 400 |
| `requestedPriority` / `itPriority` | exact filters | optional; valid enum → else 400 |
| `ownerId` | exact owner filter; `unassigned` literal filters NULL owner | optional int or `unassigned` → else 400 |
| `sort` | `{field}:{dir}` | allowed `createdAt` `updatedAt` `requestedPriority` `itPriority` `ticketNumber`; dir asc/desc; **default `createdAt:asc`** (FIFO, AD-07); secondary always `ticketNumber:asc`; invalid → 400 |
| `page` / `pageSize` | pagination | page ≥1 int (default 1); pageSize ∈ {5,10,25} default 10 (AD-07); else 400 |

Unknown parameters ignored. Priority sorts use severity URGENT > HIGH > MEDIUM > LOW.
- **200**: `{ items: [{ id, ticketNumber, summary, categoryName, requestedPriority, itPriority, currentStatus, owner (name|null), requesterName, createdAt, updatedAt }], page, pageSize, totalItems, totalPages }`.
- **401/403**: session / role failures. Requester role → 403.

### GET /api/staff/tickets/:id — staff detail
- **200**: full ticket incl. requester `{id,name,email}`, owner (`{id,name} | null` — email stripped per review), both priorities, flags, `comments` (public) + `notes` (internal) newest-first, attachments metadata (Lab 2 shape, read-only here — file bytes via the staff download in §4).
- **404**: missing id (roles verified first: requester → 403 before existence is probed — no leakage, §6).

---

## 4. IT Staff Ticket Operations (roles: IT_STAFF, ADMINISTRATOR)

### POST /api/staff/tickets/:id/claim — take ownership
- Unassigned ticket → caller becomes owner, and if status is NEW it moves to OPEN (one action, auditable). **200** with updated `{ owner, currentStatus }`.
- Already owned by caller → 200 no-op. Owned by someone else → **409** `CONFLICT` `"Ticket is owned by <name>; use assign to hand over."` (AD-09).
- **404**: missing ticket.

### POST /api/staff/tickets/:id/assign — assign / reassign / unassign
Body: `{ "ownerId": 7 | null }` (`null` unassigns).
- Target must exist, be active, and hold role IT_STAFF or ADMINISTRATOR → else 400/404, ownership unchanged (AC-15).
- Ownership/status coupling: assigning a non-null owner from NEW sets OPEN (acknowledgement, AD-13). Unassigning sets owner NULL and returns an active-work status (OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED) to NEW — back to the triage pool; RESOLVED/CLOSED/CANCELLED keep their status with owner cleared. **200** with updated owner/status.
- Assigning the current owner → 200 no-op.

### PATCH /api/staff/tickets/:id/priority — set IT Priority
Body: `{ "itPriority": "HIGH" }` (valid enum, required).
- **200** with updated ticket. Requester → 403 (AC-16). Missing ticket → 404. Invalid enum → 400.

### PATCH /api/staff/tickets/:id/status — controlled transition
Body: `{ "status": "RESOLVED" }`.
- Allowed only along the BR-17 matrix → **200** with updated ticket. Off-matrix → **400** `VALIDATION_ERROR` (`"Transition from X to Y is not permitted"`). Requester → 403 (BR-05, AC-17). Destructive targets (CANCELLED status, unassign/owner-removal) must be confirmed client-side (BR-17); the server validates the matrix regardless. Terminal CANCELLED tickets reject comment/note writes (BR-22) but remain readable.

### GET /api/staff/attachments/:id/download — staff read-only download (AC-31)
- **200**: binary stream of any ticket's attachment; `Content-Type` = stored MIME; `Content-Disposition: attachment; filename="<originalName>"` (Lab 2 rule). No upload/remove here — evidence is never altered staff-side.
- **401/403**: session / non-staff-admin role. **404**: missing attachment id. **410**: soft-removed (`GONE`).

### GET+POST /api/staff/tickets/:id/notes — internal notes (the primary staff path)
- Same entry shape as comments. POST validates BR-20. **201** on create. Requester callers never reach here (route role-guarded → 403, AC-04).

### POST /api/staff/tickets/:id/comments — public comments (staff path, Issue #33 gap fix)
- The requester route is requester-only, so staff post public replies here; both write the PUBLIC channel with identical validation (BR-20) and CANCELLED-freeze (BR-22). **201** on create.

### GET /api/staff/users — assignable directory (Issue #33 contract delta)
- Active IT Staff + Administrators only, ordered by name: `[{ id, name, role }]`.
- Minimal read-only list enabling the assign/owner controls; full user management (search, create, edit, deactivation) stays in Issue #34. Requester → 403.

---

## 5. Administrator User Management (role: ADMINISTRATOR only)

Any non-admin authenticated caller → **403** with no user data (AC-25). Unauthenticated → 401.

### GET /api/admin/users — list
Query: `search` (substring over name + email, case-insensitive, optional), `role` (single value, optional; invalid → 400).
- **200**: `{ items: [<safe user + createdAt>] }` ordered by name ascending (case-insensitive). No pagination (AD-08).

### POST /api/admin/users — create
Body: `{ "name", "email", "role", "active"?, "initialPassword" }` (active defaults true).
- Validation (BR-23): name 1–100; email shape-valid + unique case-insensitively → duplicate **409**; role ∈ enum → else 400; initialPassword meets BR-09 → else 400 with details.
- **201**: created safe user (`mustChangePassword: true`). The password itself is never returned (BR-27).

### PATCH /api/admin/users/:id — edit
Body subset: `{ "name"?, "email"?, "role"?, "active"? }`.
- Rules (BR-24..BR-26): email still unique → 409; self-deactivation (`id == caller && active === false`) → **400**; change leaving zero active Administrators → **409**; unknown id → 404.
- **200**: updated safe user.

### POST /api/admin/users/:id/reset-password — new initial password
Body: `{ "newPassword", "confirmPassword" }` meeting BR-09 (same field shape as change-password).
- Sets hash + `mustChangePassword=true` (BR-27); invalidates that user's other sessions. **200** `{ ok: true }` (no password echoed). Unknown id → 404.

---

## 6. Authorization matrix (summary — enforced server-side, never UI-only)

| Operation | Anonymous | Requester | IT Staff | Administrator |
|---|---|---|---|---|
| auth/login, health, categories | allow | allow | allow | allow |
| auth/me, logout, change-password | 401 (no session) | allow (own) | allow (own) | allow (own) |
| requester ticket/attachment/comment/indicate APIs | 401 | own data only (else 404); writes need active | 403 (use staff APIs) | 403 (use staff APIs) |
| staff queue/detail/claim/assign/priority/status/notes | 401 | 403 | allow (any ticket) | allow (any ticket) |
| requester detail payload | — | public comments only, never notes | — | — |
| admin user APIs | 401 | 403 | 403 | allow (+ safety rules) |

Hidden/disabled frontend controls mirror this table but enforce nothing — every row above is checked in middleware/route handlers and covered by `authorization.api.test.ts`.

## 7. Validation failure examples

```json
HTTP 401
{ "error": { "code": "UNAUTHENTICATED", "message": "Sign in required" } }
```

```json
HTTP 403
{ "error": { "code": "PASSWORD_CHANGE_REQUIRED", "message": "Choose a new password before continuing" } }
```

```json
HTTP 409
{ "error": { "code": "CONFLICT", "message": "Email is already in use" } }
```

```json
HTTP 400
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Status transition is invalid",
    "details": [ { "field": "status", "message": "Transition from CLOSED to IN_PROGRESS is not permitted" } ]
  }
}
```

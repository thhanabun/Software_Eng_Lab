# Lab 3 Sprint Engineering Specification

Version: 1.0 (approved before implementation) · Sprint: Lab 3 · Branch flow: `feature/lab3-*` → `lab3-staging` → `main`

## 1. Sprint Goal

Replace the temporary Development Requester selector with real cookie-session authentication and server-enforced role-based authorization for three roles — Requester, IT Staff, Administrator — while preserving every Lab 2 Requester function (create, list, detail, attachments) under the authenticated identity. Add the first operational IT Staff workflow (shared Ticket Queue, claim/reassign, IT Priority, status transitions, Public Comments, Internal Notes) and a minimalist Administrator User Management screen, all inside the existing Zen Green UI system.

## 2. Stakeholder Request Interpretation

In our own words: the prototype login must go. Every user now signs in with email + password; anyone holding an initial password must choose a new one before entering the app. The Requester keeps exactly the Lab 2 ticket functions, but "who am I" comes from the session — a client-supplied id must never override it. IT Staff get a professional queue to find work (search/filter/sort/page), open a ticket, take or hand over ownership, set operational priority, move the ticket through a controlled status workflow, talk to the Requester via public comments, and keep private internal notes. A Requester may signal "looks resolved" but only staff formally resolve/close. Administrators get one simple screen to manage accounts (create, edit, one role, activate/deactivate, issue a new initial password) with safety rails so the system can never lose its last admin. Nothing is secured by hiding buttons: every API and screen is enforced on the backend.

## 3. Scope

### Included
- Cookie-session authentication: login, logout, current user, mandatory first-login password change
- Server-side role authorization (Requester / IT Staff / Administrator) + ownership checks on every endpoint
- Migration `RequesterUser` → `User` model preserving ticket/attachment ownership; removal of selector + client requester state
- Requester regression: identical Lab 2 functions under authenticated identity + Public Comments + "Problem Appears Resolved" indication
- IT Staff Ticket Queue API + responsive UI (search, filters, sort, pagination)
- IT Staff Ticket Detail operations: claim/assign/reassign, IT Priority, status transitions, Public Comments, Internal Notes, attachment continuity
- Administrator User Management (list, search, role filter, create, edit, initial-password issue, safety rules)
- Data model increment + idempotent seed + migration evidence
- Automated tests: unit, API, UI component, UI style, security/authorization, migration/regression, responsive, E2E
- Documentation in `docs/lab-03/`

### Excluded
- Email invitations, password-reset email, MFA, social login, SSO; self-registration and Requester-created accounts
- Actions Taken by IT Staff (deferred to Lab 4, incl. the resolve-blocked-by-incomplete-actions rule)
- SLA calculation, escalation rules, notification services; dashboards/KPI beyond simple queue counts
- Multiple roles per user; user deletion (deactivation only); bulk operations; import/export; account-history screens
- Department/organization/profile-photo/extended profile management; email delivery of passwords/links
- Account unlocking / lockout (no lockout in Lab 3 — failed logins return a generic error; see BR-06); admin approval workflows
- Mandatory admin-list pagination, multi-column sorting, multiple simultaneous filters
- Multi-tenant organizations, departments, customer administration; production-grade deployment/cloud infrastructure changes

## 4. Functional Requirements

Authentication:
- FR-01: Sign in with email + password; establish a server session delivered as an httpOnly cookie.
- FR-02: Force users with an initial password through a Change Password screen before any normal screen is reachable.
- FR-03: Show the authenticated user's name + role in the shell; provide Logout that invalidates the session.
- FR-04: Expose the current user to the client (`GET /api/auth/me`) for guards and role navigation.

Requester regression:
- FR-05: Create/list/detail/attachments behave exactly as Lab 2, with ownership derived from the session identity.
- FR-06: Post Public Comments on owned tickets.
- FR-07: Indicate "Problem Appears Resolved" on owned tickets in permitted statuses (sets a flag + records a public comment; never changes status).

IT Staff:
- FR-08: Browse the shared Ticket Queue with search, filters, sorting, pagination; open any ticket's detail.
- FR-09: Claim a ticket (self-assign) or assign/reassign it to an active IT Staff or Administrator user.
- FR-10: Set IT Priority (initially copies Requested Priority).
- FR-11: Move tickets through permitted status transitions only (matrix §5).
- FR-12: Post Public Comments and write Internal Notes on any ticket.

Administrator:
- FR-13: List users (Name, Email, Role, Status, Edit action) with name/email search and optional single role filter.
- FR-14: Create a user with name, email, one permitted role, activation state, and an initial password (account starts in must-change state).
- FR-15: Edit a user's name, email, role, and activation state.
- FR-16: Issue a new initial password (account returns to must-change state).
- FR-17: Enforce safety rules: no self-deactivation, never remove the last active Administrator, unique emails, deactivation instead of deletion.

## 5. Business Rules

Authentication, passwords, sessions:
- BR-01: Only an active user with valid credentials may authenticate (sheet example).
- BR-02: A user marked as requiring a password change cannot enter the normal application until a valid new password is saved (sheet example). While flagged, every API except `me`, `change-password`, and `logout` returns 403 `PASSWORD_CHANGE_REQUIRED`.
- BR-03: The authenticated user identity, not any client-supplied id, determines ownership of Requester operations (sheet example). A `requesterId` in body/query is ignored, never trusted.
- BR-04: Public Comments are visible to Requester, IT Staff, and Administrator. Internal Notes are visible only to IT Staff and Administrator (sheet example).
- BR-05: A Requester may indicate the problem appears resolved but cannot formally set Resolved or Closed (sheet example).
- BR-06: Failed logins (unknown email, wrong password) return an identical generic 401 — no account-enumeration signal. No lockout in Lab 3 (unlocking is excluded scope).
- BR-07: An inactive account with otherwise-valid credentials is rejected with 403 and a clear "account deactivated, contact your administrator" message — without revealing anything beyond that.
- BR-08: Passwords are stored as bcrypt hashes (cost 12), never plaintext; hashes never leave the server (never in responses, logs, or seed output).
- BR-09: New/initial passwords: 8–72 chars, at least one letter and one digit; confirmation must match; the new password must differ from the current/initial one. Email addresses are unique (case-insensitive) and validated by shape.
- BR-10: Sessions: opaque random token in cookie `toktickit_session` (httpOnly, SameSite=Lax, Secure in production, path `/`), server-side `Session` row with 8-hour absolute expiry; logout deletes the row (cookie cleared); expired/unknown token → 401. CSRF posture: SameSite=Lax + JSON APIs that reject non-JSON content types — documented in api-spec §0; no separate CSRF token at lab scale (AD-02).
- BR-11: `GET /api/auth/me` returns only safe identity fields (id, name, email, role, active, mustChangePassword) — never hashes or tokens.

Requester regression:
- BR-12: All Lab 2 ownership rules persist (BR-08 Lab 2): a Requester sees only owned tickets/attachments; non-owned → 404 with no existence leakage. `X-Requester-Id` is removed entirely — sending it has no effect.
- BR-13: Attachment rules unchanged (types, 5 MB, 5-active limit, soft removal, 410/409/413/415 semantics).

Ticket ownership, priority, status:
- BR-14: Each ticket has zero or one primary owner, who must be an active IT Staff or Administrator user. Tickets start unassigned. Unassigning an active-work ticket (OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED) returns it to NEW; resolved/terminal statuses keep their status with owner cleared.
- BR-15: Requested Priority is immutable after creation. IT Priority is initialized as a copy of Requested Priority and may be changed only by IT Staff or Administrator.
- BR-16: Statuses: `NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, REOPENED, CANCELLED`. Only IT Staff/Administrator may change status, and only along the permitted transition matrix (below); anything else → 400. Every transition requires the actor to hold the ticket's scope (staff/admin global).
- BR-17: Transition matrix (from → to):

| From | Permitted To | Notes |
|---|---|---|
| NEW | OPEN, CANCELLED | OPEN on claim/acknowledge |
| OPEN | IN_PROGRESS, WAITING_FOR_REQUESTER, CANCELLED | — |
| IN_PROGRESS | WAITING_FOR_REQUESTER, RESOLVED, CANCELLED | RESOLVED only by staff/admin even if requester indicated resolved |
| WAITING_FOR_REQUESTER | IN_PROGRESS, CANCELLED | staff resumes; requester replies via public comment |
| RESOLVED | CLOSED, REOPENED | — |
| CLOSED | REOPENED | — |
| REOPENED | IN_PROGRESS, CANCELLED | treated as active work again |
| CANCELLED | (terminal) | no outgoing transitions; writes frozen (BR-22) |

Destructive targets (CANCELLED status, unassign/owner-removal) require an explicit user confirmation in the UI; the server validates the matrix regardless of confirmation.

- BR-18: The requester resolved-indication is allowed only when status ∈ {OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER} and the ticket is owned by the caller; it sets `requesterResolved=true` (+ timestamp) and appends an automatic public comment. Repeating it is a no-op 200. It never changes status.

Comments and notes:
- BR-19: Both are append-only (no edit/delete in Lab 3). Author + server timestamp recorded by the backend; client-supplied author/time ignored.
- BR-20: Body required, trimmed, 1–2000 chars (same bound as descriptions — justified: consistent storage/UX, safe rendering).
- BR-21: Bodies render as plain text (escaped) — no HTML execution. Requester comment/note endpoints on non-owned tickets → 404; requester hitting Internal Note endpoints → 403 without note content.
- BR-22: Comment/note creation on CANCELLED tickets is rejected (400) — terminal history stays readable but frozen. CLOSED tickets still accept comments/notes (they may REOPEN, so post-closure discussion is legitimate).

Administrator:
- BR-23: Create requires name (1–100), valid unique email, one of `REQUESTER, IT_STAFF, ADMINISTRATOR`, and an initial password meeting BR-09. The account starts with `mustChangePassword=true`.
- BR-24: Edit may change name, email (still unique), role, and active flag. Role change never leaves zero active Administrators.
- BR-25: An Administrator cannot deactivate their own account (400).
- BR-26: The system must always retain ≥1 active Administrator — the deactivation/role-change that would remove the last one is rejected (409).
- BR-27: Issuing a new initial password sets `mustChangePassword=true` (BR-02 applies at next login). Passwords are never returned in any response.
- BR-28: No user deletion anywhere — deactivation only. Deactivated users keep history (tickets, comments) intact.

Validation/failures/regression:
- BR-29: All APIs keep the Lab 2 safe-error shape and codes, plus 401 `UNAUTHENTICATED`, 403 `FORBIDDEN` / `PASSWORD_CHANGE_REQUIRED`. No stack traces, SQL, hashes, or tokens in responses.
- BR-30: Lab 2 regression: every Lab 2 AC still holds under cookie identity; the full Lab 2 server/client suites stay green as the regression gate (migrated fixture identity only).

## 6. UI Specification Summary

Full detail in `ui-spec.md`. Zen Green tokens, form conventions, badges, responsive rules, and accessibility expectations from Lab 2 remain in force; new work reuses them (new badges: 8 statuses, IT Priority scale identical to Requested Priority, role pills, owner display; Public Comments vs Internal Notes visually distinct panels).

Routes: `/login`, `/change-password` (forced), requester `/tickets`, `/tickets/new`, `/tickets/:id` (adds comments + resolved-indication, drops selector/Change Requester), staff `/staff/tickets`, `/staff/tickets/:id` (ownership, priority, status, comments, notes, attachments read-only), admin `/admin/users` (table + create/edit modal + reset-password). Shell shows authenticated name + role + Logout; role-specific nav (unauthorized destinations never linked; direct access guarded by `RequireAuth`/`RequireRole` with a safe forbidden panel). Authenticated session expiry/logout → redirect to `/login`; back-button/deep-link after logout never renders protected content (guard re-checks `me`).

## 7. Data Changes

New/changed Prisma models (PostgreSQL; existing Ticket/Attachment rows preserved):

| Model | Key fields | Notes |
|---|---|---|
| `User` | id, name, email (unique, case-insensitive), passwordHash, role enum (`REQUESTER, IT_STAFF, ADMINISTRATOR`), active (default true), mustChangePassword (default true for seeded/created), createdAt, updatedAt | replaces `RequesterUser`; one role per user (Lab 3) |
| `Session` | id, tokenHash (unique), userId FK, expiresAt, createdAt | server-side session store; token = 256-bit random, only the hash stored |
| `Ticket` | + ownerId FK→User? (nullable), + itPriority enum (non-nullable, default: copy of requestedPriority at migration), + requesterResolved Boolean (default false), + requesterResolvedAt? ; requesterId FK remapped to new User ids | existing rows: ownerId NULL, itPriority = requestedPriority, status NEW stays valid |
| `TicketComment` | id, ticketId FK, authorId FK→User, visibility enum (`PUBLIC, INTERNAL`), body, createdAt | single table for comments + notes; no updatedAt (append-only) |
| `Category`, `RelatedSystem`, `Attachment` | unchanged | — |
| `RequesterUser` | **removed** (data migrated, table dropped) | migration maps old→new ids |

Enums: extend `TicketStatus` to the 8 values; add `UserRole`, `CommentVisibility`. `RequestedPriority` reused for `itPriority`.

Indexes/constraints: unique on user email (case-insensitive — `citext`-style via lower() or application-normalized lowercase storage; decision: store emails lowercased, unique index), session tokenHash unique, comment `@@index([ticketId, createdAt])`, ticket `@@index([ownerId])`, `@@index([currentStatus, updatedAt])` for the queue default query. Rationale recorded per-field in the migration commit message like Lab 2.

Migration strategy (tested on a copy first, sheet §5.2): (1) create new tables/enums; (2) insert Users from RequesterUsers (role REQUESTER, preserve active, seeded initial passwords per sheet §5.3); (3) remap `ticket.requesterId` old→new via a mapping table in the migration script; (4) backfill `itPriority=requestedPriority`; (5) drop `RequesterUser`. Rollback = restore from pre-migration dump (documented command in README).

Seed (idempotent, re-runnable, dev credentials documented in README only — never real secrets): ≥4 active + 1 inactive Requesters, ≥3 active + 1 inactive IT Staff, ≥1 active Administrator; realistic tickets across requesters × statuses × priorities × assigned/unassigned; example public comments + internal notes with no sensitive content. All seeded accounts start `mustChangePassword=true` with the documented dev initial password. Migrated Lab 2 Requesters (matched by email, active flag preserved) receive the same documented dev initial password and must change it at first Lab 3 login — this is how sheet §5.2 "existing Requesters receive initial passwords" is satisfied; brand-new seed Staff/Admin accounts follow the identical rule, so MIG-02 tests both paths.

## 8. API Contract

Detailed contract in `api-spec.md`. Summary:

| Endpoint | Method | Purpose | Success | Key errors |
|---|---|---|---|---|
| `/api/health` | GET | health (Lab 1, unchanged) | 200 | 503 |
| `/api/categories` | GET | categories (Lab 1, unchanged) | 200 | 500 |
| `/api/related-systems` | GET | active related systems (Lab 2, unchanged) | 200 | 500 |
| `/api/auth/login` | POST | email+password → session cookie + safe user | 200 (+cookie) | 401, 403 (inactive) |
| `/api/auth/logout` | POST | invalidate session, clear cookie (idempotent) | 200 | — (always 200, even without a session) |
| `/api/auth/me` | GET | current safe identity | 200 | 401 |
| `/api/auth/change-password` | POST | initial or voluntary change; clears flag | 200 | 400, 401, 403 |
| `/api/tickets` | POST/GET | Lab 2 create/list under session identity (`requesterId` ignored) | 201/200 | 400, 401, 403, 404 |
| `/api/tickets/:id` | GET | owned detail + public comments | 200 | 400, 401, 403, 404 |
| `/api/tickets/:id/comments` | GET/POST | list/add public comments | 200/201 | 400, 401, 403, 404 |
| `/api/tickets/:id/notes` | GET/POST | requester-side path: always 403 for Requesters (exists only to reject cleanly); staff use the staff path below | — | 403 |
| `/api/staff/tickets/:id/notes` | GET/POST | list/add internal notes — the primary staff path (staff/admin) | 200/201 | 401, 403, 404 |
| `/api/tickets/:id/resolved-indication` | POST | requester "appears resolved" (BR-18) | 200 | 400, 401, 403, 404 |
| `/api/staff/tickets` | GET | queue: search/filter/sort/page | 200 | 400, 401, 403 |
| `/api/staff/tickets/:id` | GET | staff detail (all fields + notes) | 200 | 401, 403, 404 |
| `/api/staff/tickets/:id/claim` | POST | self-assign (staff/admin) | 200 | 400, 401, 403, 404, 409 |
| `/api/staff/tickets/:id/assign` | POST | assign/reassign to active staff/admin | 200 | 400, 401, 403, 404 |
| `/api/staff/tickets/:id/priority` | PATCH | set IT Priority | 200 | 400, 401, 403, 404 |
| `/api/staff/tickets/:id/status` | PATCH | transition per matrix | 200 | 400, 401, 403, 404 |
| `/api/attachments*` | * | Lab 2 lifecycle under session identity | same as Lab 2 | +401/403 |
| `/api/staff/attachments/:id/download` | GET | staff/admin read-only download of any ticket's active file | 200 | 401, 403, 404, 410 |
| `/api/admin/users` | GET/POST | list (search+role filter) / create | 200/201 | 400, 401, 403, 409 |
| `/api/admin/users/:id` | PATCH | edit name/email/role/active | 200 | 400, 401, 403, 404, 409 |
| `/api/admin/users/:id/reset-password` | POST | issue new initial password | 200 | 400, 401, 403, 404 |

Authorization core: unauthenticated → 401; authenticated-but-forbidden (wrong role, requester on notes/admin, non-owned where applicable) → 403/404 per the api-spec §6 matrix (no leakage of other users' tickets/attachments/notes); invalid input → 400; missing → 404; admin-safety conflicts → 409.

## 9. Acceptance Criteria

- AC-01: Given an active user with valid credentials, when logging in, then the backend establishes the session cookie and returns the safe user identity + role (sheet example).
- AC-02: Given a must-change user, when login succeeds, then normal screens stay unavailable until a valid new password is saved (sheet example).
- AC-03: Given an authenticated Requester, when the client supplies another requesterId, then the backend still applies the session identity and never returns another Requester's data (sheet example).
- AC-04: Given a Requester account, when an Internal Note endpoint is requested, then the operation is rejected without exposing note content (sheet example).
- AC-05: Given wrong password or unknown email, when logging in, then an identical generic 401 is returned (no enumeration).
- AC-06: Given valid credentials on an inactive account, when logging in, then 403 with the deactivated-account message is returned.
- AC-07: Given a logged-in user, when logging out, then the session is invalidated, the cookie cleared, and protected screens/APIs reject subsequent access (incl. back-button revisit).
- AC-08: Given an expired/unknown session token, when calling any protected API, then 401 is returned.
- AC-09: Given a must-change session, when calling normal APIs, then 403 `PASSWORD_CHANGE_REQUIRED` is returned (except me/change-password/logout).
- AC-10: Given password change input violating BR-09, when submitted, then 400 field errors are returned and nothing changes.
- AC-11: Given a valid new password, when saved, then the flag clears, the hash updates (bcrypt, new ≠ old), and the app opens.
- AC-12: Given the Lab 2 requester flows, when run under cookie identity, then create/list/detail/attachments behave identically (regression; selector gone).
- AC-13: Given the queue with realistic data, when searching/filtering/sorting/paging, then correct slices + metadata return; invalid params → 400; unknown params ignored.
- AC-14: Given an unassigned ticket, when a staff user claims it, then they become owner (200); claiming an actively owned ticket without reassign intent → 409.
- AC-15: Given assign input, when the target is missing/inactive/not staff-or-admin, then 400/404 is returned and ownership unchanged.
- AC-16: Given a staff user, when setting IT Priority, then it updates; a Requester attempting it → 403.
- AC-17: Given a status change along the matrix (BR-17), when submitted, then 200; off-matrix or requester attempt → 400/403.
- AC-18: Given a public comment on an accessible ticket, when posted, then 201 with server author/time; empty/overlong → 400.
- AC-19: Given internal notes, when listed by staff/admin, then full entries return; the ticket's own Requester sees public comments only (notes never leak into requester payloads).
- AC-20: Given an owned ticket in a permitted status, when the Requester indicates "appears resolved", then the flag sets + auto public comment records; status unchanged; staff can still RESOLVE/CLOSE.
- AC-21: Given admin user creation with valid input, when submitted, then 201 with must-change account and no password in the response.
- AC-22: Given duplicate email (any case), when creating/updating a user, then 409 and nothing changes.
- AC-23: Given self-deactivation or last-admin removal input, when submitted, then rejection (400/409) and the admin set is unchanged.
- AC-24: Given a fresh initial password, when that user next logs in, then the forced change-password flow triggers (BR-27).
- AC-25: Given a non-Administrator, when calling any `/api/admin/*`, then 403 with no user data.
- AC-26: Given seeded data, when the seed re-runs, then no duplicates appear and manual deactivations persist (idempotency).
- AC-27: Given migrated Lab 2 data, when inspected, then every ticket keeps its requester, attachments intact, statuses valid, and seeded users can log in (migration evidence).
- AC-28: Given desktop/tablet/mobile viewports, then all Lab 3 screens stay usable with no clipping/overlap/h-scroll, role nav correct, badges consistent.
- AC-29: Given keyboard-only operation, then login → role-appropriate flows complete with visible focus.
- AC-30: Given the implemented screens, then Zen Green tokens/classes conform to ui-spec.md (style assertions).
- AC-31: Given a staff user, when downloading an attachment of any ticket, then the active file is served with its original name (removed → 410, missing → 404).

## 10. Definition of Done

Product Definition of Done (checked before the coding agent may report complete):
- [ ] All approved scope implemented; every AC above satisfied with linked test evidence
- [ ] All planned automated tests pass from documented commands on final `main` (unit, API incl. authorization/security, UI, style, migration/regression, E2E)
- [ ] No test skipped, disabled, or commented out
- [ ] Migration preserves all Lab 2 data (verified counts + ownership spot-checks); seed idempotent; rollback documented
- [ ] API matches api-spec.md incl. auth matrix, error shapes, and status codes; no hash/token/stack/SQL leakage (verified by tests)
- [ ] UI matches ui-spec.md with screenshot evidence at 3 viewports per major screen; public/internal visually distinct
- [ ] Ownership + role protection demonstrable via direct-API denial tests (requester↔requester, requester→notes/admin, logged-out access)
- [ ] Success, failure, boundary, empty, no-results, forbidden states handled and tested
- [ ] Secrets: no passwords/hashes/tokens in repo, responses, logs, or screenshots; dev credentials documented as local-only
- [ ] README setup/test instructions current (migrate, seed, dev logins, e2e commands)

Course delivery (checked separately): GitHub Issues + Kanban statuses used; feature branches; peer-reviewed PRs through `lab3-staging`; reviewer comments responded; `docs/lab-03/` complete (specification.md, tests.md, ui-spec.md, api-spec.md, reviewer.md, ai-use.md); one submission PDF.

## 11. Assumptions and Decisions

Issue decomposition (sheet §11) — each required area maps to a tracked issue:

| Area | Issue |
|---|---|
| specification, tests, migration plan | #29 (this contract) |
| authentication (model, session, seed, login APIs) | #30 |
| authorization + requester regression | #31 |
| IT Staff Ticket Queue | #32 |
| IT Staff Ticket operations (ownership, priority, status, comments, notes) | #33 |
| Administrator user management | #34 |
| E2E testing + visual inspection (screenshots, checklist) | #35 |
| release integration (reviewer.md, ai-use.md, final tests.md, README, merge to main) | #36 |

- AD-01: Cookie session (httpOnly + SameSite=Lax, server `Session` rows, 8h absolute expiry) over JWT — simpler for same-origin MVP, no client token handling, logout = row delete. Revisit only if cross-origin needs arise.
- AD-02: No dedicated CSRF token at lab scale: SameSite=Lax cookies + JSON-only state-changing APIs (+ explicit `Content-Type: application/json` requirement) — documented; a token would be added before any production use.
- AD-03: bcrypt cost 12 — OWASP-adequate for lab login volumes without slowing tests excessively (auth tests use cost 4 via env override — documented in tests.md).
- AD-04: Password rules (8–72 chars, letter+digit) — memorable for graders, blocks trivial passwords; 72 = bcrypt input limit.
- AD-05: Single `TicketComment` table with visibility enum instead of two tables — one append-only path, visibility enforced at query time by role.
- AD-06: Requester resolved-indication = boolean flag + auto public comment (auditable, no status side-effects) rather than a pseudo-status — keeps the 8-status matrix pure.
- AD-07: Queue default sort `createdAt:asc` (oldest waiting first — FIFO fairness), secondary `ticketNumber:asc`; page sizes {5,10,25} reused from Lab 2 for consistency.
- AD-08: Admin user list needs no pagination (lab scale; explicitly excluded) — search + single role filter only.
- AD-09: Claim on an already-owned-by-other ticket → 409 directing to assign/reassign (prevents accidental steals); assign is the explicit handover path.
- AD-10: Emails stored lowercased with a unique index — simple case-insensitive uniqueness without extensions.
- AD-11: Existing Lab 2 tickets map to status NEW (already the only value) and unassigned owner — staff triage starts the workflow.
- AD-12: Playwright E2E + screenshots into `artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/`, workers:1 (shared DB, Lab 2 lesson).
- AD-13: Sheet §4.3 keeps Admin/Staff "conceptually separate" but allows the approved matrix to permit overlap — our matrix permits Administrators on staff ticket operations (small-team reality: an admin must be able to triage when no staff are on shift). Unassign (`ownerId: null`) is the explicit return-to-queue handover (the inverse of claim), and the NEW→OPEN move on claim/assign is an acknowledgement side-effect so triaged tickets never sit in NEW while owned. Conversely, unassigning an active-work ticket returns it to NEW (triage pool); resolved/terminal statuses keep status with owner cleared. None of this adds Lab 4 scope (no Actions Taken, no SLA).
- AD-14: Hardening defaults with test cover (not sheet-mandated, kept deliberately): password change/reset invalidates sibling sessions (AUTH-08/ADM-04); inactive users keep read-only access to owned history (Lab 2 BR-23 carryover, RREG-01); the new password must differ from the old (AUTH-07). All three are asserted by tests, so they are contract, not accident.

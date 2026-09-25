# Lab 4 Sprint Engineering Specification

Version: 1.0 (approved before implementation) · Sprint: Lab 4 · Branch flow: `feature/lab4-*` → `lab4-staging` → `main`

## 1. Sprint Goal

Complete the TokTickIT service-desk workflow by adding Actions Taken under each Ticket, enforcing the final Ticket status and resolution rules at the backend, delivering concise role-appropriate dashboards for Requesters and IT Staff, and hardening the full Labs 1–3 application into one coherent, responsive, accessible Zen Green product ready for final demonstration.

## 2. Stakeholder Request Interpretation

In our own words: the desk can receive tickets and staff can talk to requesters, but nobody can yet plan or track the actual work. Every ticket needs an Actions Taken list where staff record what was done: when (auto timestamp), what (description), with what outcome (result), by whom (auto from session), whether follow-up is needed (and a mandatory note when it is), and which files to look at (attachment notes — plain text pointers, not file uploads). The ticket owner coordinates the whole ticket but a different staff member may perform an action. Requesters see all actions on their own tickets but never create or edit them. Requester "appears resolved" stays advisory; only staff formally resolve, and only when at least one action exists. Dashboards are thin summaries with links into the real screens — requesters see their own attention items, staff see the operational picture. Everything from Labs 1–3 keeps working unchanged.

## 3. Scope

### Included
- `ActionTaken` model, Prisma migration (data-preserving), backfill (legacy tickets = zero actions), idempotent seed (0/1/N actions across all statuses, priorities, assigned/unassigned)
- Actions Taken APIs: list (role-scoped), create, edit (staff/admin only), with validation, authorization, optimistic concurrency (`updatedAt` → 409 stale)
- Final Ticket status-transition matrix + role enforcement + resolution gate (RESOLVED requires ≥1 action), backend-enforced even on direct-API bypass
- Requester dashboard API + UI (owned metrics only): open count, waiting-for-requester, recently updated, recently resolved + drill-down to filtered My Tickets
- IT Staff dashboard API + UI: unassigned count, owned-by-me, by-status / by-priority breakdowns, recently updated + drill-down to filtered queue; admin reuses staff dashboard + concise user counts
- Actions Taken section on Staff Ticket Detail (list/create/view-edit) + read-only display on Requester Ticket Detail
- Status controls show only permitted transitions; success refreshes the ticket summary
- Final hardening: Labs 1–3 full regression, double-submit guards, consistent loading/empty/forbidden/conflict/not-found/failure feedback, no console errors/placeholders, current README
- Documentation in `docs/lab-04/` + evidence PDF (Answer Parts 1–9)

### Excluded
- Automatic SLA clocks, escalation engines, on-call scheduling, breach notifications
- Email, SMS, LINE, push, or other external notifications
- Inventory, spare parts, purchasing, cost accounting; time-sheet billing, payroll, labor-cost calculation
- Multi-level approval workflows, electronic signatures
- Advanced BI tools, custom report builders, export warehouses
- Multi-tenant organizations, production cloud operations
- Action assignee field and action-level status (complete/cancel) — actions are append-mostly records with edit, not workflow objects (locked decision)
- New features not approved in this contract

## 4. Functional Requirements

Actions Taken:
- FR-01: Staff/admin create an action on any accessible ticket with description, result, follow-up flag (+ mandatory follow-up note when flagged), attachment notes; date/time and performer recorded automatically from server clock + session.
- FR-02: Staff/admin edit an existing action (same validation as create); edit carries the ticket's `updatedAt` for optimistic concurrency.
- FR-03: Requesters list all actions on owned tickets via `GET /api/tickets/:id/actions` (read-only); requester create/edit attempts → 403. Path does not imply authorization — both the requester path and the staff path enforce the identical role/ownership rules server-side.
- FR-04: Actions are never deleted (no delete endpoint); history is append-mostly.

Ticket workflow:
- FR-05: Status changes allowed only along the final matrix (§5) by authorized roles; UI lists only permitted targets; backend rejects off-matrix, wrong-role, and gate violations.
- FR-06: Resolution gate: transition to RESOLVED requires ≥1 action on the ticket; otherwise 400 even when the matrix edge is legal.
- FR-07: Stale updates rejected: mutating calls carry the ticket `updatedAt` the client saw; mismatch → 409 with a reload prompt.
- FR-08: Requester resolved-indication remains advisory (flag + auto comment, never changes status).

Dashboards:
- FR-09: Requester dashboard returns owned-only metrics + recent lists + drill-down query params for My Tickets.
- FR-10: Staff dashboard returns operational metrics + recent/urgent lists + drill-down query params for the queue; admin additionally sees concise user counts.
- FR-11: Every metric/card defines its query, timezone/boundaries, empty behavior, and drill-down destination.

Hardening:
- FR-12: All Labs 1–3 screens, auth, ownership, comments, notes, attachments, and user management behave exactly as before (regression gate: all prior suites green).
- FR-13: Mutating forms guard against double-submit; recoverable failures preserve entered data.

## 5. Business Rules

Actions Taken:
- BR-01: An action belongs to exactly one ticket (FK, cascade on ticket delete — tickets are never deleted in practice; deactivation only).
- BR-02: The ticket owner coordinates the ticket, but an action's performer may be any active staff/admin user; the performer is always the authenticated caller (client-supplied performer ignored).
- BR-03: Action date/time = server timestamp at creation (client-supplied time ignored), stored in UTC; client renders in Asia/Bangkok.
- BR-04: Description required, trimmed, 1–2000 chars; result required, trimmed, 1–2000 chars; bodies render as plain escaped text.
- BR-05: `followUpRequired=false` → `followUpNote` must be absent/blank; `followUpRequired=true` → `followUpNote` required, trimmed, 1–1000 chars. Flipping an existing action from `true` to `false` via PATCH clears the stored note (set NULL); flipping `false` to `true` requires a note in the same call.
- BR-06: `attachmentNotes` optional free text ≤500 chars — pointers to existing attachment filenames, never file bytes, never HTML.
- BR-07: Actions are append-mostly: edit allowed (staff/admin), delete forbidden — `DELETE` on any action path returns **405** `METHOD_NOT_ALLOWED` with `Allow: GET, POST, PATCH` (single locked behavior; requesters are rejected by the staff route guard with 403 before reaching the handler).
- BR-08: Requester endpoints for actions: list-own → 200 (full entries); create/edit on any ticket → 403 with no action data leakage.

Ticket status and resolution:
- BR-09: Final transition matrix (roles: staff/admin only; requester never changes status):

| From | Permitted To |
|---|---|
| NEW | OPEN, CANCELLED |
| OPEN | IN_PROGRESS, WAITING_FOR_REQUESTER, CANCELLED |
| IN_PROGRESS | WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| WAITING_FOR_REQUESTER | IN_PROGRESS, CANCELLED |
| RESOLVED | CLOSED, REOPENED |
| CLOSED | REOPENED |
| REOPENED | IN_PROGRESS, CANCELLED |
| CANCELLED | (terminal) |

- BR-10: Resolution gate: `* → RESOLVED` requires `COUNT(actions) ≥ 1` on the ticket; violation → 400 `VALIDATION_ERROR` (`"Ticket must have at least one recorded action before resolving"`), checked after matrix validation.
- BR-11: Optimistic concurrency: `PATCH/POST` mutating ticket scope accepts `expectedUpdatedAt`; mismatch → 409 `CONFLICT` (`"Ticket was updated by another user; reload and retry"`); missing field → treated as no-check only for action create (documented exception), required for status/assign/priority/action-edit. Concurrent creates (both without stamp): both rows win in creation order; ticket `updatedAt` advances to the latest write.
- BR-12: CANCELLED remains terminal and frozen: no status moves, no action/comment/note writes (400); reads stay available.
- BR-13: Unassign coupling (Lab 3 AD-13 carryover): unassigning an active-work ticket returns it to NEW; resolved/terminal keep status with owner cleared.

Dashboards:
- BR-14: Requester metrics query only `requesterId = session.user`; staff metrics query all tickets; both computed by backend aggregates (never client-side counting of full collections).
- BR-15: "Recently updated" = `ORDER BY updatedAt DESC LIMIT 5`; "recently resolved" = status RESOLVED/CLOSED `ORDER BY updatedAt DESC LIMIT 5`; date boundaries in UTC day; empty → `[]` with `total: 0`, never 404.
- BR-16: Every dashboard count links to a drill-down: `{ base, query }` pairs mapping to existing list screens (e.g. queue `?status=NEW&ownerId=unassigned`, my-tickets `?status=WAITING_FOR_REQUESTER`).

Validation/failures/regression:
- BR-17: Safe-error shape and codes extend Lab 3 (plus 409 `CONFLICT` for stale updates); no hashes/tokens/stacks/SQL in responses.
- BR-18: Lab 1–3 regression: every prior AC still holds; all prior server/client suites stay green as the merge gate.

## 6. UI Specification Summary

Full detail in `ui-spec.md`. New routes: `/dashboard` (role-routed: requester → RequesterDashboard, staff/admin → StaffDashboard), staff detail gains an Actions Taken card section, requester detail gains a read-only actions list. Metric cards: label + value + drill-down link, `data-testid=metric-*`. Actions form: description/result textareas with counters, follow-up checkbox gating the follow-up note field, attachment-notes input, save/cancel, busy states. Status select lists only matrix-legal targets with confirm modal for CANCELLED. Zen Green tokens, badges, responsive table→cards, and a11y conventions from Labs 2–3 reused unchanged.

## 7. Data Changes

| Model | Key fields | Notes |
|---|---|---|
| `ActionTaken` | id, ticketId FK→Ticket (cascade), description, result, performedById FK→User, followUpRequired Boolean, followUpNote?, attachmentNotes?, createdAt (action date/time), updatedAt | performer = session user; no delete; `@@index([ticketId, createdAt])` |
| `Ticket` | + `actions` relation | no column change; `updatedAt` drives optimistic checks (already maintained) |
| `User`, `TicketComment`, `Attachment`, `Category`, `RelatedSystem` | unchanged | — |

Indexes: `ActionTaken @@index([ticketId, createdAt])`, `@@index([performedById])`. Migration: (1) create table + FKs + indexes; (2) no backfill rows (legacy tickets legitimately have zero actions — zero-action tickets simply cannot RESOLVE until an action is added); (3) rollback = drop table (no prior data touched). Seed: tickets with 0/1/N actions across all 8 statuses × priorities × assigned/unassigned; seed writes bypass the API layer so actions may exist on CANCELLED/CLOSED tickets (BR-12 freeze applies to API writes only — seeded history stays readable); dashboard demo data includes zero-metric cases (e.g. a requester with no waiting tickets). Decisions: (D1) no action-level status/assignee — actions are evidence records, ticket status remains the single workflow state; (D2) server timestamp over client time — prevents backdating and timezone disputes.

## 8. API Contract

Detailed contract in `api-spec.md`. Summary:

| Endpoint | Method | Purpose | Success | Key errors |
|---|---|---|---|---|
| `/api/tickets/:id/actions` | GET | list actions on owned ticket (requester path; staff/admin may also use it) | 200 | 401, 403, 404 |
| `/api/staff/tickets/:id/actions` | GET | list actions (staff/admin any ticket) | 200 | 401, 403, 404 |
| `/api/staff/tickets/:id/actions` | POST | create action (staff/admin) | 201 | 400, 401, 403, 404, 409 (stale) |
| `/api/staff/tickets/:id/actions/:actionId` | PATCH | edit action (staff/admin) | 200 | 400, 401, 403, 404, 409 (stale) |
| `/api/staff/tickets/:id/status` | PATCH | transition + resolution gate + `expectedUpdatedAt` | 200 | 400 (matrix/gate), 403, 404, 409 (stale) |
| `/api/staff/tickets/:id/assign`, `/priority` | POST/PATCH | existing ops + `expectedUpdatedAt` | 200 | 400, 401, 403, 404, 409 (stale) |
| `/api/dashboard/requester` | GET | owned metrics + recents | 200 | 401 |
| `/api/dashboard/staff` | GET | operational metrics + recents (+ user counts for admin) | 200 | 401, 403 (requester) |

All Labs 2–3 endpoints unchanged (regression).

## 9. Acceptance Criteria

- AC-01: Given staff/admin + valid action data, when created, then 201 under the correct ticket with server timestamp + session performer.
- AC-02: Given `followUpRequired=true` without note (or note without flag), when submitted, then 400 field errors and nothing saved.
- AC-03: Given a requester, when creating/editing any action, then 403; listing own ticket's actions returns full entries.
- AC-04: Given a legal matrix edge to RESOLVED on a zero-action ticket, when submitted, then 400 gate error; with ≥1 action → 200.
- AC-05: Given an off-matrix transition or requester attempt, when submitted, then 400/403 and status unchanged.
- AC-06: Given a stale `expectedUpdatedAt`, when mutating, then 409 and nothing changed.
- AC-07: Given a requester dashboard call, when retrieved, then only owned metrics/recents return (cross-requester data never leaks).
- AC-08: Given staff dashboard, when retrieved, then unassigned/owned-by-me/by-status/by-priority/recent counts match direct DB queries; each card carries a drill-down link.
- AC-09: Given empty data, when dashboards load, then zero-state cards render (no 404, no NaN).
- AC-10: Given the full Labs 1–3 suites, when run, then all green (regression gate).
- AC-11: Given desktop/tablet/mobile, when viewing Lab 4 screens, then no clipping/overlap/h-scroll, role nav correct, focus visible.

## 10. Definition of Done

- All approved scope implemented; every AC satisfied with linked test evidence
- All planned automated tests pass from documented commands on final `main` (unit, API incl. authz/workflow, UI, style, migration/regression, E2E); no test skipped/disabled
- Migration preserves all prior data; seed idempotent; rollback documented
- API matches api-spec.md incl. matrix, gate, 409 handling, error shapes; no leakage
- UI matches ui-spec.md with 3-viewport screenshots per major screen
- Ownership + role protection demonstrable via direct-API denial tests
- No secrets in repo/responses/logs/screenshots; README current

## 11. Assumptions and Decisions

Issue decomposition:

| Area | Issue |
|---|---|
| specification, tests skeleton | #51 (this contract) |
| actions-taken foundation (model, migration, seed, APIs) | #52 |
| actions-taken UI | #53 |
| ticket workflow (gate, matrix, concurrency) | #54 |
| dashboards API | #55 |
| dashboards UI | #56 |
| E2E + hardening + visual | #57 |
| release integration | #58 |

- AD-01: Minimal action model (no assignee/status) — ticket status stays the single workflow state; keeps Lab 4 reviewable and avoids a second workflow engine.
- AD-02: Optimistic concurrency via existing `updatedAt` — no schema change, no locks; 409 + reload is enough at lab scale.
- AD-03: Zero-action legacy tickets are valid — gate applies prospectively; backfill of fake actions would falsify history.
- AD-04: Dashboard endpoints return aggregates + top-5 lists, never full collections — bounded payloads, drill-down reuses list screens.
- AD-05: Admin reuses staff dashboard + user counts — avoids a third dashboard with no distinct operational need.
- AD-06: Requesters see all actions read-only (sheet §8.3) — transparency over requester's own tickets; notes stay staff-only as before.

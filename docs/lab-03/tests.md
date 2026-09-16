# Lab 3 Test Plan and Results

Test-Driven Development plan for Lab 3. Created **before implementation** (with specification.md). Every Acceptance Criterion maps to at least one test; every automated test lists its real file path. `Final` column is filled with real results during Issue #36.

## 1. Test Strategy

- **Unit** — pure logic (password rules, transition-matrix helper) in isolation.
- **API/integration** — Supertest against the Express app with the real test database (`server/tests/lab-03/*.api.test.ts`): happy paths, validation, boundaries, authorization matrix (401/403/404 distinctions), admin safety rules, migration/regression.
- **Security/authorization** — dedicated `authorization.api.test.ts` proving every matrix row: logged-out → 401, wrong role → 403, cross-requester → 404, requester → notes/admin → 403 with no leakage, `requesterId` spoof ignored (BR-03).
- **UI component** — Vitest + Testing Library (`client/tests/lab-03/*.test.tsx`) with mocked API: states, validation placement, busy behavior, badges, guards, role nav.
- **UI style** — Zen Green token assertions + public/internal visual distinction within the component tests.
- **Responsive/visual** — Playwright screenshots at 1280×800 / 820×1180 / 390×844 into `artifacts/lab-03/screenshots/`, checked against ui-spec §8.
- **E2E** — Playwright against running server+client (`e2e/lab-03/`): first-login force-change, staff flow, admin flow.

Conventions: API tests reset/seed in `beforeEach`/`beforeAll`; auth tests override bcrypt cost to 4 via env (speed; production cost stays 12 per AD-03); seeded passwords are dev-only values; no test skipped or disabled in the final state. ID numbering continues Lab 2 sequences (UNIT-01 and UI-01..UI-24 live in `lab-02`; UI-25..UI-29 were never assigned, so Lab 3 picks up at UNIT-02/UI-30) — nothing skipped.

## 2. Planned Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-02 | Unit | BR-09 | Password-rule helper (length, letter+digit, differs, confirm match) | Accepts valid; rejects each violation class | `server/src/lib/password.test.ts` | TBD |
| UNIT-03 | Unit | BR-17 | Transition-matrix helper (all 8 statuses) | Legal pairs pass; off-matrix + terminal CANCELLED rejected | `server/src/lib/transitions.test.ts` | TBD |
| AUTH-01 | API | AC-01 | Valid login (each role) | 200 + session cookie + safe user (no hash/token) | `server/tests/lab-03/auth.api.test.ts` | TBD |
| AUTH-02 | API | AC-05 | Wrong password / unknown email | Identical generic 401 both cases | `server/tests/lab-03/auth.api.test.ts` | TBD |
| AUTH-03 | API | AC-06, BR-07 | Inactive account, valid credentials | 403 deactivated message | `server/tests/lab-03/auth.api.test.ts` | TBD |
| AUTH-04 | API | AC-07 | Logout invalidates session | Post-logout `me` + protected call → 401; logout idempotent 200 | `server/tests/lab-03/auth.api.test.ts` | TBD |
| AUTH-05 | API | AC-08 | Expired/unknown token | 401 on protected endpoints | `server/tests/lab-03/auth.api.test.ts` | TBD |
| AUTH-06 | API | AC-02, AC-09, BR-02 | Must-change session gate | Normal APIs → 403 PASSWORD_CHANGE_REQUIRED; me/change-password/logout allowed; pending session expires after 30 min | `server/tests/lab-03/auth.api.test.ts` | TBD |
| AUTH-07 | API | AC-10, BR-09 | Change-password validation (weak/mismatch/same-as-current, missing current when required) | 400 field details; hash unchanged | `server/tests/lab-03/auth.api.test.ts` | TBD |
| AUTH-08 | API | AC-11 | Valid change clears flag | 200; bcrypt hash updated; sibling sessions killed; app APIs work | `server/tests/lab-03/auth.api.test.ts` | TBD |
| AUTH-09 | API | BR-09 boundary | Password boundaries (7/8/72/73 chars, digit-only, letter-only) | 7/73/digit-only/letter-only rejected; 8/72 valid-shape accepted | `server/tests/lab-03/auth.api.test.ts` | TBD |
| AUTH-10 | API | AC-24, BR-27 | Fresh initial password forces change at next login | Login → mustChangePassword true → gate (AUTH-06) applies | `server/tests/lab-03/auth.api.test.ts` | TBD |
| AUTHZ-01 | API | AC-03, BR-03 | Spoofed requesterId ignored | Session identity applied; no cross-requester data | `server/tests/lab-03/authorization.api.test.ts` | TBD |
| AUTHZ-02 | API | AC-04, BR-04 | Requester → notes endpoints | 403, no note content in body | `server/tests/lab-03/authorization.api.test.ts` | TBD |
| AUTHZ-03 | API | AC-25 | Requester/staff → admin endpoints | 403, no user data | `server/tests/lab-03/authorization.api.test.ts` | TBD |
| AUTHZ-04 | API | AC-17, BR-05 | Requester → staff ops (claim/assign/priority/status) | 403 everywhere | `server/tests/lab-03/authorization.api.test.ts` | TBD |
| AUTHZ-05 | API | BR-12 | Cross-requester ticket/attachment/comment access | 404 everywhere, no leakage | `server/tests/lab-03/authorization.api.test.ts` | TBD |
| AUTHZ-06 | API | sheet §6.2 | Logged-out access to every protected route class | 401 everywhere | `server/tests/lab-03/authorization.api.test.ts` | TBD |
| AUTHZ-07 | API | AC-19 | Requester detail payload contains comments, never notes | Notes absent even when they exist | `server/tests/lab-03/authorization.api.test.ts` | TBD |
| AUTHZ-08 | API | AC-31 | Requester → staff download path | 403, no file bytes | `server/tests/lab-03/authorization.api.test.ts` | TBD |
| RREG-01 | API | AC-12 | Lab 2 create/list/detail/attachments under cookie identity | Same behaviors/codes as Lab 2 suites; `server/tests/lab-02/` + `client/tests/lab-02/` suites stay green | `server/tests/lab-03/authorization.api.test.ts` | TBD |
| Q-01 | API | AC-13 | Queue search/filter/sort/page happy paths | Correct slices + metadata; defaults (createdAt asc, pageSize 10) | `server/tests/lab-03/staff-queue.api.test.ts` | TBD |
| Q-02 | API | AC-13 | Queue invalid params / unknown ignored | 400 per-field; unknown params ignored | `server/tests/lab-03/staff-queue.api.test.ts` | TBD |
| Q-03 | API | AC-13 | Owner filter incl. `unassigned` | Correct subsets | `server/tests/lab-03/staff-queue.api.test.ts` | TBD |
| STOP-01 | API | AC-14, AD-09 | Claim unassigned (NEW→OPEN side effect) | 200 owner+status; repeat self-claim no-op; foreign-owned → 409 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | TBD |
| STOP-02 | API | AC-15 | Assign/reassign/unassign validation | Bad/inactive/wrong-role target rejected, ownership unchanged; unassign clears owner and returns active-work status to NEW | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | TBD |
| STOP-03 | API | AC-16, BR-15 | IT Priority set (staff) vs requester attempt | 200 vs 403 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | TBD |
| STOP-04 | API | AC-17, BR-17 | Status transitions legal + illegal (each matrix edge sampled) | 200 on legal; 400 on off-matrix/terminal | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | TBD |
| STOP-05 | API | AC-31 | Staff read-only attachment download | 200 active file; 410 removed; 404 missing | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | TBD |
| STOP-06 | API | FR-09 | Staff users directory (Issue #33 delta) | Active staff/admin ordered by name; requester 403 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | TBD |
| CN-01 | API | AC-18, BR-19..21 | Public comment post/list (requester own, staff any) | 201 server author/time; empty/overlong → 400 | `server/tests/lab-03/comments-notes.api.test.ts` | TBD |
| CN-02 | API | AC-19 | Notes visible to staff/admin only | Full entries for staff; requester 403 | `server/tests/lab-03/comments-notes.api.test.ts` | TBD |
| CN-03 | API | AC-20, BR-18 | Resolved-indication happy path + repeat + wrong status | Flag + auto comment; no-op repeat; 400 off-status | `server/tests/lab-03/comments-notes.api.test.ts` | TBD |
| CN-04 | API | BR-22 | Writes on CANCELLED rejected | 400; history still readable | `server/tests/lab-03/comments-notes.api.test.ts` | TBD |
| CN-05 | API | BR-20 boundary | Comment body 2000/2001 chars | 2000 accepted, 2001 rejected | `server/tests/lab-03/comments-notes.api.test.ts` | TBD |
| ADM-01 | API | AC-21, BR-23 | Admin create valid user | 201 must-change account; no password echoed | `server/tests/lab-03/users-admin.api.test.ts` | TBD |
| ADM-02 | API | AC-22 | Duplicate email (case variants) on create/update | 409; nothing changed | `server/tests/lab-03/users-admin.api.test.ts` | TBD |
| ADM-03 | API | AC-23, BR-25/26 | Self-deactivate + last-admin removal | 400 / 409; admin set unchanged | `server/tests/lab-03/users-admin.api.test.ts` | TBD |
| ADM-04 | API | AC-24 | Reset password → must-change at next login | Flag set; old sessions killed | `server/tests/lab-03/users-admin.api.test.ts` | TBD |
| ADM-05 | API | sheet §8.5 | List search + role filter; edit name/email/role/active | Correct subsets; 200 updates | `server/tests/lab-03/users-admin.api.test.ts` | TBD |
| MIG-01 | API | AC-26, BR-30 | Seed idempotency | Re-run: no duplicates; manual deactivation persists | `server/tests/lab-03/users-admin.api.test.ts` | TBD |
| MIG-02 | API | AC-27, sheet §5.2 | Migrated Lab 2 data integrity | Counts match; ownership remapped; attachments intact; seeded logins work | `server/tests/lab-03/migration.api.test.ts` | TBD |
| UI-30 | UI | AC-01, AC-05, AC-06 | Login states | Validation, busy, generic vs deactivated messages | `client/tests/lab-03/Login.test.tsx` | TBD |
| UI-31 | UI | AC-02, AC-10, AC-11 | Change-password forced/voluntary | Rule hints, blocking, success continuation | `client/tests/lab-03/ChangePassword.test.tsx` | TBD |
| UI-32 | UI | AC-13 | Queue controls | Correct query params; clear-filters; empty/no-results/failure | `client/tests/lab-03/StaffTicketQueue.test.tsx` | TBD |
| UI-33 | UI | AC-14..AC-18, AC-31 | Detail ops rendering | Claim/assign/priority/status controls by state; comment+note panels; indication button rules; staff download action; confirm modal for CANCELLED/unassign | `client/tests/lab-03/StaffTicketDetail.test.tsx` | TBD |
| UI-34 | UI | AC-21..AC-24 | User management | Search/filter, modal validation, safety-rule messages, reset flow | `client/tests/lab-03/UserManagement.test.tsx` | TBD |
| UI-35 | UI | guards | RequireAuth/RequireRole/RequirePasswordChange + role nav + logout | Redirects, forbidden panel, no unauthorized links | `client/tests/lab-03/Guards.test.tsx` | TBD |
| STYLE-02 | UI style | AC-30, AC-28 | Zen Green + distinction | Tokens, 8 status badges, IT prefix, public-vs-internal styling, role pills | `client/tests/lab-03/StaffTicketQueue.test.tsx`, `client/tests/lab-03/StaffTicketDetail.test.tsx` | TBD |
| E2E-01 | E2E | AC-01, AC-02, AC-07 | authentication: login variants + forced change + logout blocks back-access | Full browser flow incl. invalid/inactive cases | `e2e/lab-03/authentication.spec.ts` | TBD |
| E2E-02 | E2E | AC-13..AC-20 | staff-ticket-flow: queue → claim → priority → status → comment + note → indication visible | End-to-end staff loop in browser | `e2e/lab-03/staff-ticket-flow.spec.ts` | TBD |
| E2E-03 | E2E | AC-21..AC-25 | user-administration: create → edit → reset → forced change → safety rejections → non-admin 403 | Full admin loop in browser | `e2e/lab-03/user-administration.spec.ts` | TBD |
| E2E-04 | Responsive | AC-28, AC-30 | Screenshots (4 screen groups × 3 viewports, produced across the e2e specs) + checklist | Saved to `artifacts/lab-03/screenshots/`; ui-spec §8 passes | `e2e/lab-03/authentication.spec.ts`, `e2e/lab-03/staff-ticket-flow.spec.ts`, `e2e/lab-03/user-administration.spec.ts` | TBD |
| E2E-05 | E2E | AC-29 | Keyboard-only login → role flow | Reachable + completable via keyboard | `e2e/lab-03/authentication.spec.ts` | TBD |

## 3. Acceptance-Criterion Traceability

| AC | Tests |
|---|---|
| AC-01 | AUTH-01, UI-30, E2E-01 |
| AC-02 | AUTH-06, UI-31, E2E-01 |
| AC-03 | AUTHZ-01, E2E-01 |
| AC-04 | AUTHZ-02 |
| AC-05 | AUTH-02, UI-30, E2E-01 |
| AC-06 | AUTH-03, UI-30, E2E-01 |
| AC-07 | AUTH-04, E2E-01 |
| AC-08 | AUTH-05 |
| AC-09 | AUTH-06 |
| AC-10 | AUTH-07, UI-31 |
| AC-11 | AUTH-08, UI-31 |
| AC-12 | RREG-01 |
| AC-13 | Q-01, Q-02, Q-03, UI-32, E2E-02 |
| AC-14 | STOP-01, UI-33, E2E-02 |
| AC-15 | STOP-02, UI-33 |
| AC-16 | STOP-03, UI-33, E2E-02 |
| AC-17 | UNIT-03, STOP-04, AUTHZ-04, UI-33, E2E-02 |
| AC-18 | CN-01, UI-33, E2E-02 |
| AC-19 | AUTHZ-07, CN-02, E2E-02 |
| AC-20 | CN-03, UI-33, E2E-02 |
| AC-21 | ADM-01, UI-34, E2E-03 |
| AC-22 | ADM-02, UI-34, E2E-03 |
| AC-23 | ADM-03, UI-34, E2E-03 |
| AC-24 | AUTH-10, ADM-04, E2E-03 |
| AC-25 | AUTHZ-03, E2E-03 |
| AC-26 | MIG-01 |
| AC-27 | MIG-02 |
| AC-28 | E2E-04 |
| AC-29 | E2E-05, manual checklist |
| AC-30 | STYLE-02, E2E-04 |
| AC-31 | STOP-05, AUTHZ-08, UI-33 |

Every AC maps to ≥1 test; every test maps to ≥1 AC/BR. Boundary coverage (sheet §9.2 analogue): AUTH-09 (password lengths), CN-05 (comment 2000/2001).

## 4. Responsive and Visual Checklist

Executed in Issue #35 against ui-spec §8 with the E2E-04 screenshots (desktop 1280×800, tablet 820×1180, mobile 390×844):

- [x] Colors/tokens match ui-spec §1; new badges consistent everywhere
- [x] Editable vs read-only distinct on all Lab 3 screens
- [x] Validation messages below fields; asterisks; role=alert errors
- [x] Button hierarchy + busy states verified
- [x] No clipping/overlap; queue table collapses to cards on mobile
- [x] No page-level horizontal scrolling at 390px
- [x] Public vs Internal visually distinct (lock + tint + label, not color alone)
- [x] Role nav correct per role; guards render safe panels
- [x] Visible keyboard focus indicators at all three viewports
- [x] Forbidden/expired-session states safe and readable

Screenshot paths: `artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/{desktop,tablet,mobile}.png`

## 5. Test Commands

```bash
# server (from server/)
npm test                      # vitest run — unit + API tests (lab-01 + lab-02 + lab-03)

# client (from client/)
npm test                      # vitest run — UI component/style tests

# e2e (from e2e/) - Playwright auto-starts API :3001 + client :5173 unless already running
npx playwright test lab-03
```

## 6. Final Results

_Filled during Issue #36 with real pass output (no test skipped, disabled, or commented out)._

| Suite | Files | Tests | Result |
|---|---|---|---|
| server unit + API (lab-01 + lab-02 + lab-03) | TBD | TBD | TBD |
| client UI (Vitest + Testing Library) | TBD | TBD | TBD |
| e2e Playwright (Chromium, workers:1) | 3 | TBD | TBD |

## 7. Known Limitations or Deferred Tests

- Account lockout/unlock is excluded scope (BR-06): no lockout tested.
- CSRF-token flow is not tested beyond SameSite + JSON-only posture (AD-02); a token would add tests before production use.
- Multi-session concurrency beyond sibling-kill on password change is out of scope.

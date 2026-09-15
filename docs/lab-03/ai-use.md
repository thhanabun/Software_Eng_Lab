# AI Use and Reflection — Lab 3

I used **opencode** (CLI coding agent) for TokTickIT Lab 3 — from labsheet review and implementation planning through Spec DD, Test DD, and phased implementation across 7 Issues (#29–#35). I reviewed every generated file, migration, seed, test, and commit before accepting it. The agent never merged a Pull Request on its own; every merge followed explicit human approval after peer review by ssiriwan.

## Session 1 — Planning + Spec Contract (#29)

### 1. Review PDF labsheet

**Prompt:** `review [PDF 1] ว่าเราต้องทำอะไรบ้าง`

**Reflection:** The agent summarized the 18-page Lab 3 handout into product increments, roles, BR/AC, DB/API/UI scope, and the 9-part PDF submission. Starting from a shared understanding of the 60-point rubric kept later phases aligned.

### 2. Full implementation plan

**Prompt:** `ลองเขียน Implementation Plan ตลอดทั้ง Lab นี้มาให้เราอ่านหน่อย`

**Reflection:** The agent inspected the real repo state (schema, app.ts, vitest configs, main branch) before planning, so the 8-issue plan with branch names and file paths matched reality instead of being generic advice.

### 3. Evaluate 9 suggestions

**Prompt:** `ลองตรวจสอบข้อเสนอแนะเหล่านี้แล้วดูว่าอันไหนที่ควรพิจารณาตามบ้าง`

**Reflection:** The agent checked each suggestion against the labsheet and codebase and adopted 9/9 with reasons (2 active Admins for self vs last-admin tests, inactive anti-enumeration split, mustChange allowlist, Admin read-only tickets, exact test paths). Evidence-based verdicts beat gut feeling.

### 4. Write spec contract + open PR #37

**Prompt:** `เริ่มทำตาม phase 1 implementation plan ได้เลย`

**Reflection:** The agent created `lab3-staging` from clean `main`, branched `feature/lab3-spec-contract`, and wrote `specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md` with consistent decisions. 4 code-review rounds with ssiriwan caught 6 follow-ups (unassign status rule, 30-min pending expiry, Created visibility, AUTHZ-08). All addressed before merge — spec was locked before any implementation code.

## Session 2 — Auth Foundation (#30)

### 5. Implement auth foundation

**Prompt:** `เริ่ม phase 3 เลย`

**Reflection:** The agent created `feature/lab3-auth-foundation`, implemented User/Session models, bcrypt password lib, cookie-session auth (login/logout/me/change-password), migration with RequesterUser→User backfill, and seed with 10 users + 8 tickets. Self-review caught 5 items (initial differ-check hole, CORS credentials, dummy-hash login, middleware composition, seed idempotency). PR #38 opened with server 75/75 green.

### 6. Address PR #38 review (2 blockers + 3 majors)

**Prompt:** `เพื่อนเม้นมา Needs fix: ...` (inactive bypass, migration atomicity, CORS, timing oracle, middleware composition)

**Reflection:** All 5 items addressed — inactive sessions now destroyed + 403, CORS explicit origin + credentials, dummy-hash compare in try/catch, middleware chain reused `req.user`. Server 75/75 green. Reviewer conditional-approved after clean-DB migration log proof.

## Session 3 — Requester Regression (#31)

### 7. Requester regression + auth UI

**Prompt:** `เริ่ม phase 4 เลย`

**Reflection:** The agent created `feature/lab3-requester-regress`, removed `X-Requester-Id` header/selector/context, wired session identity onto all Lab 2 ticket/attachment APIs, implemented Login/ChangePassword UI with guards (RequireAuth/RequireRole/RequirePasswordChange), added public comments + resolved indication, and reworked E2E to use dedicated users. PR #39 merged — server 78/78, client 45/45, e2e 5/5.

## Session 4 — Staff Queue (#32)

### 8. Staff ticket queue

**Prompt:** `เริ่ม phase 5 เลย`

**Reflection:** The agent implemented `GET /api/staff/tickets` (search/filter/sort/pagination), `StaffTicketQueue.tsx` responsive UI (table + mobile cards), role-aware nav in AppShell, and 85 server tests (Q-01..Q-03). PR #40 merged — server 85/85, client 50/50.

## Session 5 — Staff Detail (#33)

### 9. Staff ticket detail operations

**Prompt:** `เริ่ม phase 6 เลย`

**Reflection:** The agent implemented `src/routes/staff.ts` (detail/claim/assign/priority/status/notes/comments/download/users), `transitions.ts` status matrix with 15-edge UNIT-03 tests, `StaffTicketDetail.tsx` with ops panel + confirm modals + amber notes panel. PR #41 merged — server 100/100, client 54/54, e2e 5/5.

## Session 6 — Admin User Management (#34)

### 10. Admin user management

**Prompt:** `Implement Issue 34 เลย แล้วเปิด PR`

**Reflection:** The agent implemented `src/routes/admin.ts` (list/search/create/edit/reset with safety rules), `UserManagement.tsx` with modals + responsive cards, moved MIG tests to users-admin file per test plan. PR #42 merged — server 108/108, client 59/59. Reviewer caught 409 duplicate field-level details — fixed.

## Session 7 — E2E Tests + Visual Evidence (#35)

### 11. E2E suites + responsive screenshots

**Prompt:** `ทำ Issue 35`

**Reflection:** The agent wrote 3 Playwright spec files (authentication, staff-ticket-flow, user-administration), extended `e2e-users.ts` to pin staff/admin/mustchange/inactive accounts, updated playwright config to cover lab-02+lab-03, and generated 15 screenshots at 3 viewports per Labsheet §12. During debugging: caught login/goto race condition (auth guard wins), fixed missing default password parameter, added mustchange self-healing comment, and added change-password screenshots per reviewer feedback. PR #43 opened — e2e 11/11, lab-02 regression 5/5.

## My Reflection

Using the agent as a **specification agent** (planning, matrices, traceability) forced me to decide auth mechanism, role separation, and transition rules up front, so implementation phases had no ambiguity. As a **coding agent** (migration SQL backfill, auth middleware, seed, TDD tests, E2E Playwright) it was fastest when the contract already fixed shapes and codes — I only had to verify diffs, test output, and reviewer comments.

Peer review by ssiriwan caught what generation missed across 7 PRs: spec scope creep (resolutionSummary), CORS misconfiguration, timing oracle, inactive session bypass, migration atomicity, field-level 409 details, and missing change-password screenshots. Each review round improved the contract and implementation. The agent's ability to handle multi-file changes across 7 branches while maintaining test suites green was the main productivity gain — but the review loop was what kept quality high.

Key lesson: **write the contract first, review before coding, and keep every PR small enough to review properly**. The 7-PR flow (spec → auth → regression → queue → detail → admin → e2e) with one Issue per PR made peer review manageable and catches isolated before they compound.

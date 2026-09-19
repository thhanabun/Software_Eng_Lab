# Lab 3 Peer Review

## My Reviewer (reviewed my Pull Requests)

- Name: ssiriwan (GitHub username: ssiriwan)

### My Pull Requests Reviewed (my repo: thhanabun/Software_Eng_Lab)

| PR | Issue | Title | Branch | Status |
| --- | --- | --- | --- | --- |
| #37 | #29 | Lab 3 Sprint Specification and Test Plan (Spec DD) | `feature/lab3-spec-contract` | Merged — 6 follow-ups addressed |
| #38 | #30 | Lab 3 Authentication Foundation (User Model, Session, Seed) | `feature/lab3-auth-foundation` | Merged — 2 blockers + 3 majors fixed |
| #39 | #31 | Lab 3 Requester Regression (Authenticated Identity) | `feature/lab3-requester-regress` | Merged — LGTM |
| #40 | #32 | Lab 3 IT Staff Ticket Queue (API + UI) | `feature/lab3-staff-queue` | Merged — LGTM |
| #41 | #33 | Lab 3 IT Staff Ticket Detail Operations | `feature/lab3-staff-detail` | Merged — LGTM |
| #42 | #34 | Lab 3 Administrator User Management | `feature/lab3-admin-users` | Merged — 1 high fixed (409 field details) |
| #43 | #35 | Lab 3 E2E Tests and Responsive Visual Evidence | `feature/lab3-e2e` | Merged — LGTM + 3 non-blocking notes |

### Reviews Received — Details

- **PR #37 (Spec contract):** 4 code-review rounds. Round 1: 8 follow-ups (resolutionSummary scope creep, brand typo, admin Email column, seed table, queue search/sort/filters, tests.md phasing, login-attempt + CSRF BRs). Round 2: 6 follow-ups (unassign status rule, 30-min pending expiry, Created visibility, AUTHZ-08). All addressed before merge.

- **PR #38 (Auth foundation):** 2 blockers — (1) inactive bypass: resolveSession/requireAuth ignored `active` flag → fixed with session destroy + 403, (2) migration atomicity: 7x ADD VALUE in one txn fails on PG → verified on clean DB. 3 majors — (3) CORS `*` breaks cookie auth → explicit origin + credentials, (4) timing oracle + garbage-hash crash → dummy hash in try/catch, (5) middleware composition → reuse `req.user`, chain auth→fresh→role. Conditional-approved after clean-DB migration log.

- **PR #39 (Requester regression):** LGTM. Follow-ups (non-blocking): (1) strip `owner.email` to `{id,name}`, (2) inactive read-only banner, (3) preserve returnTo via forced-change, (4) RequireRole must-change + returnTo, (5) await logout with error handling.

- **PR #40 (Staff queue):** LGTM. Verified queue contract per S6.3 (search/filters/10 sorts/FIFO/pages), safe raw SQL with escapeLike + params, 400 matrix + unknown-ignore, requester 403 / anon 401, UI states + role home + logout error handling.

- **PR #41 (Staff detail):** LGTM. Follow-ups: (1) matrix parity test, (2) CANCELLED guard on claim/assign/priority, (3) unassign-terminal rule, (4) refresh updatedAt, (5) directory error surfacing.

- **PR #42 (Admin user management):** 1 high — 409 duplicate must include `details:[{field:"email",message:"Email is already in use"}]` so UI highlights the field (was falling to generic banner). Fixed on both create/update. LGTM after fix.

- **PR #43 (E2E tests):** LGTM. 3 non-blocking notes: (1) mustchange test changes password permanently — re-run without globalSetup will fail (self-healing via `pinE2EUsers` on every full run, added comment), (2) screenshots gitignored — 15 files confirmed at `artifacts/lab-03/screenshots/` matching Labsheet §12 paths, PDF Part 9 will reference them, (3) missing change-password screenshots — added in follow-up commit.

## Pull Requests I Reviewed (in ssiriwan's repository, ssiriwan/toktickit)

| PR | Issue | Title | Branch | Status |
| --- | --- | --- | --- | --- |
| #32 | #32 | docs(lab-03): Sprint 3 spec contract | `feature/32-spec-contract` | Merged — 4 comments |
| #33 | #33 | docs(lab-03): test plan with AC traceability | `feature/33-test-plan` | Merged — 4 comments |
| #34 | #34 | feat(lab-03): auth foundation + migration + seed | `feature/34-auth-foundation` | Merged — 4 comments |
| #35 | #35 | feat(lab-03): requester regression + auth UI + comments | `feature/35-requester-regression` | Merged — 5 comments |
| #36 | #36 | feat(lab-03): staff ticket queue API + UI | `feature/36-staff-queue` | Merged — 6 comments |
| #37 | #37 | feat(lab-03): staff ticket detail ops + status matrix + detail UI | `feature/37-staff-detail` | Open — 6 comments |

### Reviews I Provided — Summary

- **PR #32 (Spec contract):** Approved with LGTM after 4 rounds of review comments covering scope creep, naming, and test plan alignment.
- **PR #33 (Test plan):** Approved — LGTM after comments on test file mapping and AC coverage.
- **PR #34 (Auth foundation):** Approved — LGTM after verifying migration, seed, and auth middleware.
- **PR #35 (Requester regression):** Approved — LGTM (Hard Pass → Needs Push → LGTM after fixes).
- **PR #36 (Staff queue):** Approved — LGTM (Passed → Needs Fixed → Passed after fixes).
- **PR #37 (Staff detail):** Reviewed — Passed with Needs Pushed comment (pending final push).

> This file is updated continuously as reviews happen.

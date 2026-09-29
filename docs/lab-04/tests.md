# Lab 4 Test Plan and Results

Test-Driven Development plan for Lab 4. Created **before implementation** (with specification.md). Every Acceptance Criterion maps to at least one test; every automated test lists its real file path. `Final` column is filled with real results during Issue #58.

## 1. Test Strategy

- **Unit** — validation helpers (action field rules, follow-up coupling), gate helper (zero-action resolve rejection), drill-down link builders.
- **API/integration** — Supertest against the Express app with the real test database (`server/tests/lab-04/*.api.test.ts`): happy paths, validation, boundaries, authorization matrix (401/403/404), resolution gate, stale-update 409, dashboard calculations vs direct DB queries, migration/regression.
- **Security/authorization** — requester create/edit → 403, cross-requester → 404, requester dashboard isolation, staff dashboard requester → 403.
- **UI component** — Vitest + Testing Library (`client/tests/lab-04/*.test.tsx`) with mocked API: actions form states, follow-up gating, 409 banner, metric cards, drill-down links, guards.
- **UI style** — Zen Green token assertions + actions-vs-comments distinction within component tests.
- **Responsive/visual** — Playwright screenshots at 1280×800 / 820×1180 / 390×844 into `artifacts/lab-04/screenshots/`, checked against ui-spec §7.
- **E2E** — Playwright against running server+client (`e2e/lab-04/`): action create→edit→resolve flow, dashboards drill-down, regression spot-checks.
- **Regression** — all Labs 1–3 server/client suites stay green as the merge gate.

Conventions: API tests seed in `beforeAll`/`beforeEach`; bcrypt cost 4 via env; no test skipped or disabled. ID numbering: Lab 4 uses ACT-*, WF-*, DREQ-*, DSTF-*, DUI-*, E2E-06+ (continuing the E2E sequence).

## 2. Planned Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| ACT-01 | API | AC-01 | Create valid action (staff) | 201 under correct ticket, server timestamp + session performer | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| ACT-02 | API | AC-01 | Follow-up coupling validation | Missing note with flag (and reverse) → 400, nothing saved | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| ACT-03 | API | AC-03 | Requester create/edit forbidden | 403 everywhere; list-own returns full entries | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| ACT-04 | API | AC-03 | Cross-requester action list | 404, no leakage | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| ACT-05 | API | BR-04/06 boundary | Description/result/followUpNote/attachmentNotes boundaries | 2000/2001, 1000/1001, 500/501 enforced | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| ACT-06 | API | BR-12 | Writes on CANCELLED rejected | 400; reads still work | `server/tests/lab-04/actions-taken.api.test.ts` | Pass |
| WF-01 | API | AC-04 | Resolution gate (zero actions) | Legal edge to RESOLVED → 400 gate error | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-02 | API | AC-04 | Resolution gate (with action) | Same edge → 200 | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-03 | API | AC-05 | Off-matrix + requester attempts | 400 / 403, status unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-04 | API | AC-06 | Stale `expectedUpdatedAt` | 409 on status/assign/priority/claim/action-edit + claim-race win; invalid/missing stamps; nothing changed on 409 | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| WF-05 | API | BR-09/10 | Matrix + gate via API (helpers live inline in route) | Legal/illegal + gate cases covered by WF-01..03 (no separate unit helper exists) | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| DREQ-01 | API | AC-07 | Requester dashboard isolation + boundary + drill-downs | Owned metrics only; 60-day RESOLVED excluded from resolved30d; metric drillDowns present; cross-requester data never leaks | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| DREQ-02 | API | AC-09 | Requester dashboard empty state | Zeros + `[]`, no 404 | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pass |
| DSTF-01 | API | AC-08 | Staff dashboard counts vs DB | Metrics match direct queries incl. ownedByMe cross-check; per-key byStatus/byItPriority drill-downs present | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| DSTF-02 | API | AC-08/09 | Staff dashboard roles + empty + precedence | Requester → 403; must-change on wrong endpoint → role-403 (not PASSWORD_CHANGE_REQUIRED); admin sees userCounts; empty → zeros | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |
| DUI-01 | UI | AC-01/02 | Actions form states | Follow-up gating, counters, busy, field errors, 409 banner | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| DUI-02 | UI | AC-05/06 | Workflow controls rendering | Only legal targets; confirm modal; 409 banner | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pass |
| DUI-03 | UI | AC-07/08 | Dashboard cards | Metrics render; drill-down links navigate; empty/forbidden states | `client/tests/lab-04/RequesterDashboard.test.tsx`, `StaffDashboard.test.tsx` | Pass |
| STYLE-03 | UI style | AC-11 | Zen Green + distinction | Tokens; actions-vs-comments styling | `client/tests/lab-04/ActionsTaken.test.tsx` | Pass |
| E2E-06 | E2E | AC-01/04 | actions-taken-flow: create → edit → resolve | Full browser flow incl. gate error then success | `e2e/lab-04/actions-taken-flow.spec.ts` | Pass |
| E2E-07 | E2E | AC-05/06 | ticket-resolution: matrix + stale handling | Permitted transitions + 409 reload path | `e2e/lab-04/ticket-resolution.spec.ts` | Pass |
| E2E-08 | E2E | AC-07/08 | dashboards: metrics + drill-down | Cards match; drill-down lands on filtered lists | `e2e/lab-04/dashboards.spec.ts` | Pass |
| E2E-09 | Responsive | AC-11 | Screenshots (3 screen groups × 3 viewports) + checklist | Saved to `artifacts/lab-04/screenshots/`; ui-spec §7 passes | `e2e/lab-04/*.spec.ts` | Pass |
| RREG-02 | Regression | AC-10 | Labs 1–3 suites green | All prior server/client suites pass; one deliberate exception: Lab 3 walk test adds an action before the RESOLVED hop (Lab 4 gate changes the contract) | existing suites | Pass |
| MIG-03 | API | AC-10 | Lab 4 migration preserves data | All prior users/tickets/comments/attachments intact; legacy tickets have zero actions; rollback documented | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pass |
| PERF-01 | API smoke | AC-08 | Dashboard latency smoke | Requester + staff dashboards respond < 2s on seeded data with bounded payloads | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pass |

## 3. Acceptance-Criterion Traceability

| AC | Tests |
|---|---|
| AC-01 | ACT-01, DUI-01, E2E-06 |
| AC-02 | ACT-02, DUI-01 |
| AC-03 | ACT-03, ACT-04, DUI-01 |
| AC-04 | WF-01, WF-02, DUI-02, E2E-06 |
| AC-05 | WF-03, DUI-02, E2E-07 |
| AC-06 | WF-04, DUI-01, DUI-02, E2E-07 |
| AC-07 | DREQ-01, DUI-03, E2E-08 |
| AC-08 | DSTF-01, DSTF-02, DUI-03, E2E-08 |
| AC-09 | DREQ-02, DSTF-02, DUI-03 |
| AC-10 | RREG-02, MIG-03, PERF-01 |
| AC-11 | STYLE-03, E2E-09 |

## 4. Responsive and Visual Checklist

Executed in Issue #57 against ui-spec §7 with the E2E-09 screenshots (desktop 1280×800, tablet 820×1180, mobile 390×844):

- [x] Colors/tokens match; actions visually distinct from comments/notes
- [x] Metric cards aligned; drill-down links obvious
- [x] Validation messages below fields; busy states verified
- [x] No clipping/overlap; no page-level h-scroll at 390px
- [x] Follow-up flag has icon + text (not color alone)
- [x] Visible keyboard focus at all three viewports
- [x] Forbidden/expired-session states safe and readable

Screenshot paths: raw captures land in `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}/{desktop,tablet,mobile}.png` (gitignored build output). The committed copies the PDF builds against live in `docs/lab-04/evidence/` (`staff-dashboard-*.png`, `requester-dashboard-*.png`, `actions-*.png`, plus `git-history.png` and `kanban-board.png`) — graders find every Part 5/6/8/9 screenshot there.

## 5. Test Commands

```bash
# server (from server/)
npm test                      # vitest run — unit + API tests (lab-01 through lab-04)

# client (from client/)
npm test                      # vitest run — UI component/style tests

# e2e (from e2e/)
npx playwright test lab-04
```

## 6. Final Results

_All green on `lab4-staging` (verified 2026-09-29); no test skipped, disabled, or commented out._

| Suite | Files | Tests | Result |
|---|---|---|---|
| server API lab-04 (`actions-taken`, `ticket-workflow`, `requester-dashboard`, `staff-dashboard`) | 4 | 25 | Pass |
| client UI lab-04 (`ActionsTaken`, `TicketWorkflow`, `RequesterDashboard`, `StaffDashboard`) | 4 | 17 | Pass |
| e2e Playwright lab-04 (`actions-taken-flow`, `ticket-resolution`, `dashboards`) | 3 | 5 | Pass |
| full server suite (labs 1–4) | 18 | 134/135 | 1 pre-existing MIG-02 failure (Lab 3 dev-password, fails on base too) |
| full client suite (labs 1–4) | 18 | 76/76 | Pass |

## 7. Known Limitations or Deferred Tests

- Multi-session concurrency beyond stale-update 409 is out of scope.
- Real-time updates (websockets/polling) excluded — dashboards refresh on navigation.

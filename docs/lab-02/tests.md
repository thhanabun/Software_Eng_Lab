# Lab 2 Test Plan and Results

Test-Driven Development plan for Lab 2. Created **before implementation** (with specification.md). Every Acceptance Criterion maps to at least one test; every automated test lists its real file path.

## 1. Test Strategy

- **Unit** — pure logic (ticket number generation) in isolation.
- **API/integration** — Supertest against the Express app with the real test database (`server/tests/lab-02/*.api.test.ts`), covering happy paths, validation, ownership, boundaries, and failure states.
- **UI component** — Vitest + Testing Library (`client/tests/lab-02/*.test.tsx`) with mocked API: states, validation placement, busy behavior, badges.
- **UI style** — assertions on Zen Green classes/tokens and field states within the component tests.
- **Responsive/visual** — Playwright screenshots at 1280×800 (desktop), 820×1180 (tablet), 390×844 (mobile) into `artifacts/lab-02/screenshots/`, compared against ui-spec.md checklist.
- **E2E** — Playwright against running server+client (`e2e/lab-02/`), full requester flow incl. multi-requester ownership.

Conventions: API tests reset/seed data in `beforeEach`/`beforeAll`; attachment tests use a temp uploads dir; no test is skipped or disabled in the final state.

## 2. Planned Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-01 | Ticket number generator format & daily sequence | Returns `TKT-YYYYMMDD-####`, zero-padded, increments per count | `server/src/lib/ticketNumber.test.ts` | Planned |
| API-01 | API | AC-24, BR-05, BR-27 | GET /api/requesters | 200; active requesters only; inactive excluded; ordered by name | `server/tests/lab-02/requesters.api.test.ts` | Planned |
| API-02 | API | BR-27 | Seed idempotency | Running seed twice creates no duplicates (categories/systems/requesters counts stable) | `server/tests/lab-02/requesters.api.test.ts` | Planned |
| API-03 | API | AC-01, BR-01, BR-02 | POST /api/tickets valid payload | 201; one saved ticket; unique number matches format; status NEW; timestamps set | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-04 | API | AC-06, AC-07, BR-09..BR-11 | Create validation failures (missing/oversize summary/description, bad category/system/priority) | 400 with field-level details; nothing saved | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-05 | API | BR-01 | Concurrent/sequential creates same day | All numbers unique, no duplicates after collision retry | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-06 | API | AC-24, BR-23 | Create with inactive requester | 400; no ticket saved | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-07 | API | AC-11, AC-03, BR-08 | GET /api/tickets ownership | Only selected requester's tickets returned; missing header → 400; unknown requester → 404 | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-08 | API | AC-12, BR-15 | Search behavior | Case-insensitive substring over summary+description; empty search ignored | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-09 | API | AC-13 | Filters (categoryId, status, priority) | Results narrowed correctly per filter and combinations | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-10 | API | AC-14, BR-14, AD-09 | Sorting | Default createdAt desc; each allowed field:dir works; secondary ticketNumber desc stable; invalid sort → 400 | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-11 | API | AC-15, BR-16 | Pagination | Correct slice; metadata page/pageSize/totalItems/totalPages; sizes {5,10,25}; out-of-range page → empty items | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-12 | API | AC-16, BR-16 | Invalid query params | 400 safe errors for bad page/pageSize/status/priority; unknown params ignored | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-13 | API | AC-17 | Empty result | 200 with `items: []` and zero totals | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-14 | API | AC-19 | GET /api/tickets/:id owner | 200 full detail incl. names + attachments array | `server/tests/lab-02/ticket-detail.api.test.ts` | Planned |
| API-15 | API | AC-03, BR-08, BR-25 | Detail non-owner / missing | 404 for other requester's id and non-existent id; no existence leakage | `server/tests/lab-02/ticket-detail.api.test.ts` | Planned |
| API-16 | API | BR-08 | Detail missing/invalid header | 400 safe error | `server/tests/lab-02/ticket-detail.api.test.ts` | Planned |
| API-17 | API | AC-20, BR-18 | Upload valid attachment | 201; metadata correct; file stored as uuid.ext; original name kept | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-18 | API | AC-21, BR-17 | Upload wrong type | 415; nothing stored | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-19 | API | AC-21, BR-17 | Upload oversize (>5 MB) | 413; nothing stored | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-20 | API | AC-21, BR-17 | Sixth active attachment | 409 when 5 active exist; allowed again after one removal | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-21 | API | AC-20, BR-19 | Attachment metadata list | Active + removed entries returned; removed keep reason/date | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-22 | API | AC-22 | Download active attachment | 200; correct Content-Type; original filename in disposition | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-23 | API | AC-23, BR-19 | Download removed attachment | 410 GONE safe error | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-24 | API | AC-23, BR-20 | Soft removal with reason | 200; removedAt+reason set; metadata retained | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-25 | API | BR-20 | Removal without/invalid reason | 400; nothing changed | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-26 | API | AC-23 | Remove already-removed | 409 | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-27 | API | AC-29, BR-21 | Attachment ownership (upload/download/remove other requester's) | 404 everywhere; no data access | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| UI-01 | UI | AC-25 | Selection loading state | Spinner shown while requesters load | `client/tests/lab-02/RequesterSelection.test.tsx` | Planned |
| UI-02 | UI | AC-25, AC-10 | Selection dropdown | Active requesters rendered from API; Continue disabled until selection | `client/tests/lab-02/RequesterSelection.test.tsx` | Planned |
| UI-03 | UI | AC-25 | Selection empty state | Empty message when no active requesters | `client/tests/lab-02/RequesterSelection.test.tsx` | Planned |
| UI-04 | UI | AC-25 | Selection API failure | Safe error + Retry action | `client/tests/lab-02/RequesterSelection.test.tsx` | Planned |
| UI-05 | UI | AC-02, BR-06 | Continue stores context | Selection persisted; navigation proceeds | `client/tests/lab-02/RequesterSelection.test.tsx` | Planned |
| UI-06 | UI | AC-27, BR-07 | Shell nav + requester display | Active-page indication; requester name shown; Change Requester works | `client/tests/lab-02/AppShell.test.tsx` | Planned |
| UI-07 | UI | AC-06 | Submit without Summary/Description | Field-level messages; API not called | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-08 | UI | AC-08 | Submit busy state | Button busy + disabled while request in flight; no double submit | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-09 | UI | AC-01, AC-05 | Success state | Generated Ticket Number + next actions shown | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-10 | UI | AC-09, BR-13 | API failure on create | Safe error; form values preserved | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-11 | UI | AC-04, AC-10 | System fields & reference data | Ticket Number/Date read-only before submit; categories/systems from API; requester from context | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-12 | UI | AC-30, BR-17 | Attachment selection in create form | Valid file listed; invalid type/size shows per-file message | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-13 | UI | AC-11 | My Tickets list | Rows rendered from API for selected requester | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-14 | UI | AC-12, AC-13, AC-14 | Search/filter/sort controls | Correct query params sent on change; Clear filters resets | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-15 | UI | AC-15 | Pagination controls | Page change/pageSize sent; metadata displayed | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-16 | UI | AC-17 | Empty vs no-results | Distinct empty state (no tickets) and no-results state (filters active) | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-17 | UI | FR-11 | List failure state | Safe error + Retry | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-18 | UI | AC-19 | Detail read-only | All header fields rendered read-only with badges | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Planned |
| UI-19 | UI | AC-03 | Detail not-found panel | Safe 404 panel for missing/non-owned ticket | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Planned |
| UI-20 | UI | AC-20 | Attachment upload flow | Upload button → file selected → 201 → row appears | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-21 | UI | AC-21 | Upload invalid file | Per-file error message; no row added | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-22 | UI | AC-22 | Download active | Download action present for active; absent for removed | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-23 | UI | AC-23, BR-20 | Remove confirmation | Modal requires reason; confirm calls DELETE; removed badge shown | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| STYLE-01 | UI style | AC-27 | Zen Green conformance | Primary button/header use tg-primary classes/tokens; read-only shading distinct; error text below field | `client/tests/lab-02/CreateTicket.test.tsx`, `client/tests/lab-02/AppShell.test.tsx` | Planned |
| E2E-01 | E2E | AC-01, AC-05, AC-11 | Full flow: select requester → create → appears in My Tickets → open detail | Official number displayed; ticket found in list and detail | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-02 | E2E | AC-03, AC-18, AC-29 | Ownership: requester B never sees A's ticket/attachment | Cross-requester access rejected in UI and direct API | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-03 | E2E | AC-20..AC-23 | Attachment lifecycle in browser | Upload → download → remove with reason → blocked download | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-04 | Responsive | AC-26, AC-27 | Screenshots at desktop/tablet/mobile for create-ticket, my-tickets, ticket-detail | Screenshots saved to `artifacts/lab-02/screenshots/`; checklist passes (no clipping/overlap/h-scroll) | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |

## 3. Acceptance-Criterion Traceability

| AC | Tests |
|---|---|
| AC-01 | API-03, UI-09, E2E-01 |
| AC-02 | UI-05, E2E-01 |
| AC-03 | API-07, API-15, UI-19, E2E-02 |
| AC-04 | UI-11 |
| AC-05 | UI-09, E2E-01 |
| AC-06 | API-04, UI-07 |
| AC-07 | API-04 |
| AC-08 | UI-08 |
| AC-09 | UI-10 |
| AC-10 | API-01, UI-02, UI-11 |
| AC-11 | API-07, UI-13, E2E-01 |
| AC-12 | API-08, UI-14 |
| AC-13 | API-09, UI-14 |
| AC-14 | API-10, UI-14 |
| AC-15 | API-11, UI-15 |
| AC-16 | API-12 |
| AC-17 | API-13, UI-16 |
| AC-18 | E2E-02 |
| AC-19 | API-14, UI-18 |
| AC-20 | API-17, API-21, UI-20, E2E-03 |
| AC-21 | API-18, API-19, API-20, UI-21 |
| AC-22 | API-22, UI-22, E2E-03 |
| AC-23 | API-23, API-24, UI-23, E2E-03 |
| AC-24 | API-01, API-06 |
| AC-25 | UI-01..UI-04 |
| AC-26 | E2E-04 |
| AC-27 | STYLE-01, E2E-04 |
| AC-28 | E2E-01 (keyboard navigation step), manual checklist |
| AC-29 | API-27, E2E-02 |
| AC-30 | API-17 (failure path), UI-12, E2E-03 |

Every AC maps to ≥1 test; every test maps to ≥1 AC/BR.

## 4. Responsive and Visual Checklist

Executed in Issue 7 against ui-spec.md §10 with the E2E-04 screenshots (desktop 1280×800, tablet 820×1180, mobile 390×844):
colors/tokens, editable vs read-only distinction, validation placement, button hierarchy, clipping/overlap, horizontal scroll, badge consistency, filter/pagination usability, attachment-name readability. Results recorded there with screenshot paths.

## 5. Test Commands

```bash
# server (from server/)
npm test                      # vitest run — unit + API tests (lab-01 + lab-02)

# client (from client/)
npm test                      # vitest run — UI component/style tests

# e2e (from repo root)
npm run e2e                   # playwright test (requires server :3001 + client :5173 running, DB seeded)
```

## 6. Final Results

_Filled during Issue 8 with real pass output from the final main branch (no skipped tests)._

| Suite | Files | Tests | Result |
|---|---|---|---|
| server unit + API | – | – | – |
| client UI | – | – | – |
| e2e Playwright | – | – | – |

## 7. Known Limitations or Deferred Tests

- Real authentication/session tests are deferred to Lab 3 by design (excluded scope).
- Multi-user concurrency beyond the number-collision retry is out of scope for the MVP.
- Filesystem cleanup of orphaned upload files after server crash is a documented operational limitation (metadata-first design keeps DB consistent).

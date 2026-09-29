# Lab 4 Peer Review

## My Reviewer (reviewed my Pull Requests)

- Name: ssiriwan (GitHub username: ssiriwan)

### My Pull Requests Reviewed (my repo: thhanabun/Software_Eng_Lab)

| PR | Issue | Title | Branch | Status |
| --- | --- | --- | --- | --- |
| #59 | #51 | Lab 4 Sprint Specification and Test Plan (Spec DD) | `feature/lab4-spec-contract` | Merged — approved, 7 non-blocking follow-ups addressed |
| #60 | #52 | Lab 4 Actions Taken Foundation (Model, Migration, Seed, APIs) | `feature/lab4-actions-foundation` | Merged — 1 blocking (envelope) + follow-ups addressed |
| #61 | #53 | Lab 4 Actions Taken UI (Ticket Detail Section) | `feature/lab4-actions-ui` | Merged — 6 follow-ups + warning fallback addressed |
| #62 | #54 | Lab 4 Ticket Workflow (Resolution Gate, Transitions, Concurrency) | `feature/lab4-ticket-workflow` | Merged — claim stamp + 4 notes addressed |
| #63 | #55 | Lab 4 Dashboards API (Requester + Staff Metrics) | `feature/lab4-dashboards-api` | Merged — drill-downs + 4 notes addressed |
| #64 | #56 | Lab 4 Dashboards UI (Requester + Staff Pages) | `feature/lab4-dashboards-ui` | Merged — 7 points addressed |
| #65 | #57 | Lab 4 E2E Tests, Hardening and Visual Evidence | `feature/lab4-e2e-hardening` | Merged — edit step + base + ticketUpdatedAt addressed |

### Reviews Received — Details

- **PR #59 (Spec contract):** Approved, no blockers. 7 non-blocking follow-ups, all addressed pre-merge: requester list on `GET /api/tickets/:id/actions`, DELETE locked to 405 + Allow, BR-03 UTC/Bangkok, PERF-01 + MIG-03 added, concurrent-create semantics, PATCH flip clears note, seed BR-12 bypass documented.
- **PR #60 (Actions foundation):** 1 blocking change — response envelope mismatch (code returned bare arrays with flat performer; spec locked `{ items }` + nested `performedBy`). Aligned code to spec. Follow-ups: DELETE 405 `METHOD_NOT_ALLOWED`, matrix fix (requester DELETE = 403 via guard), extra tests (both-win, spoof-ignore, BR-02, 404/400 stamps, real actionId). Re-review found one nit (BR-07 wording sync), fixed.
- **PR #61 (Actions UI):** 6 follow-ups: STYLE-03 test added, `--tg-warning` verified, conflict reload refetches actions, reset clears banner, counters via `aria-describedby`, placement locked in ui-spec. Follow-up verifier asked for a var fallback — added a color fallback to the warning badge rule.
- **PR #62 (Workflow):** 1 blocking-adjacent fix — claim path lacked the stamp (two-staff claim race); threaded optional stamp through claim + `updatedAt` on no-op branches. Notes: BR-11 best-effort wording, RREG-02 exception recorded, WF-05 rescoped.
- **PR #63 (Dashboards API):** 1 blocking fix — metric drill-downs incomplete (requester metrics had none; byStatus/byItPriority lacked per-key links). Added + spec examples synced. Notes: resolved30d boundary test, ownedByMe cross-check, 403-precedence test + doc, unassigned-terminal documented.
- **PR #64 (Dashboards UI):** 7 points: recently-resolved section rendered, unused imports removed (`npm run build` green), BR-16 example fixed with contract line cites, aria-labels on View links, dashboard loading skeleton, forbidden/breakdown-href tests added.
- **PR #65 (E2E):** 3 fixes: E2E-06 edit round-trip added, base-freshness verified (my 125/126 report was a reporting error; real suite 134/135), `ticketUpdatedAt` API assertions added.

## Pull Requests I Reviewed (in ssiriwan's repository, ssiriwan/toktickit)

| PR | Issue | Title | Branch | My review |
| --- | --- | --- | --- | --- |
| #46 | #45 | Sprint 4 Contract & Test Plan | `feature/45-spec-contract` | Commented — solid contract; noted missing transition table, DELETE 403-vs-404, ordering tie-break |
| #48 | #47 | Actions Taken foundation | `feature/47-actions-foundation` | Commented — lifecycle inconsistency, Date-path future check, duplicated result validation, ordering tie-break, seed key |
| #50 | #49 | Actions Taken UI in Ticket Detail | `feature/49-actions-taken-ui` | Commented — attachmentNotes cap, silent directory failures, spoofable performerId, rowBusy slot |
| #52 | #51 | Role dashboards API | `feature/51-dashboards-api` | Commented — window bounds untested at API level, DB-dependent priority ordering, mock dead branch, p95-on-n5 |
| #54 | #53 | Role dashboards UI | `feature/53-dashboards-ui` | Commented — real bug: stale drill-down filters on same-mount navigation; plus unfiltered landing, sort-only link, admin-strip guard |
| #56 | #55 | Ticket workflow hardening and resolution gate | `feature/55-ticket-workflow` | Commented — error-rename check, required-stamp migration check, fail-open catch, UI-06 filter scope |
| #58 | #57 | Final hardening, regression, screenshots, and release prep | `feature/57-final-release` | **Approved** with 5 merge-gate notes (fail-closed catch, E2E-02 rows, retries/trace, gitignore check, CI + PNG verification) |

> This file is updated continuously as reviews happen.

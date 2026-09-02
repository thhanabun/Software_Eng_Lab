# Lab 2 — Peer Review Record

**Author:** Thanaboon Tikaew<student id></student> — GitHub: @thhanabun
**Peer reviewer:** Siriwan Yindeepot<student id></student> — GitHub: @ssiriwan

## Pull Requests I authored (reviewed by my partner)

| PR  | Issue                 | Reviewer feedback (from GitHub thread)                                                                                                                                                                                                                                                                                                                                                                     | Status at merge |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| #19 | #11 Spec (docs)       | "checked against the labsheet and all 11 sections are there. Good job on the AC traceability table." + 5 clarification points: POST header-vs-body `requesterId` conflict, inactive-requester row in the header matrix, boundary tests in tests.md, naming the 4 categories in BR-27, and the data source of Ticket Date.                                                                                     | Merged 25 Aug. Clarifications resolved in the docs; boundary-value tests and the GET inactive-requester matrix row carried as follow-ups. |
| #20 | #12 Data model        | "models, migration, seed and GET /api/requesters all match the specs approved in PR #19" + 3 fix requests: (1) tests must seed their own data, (2) `@@index([ticketId])` or documented justification for Attachment FK, (3) seed upserts must not revert manual deactivations.                                                                                                                               | Merged 31 Aug. (1) covered from Issue #15 tests onward (self-seeding fixtures); (2) and (3) recorded as open items below. |
| #21 | #13 UI foundation     | "well-structured, clean PR… Route guard + layout routes is idiomatic… CSS tokens match ui-spec" — detailed approval, no required changes.                                                                                                                                                                                                                                                                   | Approved & merged 1 Sep. |
| #22 | #14 Create ticket     | "Clean code, matches spec, all tests green (server 18/18, client 21/21)." Plus iteration feedback during manual testing (attachment UX, centered panel, non-blocking notices).                                                                                                                                                                                                                             | Approved & merged 1 Sep. |
| #23 | #15 My Tickets list   | "Looks good to me… Ownership enforced, search escaping, whitelisted sort with SQL CASE rank, parameterized `Prisma.join` — no injection risk, URL-based filter state, distinct UI states. 👍🌟"                                                                                                                                                                                                            | Approved & merged 1 Sep. |
| #24 | #16 Detail/attachments | Under review. Author logged two progress notes in-thread: AC-30 two-step upload in the Create flow (commit 33ad3fd) and the "Failed to fetch" fix where a 409 was answered before the multipart body was drained (commit 8523eaa). | Open |

Reviewer comments I received: the spec and schema PRs drew concrete, actionable requests (listed above); the feature PRs (#21–#23) were approved with specific technical highlights.
How I responded: I fixed review items in-thread before merging where they were blocking, added the tests/fixtures they asked for in later PRs, and kept the remaining suggestions as an explicit follow-up list (below) to close in Issue #18.

## Open review items to close in Issue #18

1. `Attachment.ticketId` — add `@@index([ticketId])` or document the justification in specification.md §7 (PR #20, item 2).
2. `seed.ts` — upsert `update` blocks currently re-force `active`, silently reverting manual deactivation (PR #20, item 3).
3. tests.md — add explicit boundary cases (120/121 summary, 2000/2001 description, 5/6 attachments) (PR #19, item 3).
4. api-spec.md — header behavior matrix should state GET-endpoint behavior for an inactive requester explicitly (PR #19, item 2).

## Pull Requests I reviewed for my partner

Partner's repository: https://github.com/ssiriwan/toktickit

| PR  | Title                                                 | My Comment                                                                                                     | Partner's Response |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------ |
| #11 | Lab 2 Issue 3: Sprint Specification and Test Plan     | "contract look good, the specifications is OK."                                                                | Approved and merged |
| #13 | Lab 2 Issue 2: Database Schema and Seed Data          | "Requester/Ticket/Attachment schema has all must-have fields. Prisma model matches SQL. Seeding script lgtm. Seeding data test works." | Approved and merged |
| #15 | Lab 2 Issue 3: Requester Context and Dev Requester Selection | (review pending — PR open)                                                                                     | — |

# Lab 2 — AI Use Record

**Tooling used:** [opencode](https://opencode.ai) CLI coding agent, powered by Anthropic **Claude** (Sonnet/Opus-class models), used both as the *specification agent* (drafting and refining the engineering contract) and the *coding agent* (implementation, tests, debugging). GitHub CLI (`gh`) was driven through the agent for Issues, Projects board, and Pull Requests.

All generated documents and code were reviewed, corrected, and approved by the student. The agent never merged a Pull Request on its own; every merge followed explicit human approval after peer review.

## Selected Key Prompts

| # | Prompt (condensed) | Why it mattered / Result |
|---|--------------------|--------------------------|
| 1 | "Read the Lab 2 labsheet and list ambiguities, conflicts, dependencies and a proposed issue breakdown before writing any code." | Produced the 8-issue decomposition (#11–#18) with branch names and dependency order; enforced Spec-DD-first. |
| 2 | "Draft specification.md sections 1–11 per the labsheet template — numbered FR/BR/AC, DoD — resolving every labsheet choice, not copying the handout." | Base of the engineering contract; peer review (PR #19) then caught 5 real gaps we fixed before any implementation. |
| 3 | "Write ui-spec.md for the Zen Green theme: exact color tokens from the handout, screen layouts, states, responsive rules, accessibility, and a visual checklist." | Kept CSS implementation measurable; STYLE-01 test asserts against it. |
| 4 | "Plan tests.md first: unit/API/UI/responsive/E2E with an AC traceability matrix and real file paths; every AC maps to ≥1 test." | The plan drove TDD per issue; final audit added the missing boundary row (API-04b). |
| 5 | "Implement POST /api/tickets test-first (API-03..06), backend-only Ticket Number with daily sequence and collision retry." | RED→GREEN cycle per ticket number; UNIT-01 covers the generator. |
| 6 | "The Create form must survive an API failure without losing typed values, and double-submit must be impossible." | Busy-state disabled submit + value retention; UI-08/UI-10 lock it in. |
| 7 | "gh project item-edit silently updates the wrong field — find the reliable way to move Kanban cards." | Diagnosed the CLI bug; switched to GraphQL with inline literals (board updates now verified by response body). |
| 8 | "Users report the 6th attachment upload shows 'Failed to fetch' instead of the 409 message — find the real cause." | Root cause: 409 answered before multer drained the multipart body → Node reset the connection. Fixed by parsing first and cleaning the temp file (PR #24). |
| 9 | "Create Ticket says it can attach files but nothing is uploaded — is that a requirement gap?" | Re-read BR-22/AD-11/AC-30, admitted the gap, and implemented the two-step create→sequential upload with per-file failure reporting (UI-24). |
| 10 | "Audit the code line by line against the labsheet — do not skip details — and fix what is missing." | Found two real misses: boundary tests (§9.2) and the required per-screen screenshot folders (§12); fixed in PR #26. |

## My Reflection

Lab 2 showed me that the agent is fast at code but only as good as the contract it is given.
Every time we skipped a detail in the specification, the implementation quietly skipped it
too — the attachment upload at creation time being the clearest example. The habit that paid
off most was making the agent prove completion with evidence (failing test first, then green,
then traceability), not with claims. The "Failed to fetch" bug also taught me that an AI can
describe a mechanism confidently (409 Conflict) while the real HTTP behavior differs — manual
testing still catches what suites pass by agreement with themselves. My role stayed: decide,
verify, and review every file and migration before merge.

# Lab 4 AI Use

LLM: Muse Spark (via opencode). Human-approved merges; reviewer ssiriwan. Workflow: plan in plan-mode, implement per-issue on feature branches, push + PR comment without merging (peer merges).

## Key prompts

1. "Read SE+Lab+4.pdf and produce a Lab 4 issue breakdown (#51–#58) following the Lab 3 gitflow, then ask locking questions for the ambiguous decisions."
2. "Write docs/lab-04/specification.md covering locked decisions: minimal action model, resolution gate ≥1 action, optimistic updatedAt, requester read-only, handout dashboards."
3. "Implement the ActionTaken Prisma model + migration + seed + staff/requester APIs with the spec's validation, flip-clear, and both-win semantics."
4. "Align action responses to the spec envelope ({ items } + nested performedBy) and add the missing contract tests."
5. "Add the resolution gate + optional stamps to status/assign/priority/claim without breaking Lab 3 regression tests."
6. "Build requester + staff dashboard endpoints as backend aggregates with drill-downs, then role-routed pages."
7. "Write E2E-06/07/08 + screenshot specs; diagnose the refresh-race 409 and the hardcoded-fallback message bugs the runs exposed."
8. "Fill tests.md Final, reviewer.md, ai-use.md, README, capture evidence screenshots, and write submission.tex Parts 1–9."

## My Reflection

Spec-agent use: the handout is long and partly contradictory (e.g. §8.3 minimal actions vs Part 6 assign/complete/cancel language), so I used the agent to draft the contract but locked the six ambiguous decisions with human answers first — that upfront step prevented most rework. The reviewer still caught real gaps (requester path placement, DELETE code, missing PERF/MIG tests), which shows spec review by a human remains the highest-value gate.

Coding-agent use: strongest at mechanical translation of spec→code→tests (validation matrices, envelope shapes) and at diagnosing test failures with evidence (the refresh-race needed network-log tracing, not guessing). Weakest at reporting hygiene — it once reported stale suite numbers (125/126) without re-running, which the reviewer caught; I now require fresh full-suite output before every PR comment. Verification approach that worked: run the exact commands from tests.md §5 on the real tree, never trust carried-over numbers.

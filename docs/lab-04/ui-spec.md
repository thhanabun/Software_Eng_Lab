# Lab 4 UI Specification — Zen Green Theme

Lab 4 reuses all Lab 2–3 tokens, components, and conventions. New work: dashboards + Actions Taken section.

## 1. Reused foundation

Color tokens, badges (8 statuses, priorities, roles, owner), form/table/modal/empty/loading/error patterns, and responsive rules (desktop table / mobile cards, no page-level h-scroll at 390px) unchanged. New badges: none (actions use existing comment-card styling; follow-up flag uses `tg-badge-warning`).

## 2. Application shell and role navigation

- New nav item `Dashboard` (`/dashboard`) first for all roles; role-routed: REQUESTER → RequesterDashboard, IT_STAFF/ADMINISTRATOR → StaffDashboard.
- Active-page indication, `current-user`/`current-role` chips, Logout behavior unchanged.

## 3. Screens

### 3.1 Dashboard (role-routed `/dashboard`)
- Metric cards: `tg-card` with label + value + drill-down link (`data-testid=metric-*`); click navigates to the encoded `{base, query}` destination.
- Recent/urgent lists: compact rows (ticket number + summary + status badge + updated) linking to detail screens.
- States: `loading-state` skeletons, `empty-state` zero cards, `forbidden-panel` for wrong role, `error-state` + Retry on API failure.

### 3.2 Staff Ticket Detail — Actions Taken section (`data-testid=actions-section`)
- Placed between ops panel and comments section as a `tg-card`: header + count, list of `tg-comment-card` entries (description, result, performer + timestamp, follow-up badge + note, attachment notes), `actions-empty` when zero.
- Create mode: `Post action` form (description/result textareas with `x/2000` counters, follow-up checkbox gating follow-up note field, attachment-notes input) + save/cancel + busy + field errors + `ops-saved`/`ops-error` feedback.
- Edit mode: inline per-entry `Edit` → same form prefilled + save/cancel; stale save → 409 banner with reload action.
- Requester Ticket Detail: same list, read-only (no form, no edit buttons).

### 3.3 Ticket workflow controls
- Status select lists only matrix-legal targets for the current status; CANCELLED target requires confirm modal; success refreshes the ticket summary status + `updatedAt`; 409 shows reload banner.

## 4. Screen modes and feedback

| Screen | Modes | Feedback |
|---|---|---|
| Dashboard | loading / ready / empty / forbidden / error | skeletons; zero cards; safe panels; retry |
| Actions section | view / creating / editing / saving / conflict | inline form; busy; field errors; 409 reload banner |
| Status control | ready / confirming / saving / conflict | confirm modal; saved tick; reload banner |

## 5. Responsive rules

- Dashboards: 3-column card grid desktop → 2-column tablet → 1-column mobile; lists collapse to cards on mobile.
- Actions section: full-width card; form fields stack on mobile; entries as stacked cards.

## 6. Accessibility

- Cards use semantic headings + link text (not color alone); follow-up flagged with icon + text; status/priority badges keep non-color cues; visible focus on all controls; dialogs `role=dialog aria-modal` with labelled fields; counters announced via `aria-describedby`.

## 7. Visual inspection checklist

- [ ] Tokens/badges consistent with Labs 2–3; no new off-palette colors
- [ ] Metric cards aligned, values formatted, drill-down links obvious
- [ ] Actions entries visually distinct from comments/notes (section header + card style)
- [ ] Validation messages below fields; busy states on all submits
- [ ] No clipping/overlap; no page-level h-scroll at 390px
- [ ] Keyboard-only: dashboard → drill-down → detail → action create completes with visible focus
- [ ] Forbidden/expired-session states safe and readable

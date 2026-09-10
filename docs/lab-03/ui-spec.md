# Lab 3 UI Specification — Zen Green Theme (extensions)

Reference: sheet §7–§8. This spec extends the Lab 2 ui-spec (tokens, buttons, forms, badges, shell, responsive §7, accessibility §8, feedback §9 stay in force) — only new/changed screens and components are defined here.

## 1. Reused foundation (unchanged)

Color tokens, typography, spacing, radius, button variants (primary/secondary/tertiary/destructive/disabled/busy), form controls (editable white vs `--tg-readonly` shading, focus ring, invalid + `aria-live`, red asterisk), responsive breakpoints (desktop ≥992 / tablet 768–991 / mobile <768, no h-scroll), and accessibility rules (labels, focus, keyboard, native selects) all carry over verbatim. New screens must read as the same application.

| Token | Value | Use |
|---|---|---|
| `--tg-primary` | `#006B3C` | App header, primary buttons, strong emphasis |
| `--tg-secondary` | `#0B7A46` | Active tabs/nav, focus accents, links, hover states |
| `--tg-pale` | `#EAF6EF` | Selected rows, success surfaces, subtle section emphasis |
| `--tg-bg` | `#F5F7F6` | Page background |
| `--tg-surface` | `#FFFFFF` | Cards/panels; border `#D8E2DC`, restrained shadow |
| `--tg-text` | `#1F2E28` | Body text (dark charcoal-green, never pure black) |
| `--tg-muted` | `#5C6B63` | Secondary text |
| `--tg-readonly` | `#F1F4EF` | Read-only/system field shading (clearly distinct from editable) |
| `--tg-error` | `#B42318` | Error text + borders |
| `--tg-warning` | `#B54708` | Warning callouts/badges only (never decoration) |
| `--tg-success` | `#067647` | Success text/icons (always paired with text, not color alone) |

## 2. New badges and indicators

| Badge | Values → style |
|---|---|
| Current Status (extended) | NEW → pale green; OPEN → blue-gray (`#E8F0FE` bg, `#175CD3` text); IN_PROGRESS → blue (`#D1E9FF` bg, `#1849A9` text); WAITING_FOR_REQUESTER → amber; RESOLVED → teal-green (`#D3F8DF` bg, `#067647` text); CLOSED → neutral gray; REOPENED → purple (`#EBE9FE` bg, `#5925DC` text); CANCELLED → dark gray strikethrough-free pill |
| IT Priority | identical scale to Requested Priority (LOW gray / MEDIUM pale green / HIGH amber / URGENT red) with a small "IT" prefix tag so the two priorities never confuse |
| Role | REQUESTER → pale green pill; IT_STAFF → blue pill; ADMINISTRATOR → purple pill |
| Owner | staff/admin name chip; unassigned → gray dashed "Unassigned" chip |
| Resolved indication | green check + "Requester confirms resolved" line under the status badge (informational, never a status) |
| Visibility | Public Comment → white cards; Internal Note → amber-tinted (`#FFFAEB` bg, `#B54708` left border) cards with a lock icon + "Internal — staff only" label, so private content is never posted publicly by mistake |

## 3. Application shell and role navigation

- Header: `--tg-primary` bg, TokTickIT identity left; center nav is **role-specific**: Requester → My Tickets + Create Ticket; IT Staff → Ticket Queue; Administrator → User Management. Unauthorized destinations are never linked.
- Right side: authenticated user name + role pill + **Logout** tertiary-on-dark action (replaces the Lab 2 Requester display + Change Requester, both removed).
- Mobile: same collapse behavior as Lab 2; role nav + user menu reachable.
- Guards: `RequireAuth` (no session → `/login`, post-login return-to supported), `RequireRole` (wrong role → safe forbidden panel, never a blank page or a redirect loop), `RequirePasswordChange` (pending flag → only `/change-password` reachable).
- Session expiry/logout: any 401 from `me`/API routes to `/login` with a "session expired" notice; back-button or deep-link after logout re-checks `me` and never renders protected content.

## 4. Screens

### 4.1 Login — `/login`
Centered card (max-width 480px): TokTickIT title; Email + Password fields (labels above, asterisk, autocomplete attrs); **Sign in** primary (busy "Signing in…" while in flight); field + form-level validation below fields; generic failure message ("Invalid email or password") that never distinguishes the cause; deactivated-account message distinct (BR-07); loading state while checking an existing session (already signed in → role home). Keyboard: Enter submits; focus visible.

### 4.2 Change Password — `/change-password`
Centered card: shown forced (pending flag) or voluntary (from user menu). Fields: Current password (omitted in forced-initial mode — the fresh login is the proof), New password (live rule hints: length/letter/digit), Confirm password; **Save new password** primary busy state; success → role home (forced) or back (voluntary) with confirmation text; mismatches/weak passwords blocked client-side AND server-side.

### 4.3 Requester screens (regression + additions)
- Selection screen and Change Requester action: **deleted**. No requester state in localStorage; identity comes from `me`.
- My Tickets (`/tickets`) and Create Ticket (`/tickets/new`): unchanged from Lab 2 except the Requester line now shows the authenticated name (read-only, no switcher).
- Requester Ticket Detail (`/tickets/:id`): Lab 2 read-only grid + attachments **plus**: Owner line, IT Priority badge (read-only), Resolved-indication line, **Public Comments** section (list newest-first + post box with counter 0/2000 + per-error text), and **"Problem appears resolved"** button (visible only in OPEN/IN_PROGRESS/WAITING_FOR_REQUESTER when not yet indicated; confirm inline, then replaced by the confirmation line). No status/priority/owner controls, no notes section — not even hidden placeholders that suggest them.

### 4.4 Staff Ticket Queue — `/staff/tickets`
Toolbar: search input, Status / Category / Requested Priority / IT Priority / Owner (incl. "Unassigned") filters, Sort select, **Clear filters** (when active). Desktop: table — Ticket Number, Summary, Category, Req Priority, IT Priority, Status badge, Owner chip, Last Updated; row/Open action → detail. Column justification (sheet §8.3): Number identifies, Summary describes, Category groups, the two priorities separate requester urgency from operational triage, Status + Owner answer "what state, whose hands", Last Updated shows recent activity while the default oldest-first order gives FIFO triage — Created Date is intentionally omitted from the row but stays visible on Ticket Detail and selectable in the Sort control, so no information is lost by keeping the row narrow; each column earns its width at 1280px and collapses to cards below 768px. Mobile: cards (number + summary top, status/priority badges, owner + updated bottom, Open button ≥44px). Pagination prev/next + indicator + page-size {5,10,25} (AD-07). States: loading skeleton, empty ("No tickets in the system"), no-results ("No matches — Clear filters"), forbidden (wrong role — only via direct URL), failure + Retry. Simple result count line ("23 tickets") — counts only, no dashboard (excluded scope).

### 4.5 Staff Ticket Detail — `/staff/tickets/:id`
Grouped layout (Lab 2 grid extended): requester block (name/email, read-only), classification, both priorities, status badge + resolved-indication line, description, created/updated dates (read-only), attachments (Lab 2 list with a staff **Download** action, otherwise **read-only** — upload/remove stay requester-side; staff never alters evidence).
**Operations panel** (staff/admin only, clearly grouped): Owner row (current chip + Claim button when unassigned/by-other + Assign select with active staff/admin + Unassign), IT Priority select (immediate save + saved confirmation), Status select limited to matrix-legal targets from current status (illegal options never offered; server re-validates; CANCELLED and unassign require a confirm modal per BR-17), each action with busy/success/error feedback.
**Communication**: Public Comments section (post + list) and Internal Notes section (amber/lock styling, post + list) — visually distinct per §2. Validation, 2000-char counters, safe failure text. 404 panel for missing ids; forbidden panel for requesters hitting the route.

### 4.6 Admin User Management — `/admin/users`
One screen: toolbar (search input name/email + single role filter + **Create user** primary right); table (desktop) / cards (mobile): Name, Email, Role pill, Status pill (Active/Deactivated), **Edit** action per row. Create/Edit modal: name, email, role select, active toggle, initial-password field (create + reset only, with rule hints); validation below fields; duplicate-email and safety-rule failures as form-level safe messages. Per-row **Set new password** action (modal with new-password field; confirm consequences text: "user must change it at next login"). Self-row: deactivate toggle disabled with tooltip ("You cannot deactivate your own account"); last-admin row likewise ("System needs at least one active administrator"). Success toasts/text per action; forbidden panel for non-admin direct access; failure + Retry on list load.

## 5. Screen modes and feedback (sheet §8.6)

Create / view / edit modes per screen: **create-capable** — Create Ticket form, requester/staff comment and note post boxes, admin create/edit modal, change-password form; **view-only** — queue table/cards, staff detail information grid, admin user list; **constrained-edit** — staff ops panel (owner, IT Priority, matrix-limited status) and admin row actions (edit, reset password, activate/deactivate). The table below lists runtime states per screen.

| Screen | Modes | Feedback covered |
|---|---|---|
| Login | initial / submitting / failure / inactive / session-check | busy button, generic vs deactivated messages, auto-continue when already signed in |
| Change Password | forced / voluntary / saving / success / failure | rule hints, mismatch/weak blocking, continuation notice |
| Requester tickets | Lab 2 modes + comments/posting + indication confirm | comment errors, indication confirmation line |
| Staff queue | loading / loaded / empty / no-results / failure / forbidden | skeleton, CTAs, clear-filters, retry |
| Staff detail | loading / view / saving (per action) / not-found / forbidden / failure | per-action busy+saved, 404/403 panels, retry |
| User management | loading / loaded / empty / modal create-edit / reset-pw / failure / forbidden | validation, safety-rule messages, success text, retry |
| Shell/guards | authenticated / expired / forbidden / pending-change | login redirect + notice, forbidden panel, forced change route |

## 6. Responsive rules (sheet §8.7 — same as Lab 2)

Desktop ≥992 centered max-width (detail/ops two-column where practical); tablet 768–991 two-column collapsing; mobile <768 stacked, tables → cards, touch targets ≥44px, no page-level horizontal scroll, no clipped labels/overlap/hidden buttons at any viewport.

## 7. Accessibility (same bar as Lab 2)

All controls labeled; modals `role=dialog` with Escape/overlay close and focus trap-return; icon-only actions named; focus always visible; `aria-live` for errors/success/saved confirmations; status conveyed by text + badge (never color alone); internal-vs-public distinction perceivable without color (lock icon + text label); full keyboard flows incl. queue filters, detail ops, and user modal.

## 8. Visual inspection checklist (filled in Issue #35)

| Check | Desktop | Tablet | Mobile |
|---|---|---|---|
| Colors match tokens (§1) | ☐ | ☐ | ☐ |
| Editable vs read-only distinct | ☐ | ☐ | ☐ |
| Validation messages below fields | ☐ | ☐ | ☐ |
| Button hierarchy clear | ☐ | ☐ | ☐ |
| No clipping / overlap | ☐ | ☐ | ☐ |
| No horizontal scroll | ☐ | ☐ | ☐ |
| Status/priority/role/owner badges consistent | ☐ | ☐ | ☐ |
| Public vs Internal visually distinct (lock + tint + label) | ☐ | ☐ | ☐ |
| Role nav correct per role; no unauthorized links | ☐ | ☐ | ☐ |
| Forbidden/expired-session states safe | ☐ | ☐ | ☐ |
| Visible keyboard focus at all viewports | ☐ | ☐ | ☐ |

Screenshot paths: `artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/{desktop,tablet,mobile}.png`

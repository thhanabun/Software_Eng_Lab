# Lab 2 UI Specification — Zen Green Theme

Reference: labsheet §7–§8, Figure 1 (Ticket Detail illustration). This spec is the single visual source of truth for Lab 2 and later labs.

## 1. Color tokens

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

Typography: system font stack; base 16px; headings 600 weight; labels 14px/600 above controls with 4px gap. Spacing scale 4/8/12/16/24/32. Radius 8px cards, 6px inputs/buttons.

## 2. Buttons

| Variant | Style |
|---|---|
| Primary | `--tg-primary` bg, white text; hover `--tg-secondary` |
| Secondary | white bg, `--tg-primary` border + text |
| Tertiary | text-only `--tg-secondary`, underline on hover |
| Destructive | white bg, `--tg-error` border + text (attachment Remove) |
| Disabled | gray bg/text, `cursor: not-allowed`, cannot activate |
| Busy | primary with spinner + "Submitting…", disabled while in flight (8.3) |

Visible text always; icon-only controls need `aria-label` + tooltip. Touch targets ≥ 44px on mobile.

## 3. Form controls

- Editable: white bg, border `#9AA8A0`, radius 6px, consistent height 40px (Description textarea taller, vertical-resize only).
- Read-only/system: `--tg-readonly` shading, no border focus, `readonly`/`disabled` semantics.
- Focus: 2px `--tg-secondary` outline, always visible for keyboard users.
- Invalid: `--tg-error` border + message directly below the field; `aria-invalid="true"`; message container `aria-live="polite"`.
- Required: red asterisk after label — never replaces the validation message.
- Labels above controls, consistent weight/spacing (8.3).

## 4. Badges

| Badge | Values → style |
|---|---|
| Requested Priority | LOW → neutral gray; MEDIUM → pale green (`--tg-pale`, dark green text); HIGH → amber (`#FEF0C7` bg, `--tg-warning` text); URGENT → red (`#FEE4E2` bg, `--tg-error` text) |
| Current Status | NEW → pale green pill |
| Attachment | Active → none; Removed → gray pill "Removed" |

## 5. Application shell and navigation

- Header: `--tg-primary` bg, white "TokTickIT" identity left; nav links **My Tickets**, **Create Ticket**; active page = white text + underline/`--tg-pale` accent bar; right side: current Requester name + **Change Requester** tertiary-on-dark action.
- Mobile <768px: nav collapses to hamburger menu or stacked bar; all items reachable; active indication preserved.
- No selected Requester → any ticket route redirects to `/select-requester` (AC-02).

## 6. Screens

### 6.1 Requester Selection — `/select-requester`
Centered card (max-width 480px): TokTickIT title; explanation text: *"Select a Development Requester to test requester-specific ticket behavior. This is not a login screen. Authentication and role-based access will be introduced in Lab 3."*; Requester dropdown (active requesters from API); **Continue** primary button (disabled until selection).
States: loading (spinner in card), empty ("No active Requesters — run the seed"), API failure (safe message + Retry). Keyboard-accessible; responsive.

### 6.2 Create Ticket — `/tickets/new`
Card layout, max-width 1080px centered.
- **System section (read-only, top):** Ticket Number ("— assigned after submit"), Ticket Date ("—"), Requester (selected name).
- **Classification:** Category select, Related System select, Requested Priority select (grouped row on desktop).
- **Details:** Summary (single input, counter 0/120), Description (textarea, counter 0/2000) — full width.
- **Attachments:** file picker (permitted types hint text), selected-file list with per-file size + remove, per-file error text (type/size).
- **Actions (bottom):** Submit (primary, busy state), Cancel (secondary → My Tickets).
- **Success panel:** pale green, check icon + text, generated Ticket Number prominent, next actions: View ticket / Create another.
- **Failure banner:** safe error message; form values preserved (BR-13).

### 6.3 My Tickets — `/tickets`
Toolbar row: search input, Category filter, Status filter, Priority filter, Sort select, **Clear filters** (visible only when active), **Create Ticket** primary right.
Desktop ≥768px: table — Ticket Number, Summary, Category, Status badge, Priority badge, Last Updated; row click/View opens detail.
Mobile <768px: ticket cards (number + summary top, badges + updated bottom).
Pagination: prev/next + page indicator + page-size select {5,10,25}.
States: loading (skeleton/spinner), **empty** (no tickets at all → "Create your first ticket" CTA), **no-results** (filters active → "No matches — Clear filters"), failure (safe message + Retry).

### 6.4 Requester Ticket Detail — `/tickets/:id`
Read-only header grid (system values shaded `--tg-readonly`): Ticket Number, Ticket Date, Requester, Category, Related System, Requested Priority badge, Current Status badge, Summary, Description.
**Attachments section** (visually separate): Upload button + hidden file input; list rows: filename, size, uploaded date, status; per-row Download (active only) and Remove (destructive). Removed rows: gray "Removed" pill + reason + date, no download.
Remove confirmation: modal with required reason textarea (1–200 chars) + Confirm/Cancel.
Not-owned/missing ticket: safe 404 panel ("Ticket not found") with back link.
No Public Comments, Internal Notes, Actions Taken, or status controls (excluded scope).

## 7. Responsive rules (labsheet §8.7)

| Viewport | Behavior |
|---|---|
| Desktop ≥ 992px | Multi-column layout; content centered, max-width 1080px |
| Tablet 768–991px | Two-column where practical; Summary/Description keep width |
| Mobile < 768px | Fields stack vertically; touch-friendly buttons ≥44px; no horizontal page scroll |
| All sizes | No clipped labels, overlapping messages, hidden buttons, or unreadable attachment names |

## 8. Accessibility

- Every control labeled (`htmlFor`/`aria-label`); icon-only buttons have tooltip + accessible name.
- Visible focus indicators; full keyboard flow (Tab/Enter/Space/Escape closes modal).
- Error/success announcements via `aria-live`; success never relies on color alone.
- Dropdowns are native `<select>` (keyboard support free).

## 9. Screen modes and feedback (8.6)

| Screen | Modes | Feedback covered |
|---|---|---|
| Selection | initial / loading / loaded / empty / failure | spinner, dropdown, empty note, retry |
| Create Ticket | create / submitting / success / failure | busy button, field messages, success panel, preserved values |
| My Tickets | loading / loaded / empty / no-results / failure | skeleton, CTA, clear-filters, retry |
| Ticket Detail | loading / view / not-found / failure | spinner, read-only grid, 404 panel, retry |
| Attachments | idle / uploading / active / invalid / removed / unavailable | progress note, badges, per-file errors |

## 10. Visual inspection checklist (filled in Issue 7)

| Check | Desktop | Tablet | Mobile |
|---|---|---|---|
| Colors match tokens | ☐ | ☐ | ☐ |
| Editable vs read-only distinct | ☐ | ☐ | ☐ |
| Validation messages below fields | ☐ | ☐ | ☐ |
| Button hierarchy clear | ☐ | ☐ | ☐ |
| No clipping / overlap | ☐ | ☐ | ☐ |
| No horizontal scroll | ☐ | ☐ | ☐ |
| Badges consistent | ☐ | ☐ | ☐ |
| Filters/pagination usable | ☐ | ☐ | ☐ |

Screenshot paths: `artifacts/lab-02/screenshots/create-ticket/`, `artifacts/lab-02/screenshots/my-tickets/`, `artifacts/lab-02/screenshots/ticket-detail/` (desktop/tablet/mobile each).

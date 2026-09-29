# Lab 4 API Specification

Base URL: `/api` · JSON · Auth: session cookie `toktickit_session`. All Labs 2–3 endpoints unchanged. Conventions (safe error shape, codes, safe user) per Lab 3 api-spec §0; Lab 4 adds code `CONFLICT` (409) for stale updates alongside existing email/admin/claim conflicts.

## 1. Actions Taken

Path does not imply authorization: the requester path and the staff path below enforce identical role/ownership rules server-side.

### GET /api/tickets/:id/actions — requester list (role: REQUESTER on owned tickets; staff/admin may also call it)
- **200** `{ items: [{ id, description, result, performedBy: {id,name}, followUpRequired, followUpNote, attachmentNotes, createdAt, updatedAt }] }` newest-first, full entries, read-only. Non-owned (requester) → 404; anonymous → 401; missing ticket → 404.

### GET /api/staff/tickets/:id/actions — staff list (roles: IT_STAFF, ADMINISTRATOR)
- **200**: same shape as above, any ticket. Requester calling this path → 403 (use the requester path). Anonymous → 401; missing ticket → 404.

### POST /api/staff/tickets/:id/actions — create (roles: IT_STAFF, ADMINISTRATOR)
Body: `{ "description", "result", "followUpRequired": bool, "followUpNote"?, "attachmentNotes"?, "expectedUpdatedAt"? }`.
- Validation (BR-04..06): description/result 1–2000 trimmed; follow-up coupling; attachmentNotes ≤500. Violations → **400** with field `details`.
- Performer + timestamp from server/session (client values ignored; stored UTC). CANCELLED ticket → **400**. Concurrent creates without stamp: both rows win in creation order; ticket `updatedAt` advances to the latest write. **201** with the entry.

### PATCH /api/staff/tickets/:id/actions/:actionId — edit (roles: IT_STAFF, ADMINISTRATOR)
Body subset of create fields + required `expectedUpdatedAt` (ticket-level stamp).
- Stale (`expectedUpdatedAt` ≠ current ticket `updatedAt`) → **409** `CONFLICT`. Unknown action → 404. Same validation as create. Flipping `followUpRequired` `true`→`false` clears the stored note; `false`→`true` requires a note in the same call. **200** with updated entry; ticket `updatedAt` advances.

### DELETE on any action path — forbidden
- Authenticated staff/admin reach the handler: **405** `METHOD_NOT_ALLOWED` with `Allow: GET, POST, PATCH`. Single locked behavior (no 404/405 split). Requesters never reach it — the staff route guard rejects them with 403 first (see matrix).

## 2. Ticket Workflow (extends Lab 3 §4)

### PATCH /api/staff/tickets/:id/status — transition + gate + concurrency
Body: `{ "status", "expectedUpdatedAt"? }` (stamp checked when present, skipped when absent — Lab 3 backward compat; UI always sends it).
- Matrix check (BR-09) → off-matrix **400**. Gate check (`* → RESOLVED` with zero actions) → **400** `VALIDATION_ERROR` `"Ticket must have at least one recorded action before resolving"`. Stale stamp → **409**. Requester → 403. **200** with updated `{ currentStatus, updatedAt }`.

### POST /api/staff/tickets/:id/assign, PATCH /:id/priority, POST /:id/claim
- Accept optional `expectedUpdatedAt`; stale → **409** (covers the two-staff same-ticket claim race). Absent stamp skips the check. All other Lab 3 behavior unchanged; `updatedAt` now returned on all three (including no-op branches) so client stamps never go stale.

## 3. Dashboards

### GET /api/dashboard/requester — owned summary (role: REQUESTER; staff/admin calling → 403 use staff endpoint)
**200**:
```json
{
  "metrics": {
    "open": 3, "waitingForRequester": 1, "resolved30d": 2,
    "drillDown": {
      "open": { "base": "/tickets", "query": "" },
      "waitingForRequester": { "base": "/tickets", "query": "?status=WAITING_FOR_REQUESTER" },
      "resolved30d": { "base": "/tickets", "query": "?status=RESOLVED" }
    }
  },
  "recentUpdated": [{ "id": 7, "ticketNumber": "TKT-..", "summary": "..", "currentStatus": "OPEN", "updatedAt": "..", "drillDown": { "base": "/tickets", "query": "?sort=updatedAt:desc" } }],
  "recentResolved": [ ... ],
  "attention": [{ "id": 9, "reason": "WAITING_FOR_REQUESTER", "drillDown": { "base": "/tickets/9", "query": "" } }]
}
```
- Definitions: `open` = status ∈ {NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED} owned; `waitingForRequester` = owned WAITING_FOR_REQUESTER; `resolved30d` = owned RESOLVED/CLOSED updated in last 30 UTC days; recents top-5 by `updatedAt` desc. Empty → zeros + `[]`. Every metric card carries a `drillDown` (BR-16).

### GET /api/dashboard/staff — operational summary (roles: IT_STAFF, ADMINISTRATOR)
**200**:
```json
{
  "metrics": {
    "unassigned": 4, "ownedByMe": 2,
    "byStatus": { "NEW": 3, "OPEN": 2, "IN_PROGRESS": 1, "WAITING_FOR_REQUESTER": 1, "RESOLVED": 2, "CLOSED": 5, "REOPENED": 0, "CANCELLED": 1 },
    "byItPriority": { "URGENT": 1, "HIGH": 2, "MEDIUM": 3, "LOW": 1 },
    "drillDown": {
      "unassigned": { "base": "/staff/tickets", "query": "?owner=unassigned" },
      "ownedByMe": { "base": "/staff/tickets", "query": "?owner=mine" },
      "byStatus": { "NEW": { "base": "/staff/tickets", "query": "?status=NEW" }, "...": "one link per status" },
      "byItPriority": { "URGENT": { "base": "/staff/tickets", "query": "?itPriority=URGENT" }, "...": "one link per priority" }
    }
  },
  "recentUpdated": [ ... top-5 with drillDown to /staff/tickets/:id ... ],
  "urgentUnassigned": [ ... top-5 URGENT/HIGH unassigned ... ],
  "userCounts": { "requesters": 5, "staff": 3, "admins": 1, "inactive": 2 }
}
```
- `userCounts` included only for ADMINISTRATOR callers. Requester role → 403. Empty → zeros + `[]`.
- `unassigned` counts tickets with NULL owner across **all** statuses including terminal ones (intentional — the card answers "who owns this", not "what needs work").
- Middleware order on both dashboard routes is role-before-freshness (same as Lab 3 `staffOnly`): a must-change session calling the wrong dashboard gets 403 (role), not `PASSWORD_CHANGE_REQUIRED` — intended.

## 4. Authorization matrix (Lab 4 delta; Lab 3 §6 still holds)

| Operation | Anonymous | Requester | IT Staff | Administrator |
|---|---|---|---|---|
| list actions (either path) | 401 | own tickets only (else 404) | allow (any) | allow (any) |
| create/edit actions | 401 | 403 | allow | allow |
| delete actions (staff path) | 401 | 403 (staff route guard rejects before the 405 handler) | 405 + Allow | 405 + Allow |
| status/assign/priority (+gate, +409) | 401 | 403 | allow | allow |
| requester dashboard | 401 | allow (own) | 403 | 403 |
| staff dashboard | 401 | 403 | allow (no userCounts) | allow (+ userCounts) |

## 5. Validation failure examples

```json
HTTP 400
{ "error": { "code": "VALIDATION_ERROR", "message": "Follow-up note is required when follow-up is needed", "details": [ { "field": "followUpNote", "message": "Required when followUpRequired is true" } ] } }
```

```json
HTTP 400
{ "error": { "code": "VALIDATION_ERROR", "message": "Ticket must have at least one recorded action before resolving" } }
```

```json
HTTP 409
{ "error": { "code": "CONFLICT", "message": "Ticket was updated by another user; reload and retry" } }
```

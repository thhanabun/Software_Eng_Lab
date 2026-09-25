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

### DELETE on any action path — forbidden (all roles)
- **405** with `Allow: GET, POST, PATCH`. Single locked behavior (no 404/405 split).

## 2. Ticket Workflow (extends Lab 3 §4)

### PATCH /api/staff/tickets/:id/status — transition + gate + concurrency
Body: `{ "status", "expectedUpdatedAt" }`.
- Matrix check (BR-09) → off-matrix **400**. Gate check (`* → RESOLVED` with zero actions) → **400** `VALIDATION_ERROR` `"Ticket must have at least one recorded action before resolving"`. Stale stamp → **409**. Requester → 403. **200** with updated `{ currentStatus, updatedAt }`.

### POST /api/staff/tickets/:id/assign, PATCH /:id/priority
- Accept optional `expectedUpdatedAt`; stale → **409**. All other Lab 3 behavior unchanged.

## 3. Dashboards

### GET /api/dashboard/requester — owned summary (role: REQUESTER; staff/admin calling → 403 use staff endpoint)
**200**:
```json
{
  "metrics": { "open": 3, "waitingForRequester": 1, "resolved30d": 2 },
  "recentUpdated": [{ "id": 7, "ticketNumber": "TKT-..", "summary": "..", "currentStatus": "OPEN", "updatedAt": "..", "drillDown": { "base": "/tickets", "query": "?sort=updatedAt:desc" } }],
  "recentResolved": [ ... ],
  "attention": [{ "id": 9, "reason": "WAITING_FOR_REQUESTER", "drillDown": { "base": "/tickets/9", "query": "" } }]
}
```
- Definitions: `open` = status ∈ {NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED} owned; `waitingForRequester` = owned WAITING_FOR_REQUESTER; `resolved30d` = owned RESOLVED/CLOSED updated in last 30 UTC days; recents top-5 by `updatedAt` desc. Empty → zeros + `[]`.

### GET /api/dashboard/staff — operational summary (roles: IT_STAFF, ADMINISTRATOR)
**200**:
```json
{
  "metrics": {
    "unassigned": 4, "ownedByMe": 2,
    "byStatus": { "NEW": 3, "OPEN": 2, "IN_PROGRESS": 1, "WAITING_FOR_REQUESTER": 1, "RESOLVED": 2, "CLOSED": 5, "REOPENED": 0, "CANCELLED": 1 },
    "byItPriority": { "URGENT": 1, "HIGH": 2, "MEDIUM": 3, "LOW": 1 }
  },
  "recentUpdated": [ ... top-5 with drillDown to /staff/tickets/:id ... ],
  "urgentUnassigned": [ ... top-5 URGENT/HIGH unassigned ... ],
  "userCounts": { "requesters": 5, "staff": 3, "admins": 1, "inactive": 2 }
}
```
- `userCounts` included only for ADMINISTRATOR callers. Requester role → 403. Empty → zeros + `[]`.

## 4. Authorization matrix (Lab 4 delta; Lab 3 §6 still holds)

| Operation | Anonymous | Requester | IT Staff | Administrator |
|---|---|---|---|---|
| list actions (either path) | 401 | own tickets only (else 404) | allow (any) | allow (any) |
| create/edit actions | 401 | 403 | allow | allow |
| delete actions | 405 (all roles) | 405 (all roles) | 405 (all roles) | 405 (all roles) |
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

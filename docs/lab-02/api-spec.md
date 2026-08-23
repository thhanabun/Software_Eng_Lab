# Lab 2 API Specification

Base URL: `/api` · Content type: JSON unless noted · Ownership header: `X-Requester-Id` (integer id of the selected Development Requester). This header is a **testing mechanism, not authentication** (BR-03); Lab 3 replaces it.

## 0. Conventions

### Safe error shape (all endpoints, BR-26)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable safe message",
    "details": [ { "field": "summary", "message": "Summary is required" } ]
  }
}
```

No stack traces, SQL, file paths, or internal identifiers are ever exposed. Unexpected failures → `500` with `code: "INTERNAL_ERROR"` and a generic message.

### Error codes used

| code | meaning |
|---|---|
| `VALIDATION_ERROR` | 400 — invalid body/query/header values (with `details`) |
| `NOT_FOUND` | 404 — missing or non-owned resource (no existence leakage, BR-25/BR-08) |
| `CONFLICT` | 409 — attachment limit reached / already removed |
| `UNSUPPORTED_MEDIA` | 415 — attachment type not permitted |
| `PAYLOAD_TOO_LARGE` | 413 — attachment exceeds 5 MB |
| `GONE` | 410 — attachment removed (download only) |
| `INTERNAL_ERROR` | 500 — unexpected |
| `SERVICE_UNAVAILABLE` | 503 — health check DB unreachable |

### Status code summary (6.4 labsheet requirement)

200 retrieval/update success · 201 creation success · 400 invalid input or missing/invalid `X-Requester-Id` · 404 missing/non-owned resource · 409 conflict (limit reached, already removed) · 410 removed attachment download · 413 oversize upload · 415 unsupported type · 500 unexpected · 503 health dependency down.

---

## 1. Reference data

### GET /api/categories  *(Lab 1, unchanged)*
- **200**: `[ { "id": 1, "name": "Hardware" }, ... ]` ordered by name.
- **500**: safe error if DB unavailable.

### GET /api/related-systems  *(new)*
- Returns **active** related systems only (`active = true`).
- **200**: `[ { "id": 1, "name": "Email" }, ... ]` ordered by name.
- **500**: safe error.

### GET /api/requesters  *(new)*
- Returns **active** Development Requesters only (BR-23).
- **200**: `[ { "id": 1, "name": "Alice Carter", "email": "alice.carter@student.example" }, ... ]` ordered by name.
- **500**: safe error.

---

## 2. Tickets

### POST /api/tickets — create one validated ticket
Request body:

```json
{
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 3,
  "summary": "Laptop battery drains quickly",
  "description": "Battery drops from 100% to 20% within one hour...",
  "requestedPriority": "MEDIUM"
}
```

Validation (BR-09..BR-11, server authoritative):

| field | rule |
|---|---|
| requesterId | required int; must exist and be **active** (inactive → 400, BR-23) |
| categoryId | required int; must exist |
| relatedSystemId | required int; must exist and be **active** |
| summary | required string; trim; 1–120 chars after trim |
| description | required string; trim; 1–2000 chars after trim |
| requestedPriority | required; one of `LOW` `MEDIUM` `HIGH` `URGENT` |

Behavior:
- Ticket Number generated server-side (BR-01): `TKT-{YYYYMMDD}-{seq}` where seq = today's count + 1, zero-padded 4 digits; on unique collision retry up to 5 attempts.
- `currentStatus` set to `NEW` (BR-02); `createdAt`/`updatedAt` set by DB.

Responses:
- **201**:

```json
{
  "id": 12,
  "ticketNumber": "TKT-20260823-0007",
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 3,
  "summary": "Laptop battery drains quickly",
  "description": "Battery drops...",
  "requestedPriority": "MEDIUM",
  "currentStatus": "NEW",
  "createdAt": "2026-08-23T09:14:02.000Z",
  "updatedAt": "2026-08-23T09:14:02.000Z"
}
```

- **400**: `VALIDATION_ERROR` with field-level `details` (no ticket saved).
- **500**: unexpected.

### GET /api/tickets — owned paginated list
Headers: `X-Requester-Id` **required**.

Query parameters:

| param | meaning | default / rules |
|---|---|---|
| `search` | case-insensitive substring on summary + description (BR-15) | optional; empty/whitespace ignored |
| `categoryId` | exact filter | optional int; must exist → else 400 |
| `status` | exact filter | optional; must be valid `TicketStatus` → else 400 |
| `priority` | exact filter | optional; must be valid `RequestedPriority` → else 400 |
| `sort` | `{field}:{dir}` | allowed fields `createdAt` `updatedAt` `summary` `requestedPriority`; dir `asc`/`desc`; default `createdAt:desc`; secondary sort always `ticketNumber:desc` (BR-14); invalid → 400 |
| `page` | 1-based page number | default 1; non-integer or <1 → 400 |
| `pageSize` | items per page | allowed {5, 10, 25}; default 10; else 400 (BR-16) |

Unknown parameters are ignored (BR-16). Priority sort uses severity order URGENT > HIGH > MEDIUM > LOW (AD-09).

Responses:
- **200**:

```json
{
  "items": [
    {
      "id": 12,
      "ticketNumber": "TKT-20260823-0007",
      "summary": "Laptop battery drains quickly",
      "requestedPriority": "MEDIUM",
      "currentStatus": "NEW",
      "categoryId": 2,
      "categoryName": "Hardware",
      "createdAt": "2026-08-23T09:14:02.000Z",
      "updatedAt": "2026-08-23T09:14:02.000Z"
    }
  ],
  "page": 1,
  "pageSize": 10,
  "totalItems": 23,
  "totalPages": 3
}
```

- **400**: missing/invalid `X-Requester-Id`, or invalid query values (safe details).
- **404**: `X-Requester-Id` references a non-existent requester.
- Empty result: 200 with `items: []` (UI decides empty vs no-results, BR-24).

### GET /api/tickets/:id — owned detail
Headers: `X-Requester-Id` required.
- **200**: full ticket object (same shape as POST 201) plus `categoryName`, `relatedSystemName`, `requesterName`, and `attachments` metadata array (see §3).
- **400**: missing/invalid header. **404**: id not a positive integer, ticket missing, or owned by another requester (BR-08, BR-25).

---

## 3. Attachments

Constraints (BR-17): types `jpg/jpeg/png/webp/pdf` (extension **and** MIME checked) · max 5 MB (5,242,880 bytes) · max 5 active per ticket. Storage: `server/uploads/{uuid}.{ext}`, original name kept in metadata only (BR-18).

### POST /api/tickets/:id/attachments — upload
Headers: `X-Requester-Id` required. Body: `multipart/form-data`, single field `file`.

Order of checks: ownership/ticket exists → active-count limit → size → type.

Responses:
- **201**:

```json
{
  "id": 31,
  "ticketId": 12,
  "originalName": "battery-report.png",
  "mimeType": "image/png",
  "sizeBytes": 182443,
  "uploadedAt": "2026-08-23T09:20:11.000Z",
  "removedAt": null,
  "removalReason": null
}
```

- **400**: missing/invalid header or no `file` field.
- **404**: ticket missing or not owned.
- **409**: ticket already has 5 active attachments (`CONFLICT`).
- **413**: file larger than 5 MB (`PAYLOAD_TOO_LARGE`).
- **415**: extension or MIME not permitted (`UNSUPPORTED_MEDIA`).

Failed uploads leave no partial row and no orphaned file (cleanup on error).

### GET /api/tickets/:id/attachments — metadata list
Headers: `X-Requester-Id` required.
- **200**: array of attachment metadata objects, active first then removed, each newest first; removed entries keep `removedAt` + `removalReason` (BR-19).
- **400/404**: as above.

### GET /api/attachments/:id — single metadata
Headers: `X-Requester-Id` required.
- **200**: metadata object. **400**: bad header. **404**: missing/non-owned (a removed attachment still returns metadata here — only download is blocked).

### GET /api/attachments/:id/download — download active file
Headers: `X-Requester-Id` required.
- **200**: binary stream; `Content-Type` = stored MIME; `Content-Disposition: attachment; filename="<originalName>"`.
- **400**: bad header. **404**: missing/non-owned. **410**: attachment soft-removed (`GONE`, BR-19, AD-05).

### DELETE /api/attachments/:id — soft removal
Headers: `X-Requester-Id` required. Body:

```json
{ "reason": "Uploaded wrong screenshot" }
```

- `reason` required, string, 1–200 chars after trim (BR-20) → else 400.
- **200**: updated metadata object with `removedAt` + `removalReason` set.
- **404**: missing/non-owned. **409**: already removed.

---

## 4. Header behavior matrix (ownership, BR-08)

| situation | response |
|---|---|
| `X-Requester-Id` missing or non-integer | 400 `VALIDATION_ERROR` |
| requester id does not exist | 404 `NOT_FOUND` |
| requester inactive on create | 400 `VALIDATION_ERROR` (BR-23) |
| resource belongs to another requester | 404 `NOT_FOUND` (no existence leakage) |

## 5. Validation failure examples

```json
HTTP 400
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Ticket payload is invalid",
    "details": [
      { "field": "summary", "message": "Summary is required" },
      { "field": "requestedPriority", "message": "Requested priority must be LOW, MEDIUM, HIGH, or URGENT" }
    ]
  }
}
```

```json
HTTP 415
{ "error": { "code": "UNSUPPORTED_MEDIA", "message": "Only JPG, PNG, WEBP, or PDF files are allowed" } }
```

```json
HTTP 410
{ "error": { "code": "GONE", "message": "This attachment has been removed and can no longer be downloaded" } }
```

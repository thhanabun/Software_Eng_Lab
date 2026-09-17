# TokTickIT (ตอกติ๊กกิต)

TokTickIT is an IT service desk application for Account and Access, Hardware, Software, and
Network requests. This repository contains the full-stack application built during
**Lab 1: Full-Stack Hello World Starter**, **Lab 2: Requester Ticketing MVP with UI
Foundation**, and **Lab 3: Auth, Roles, and Admin** for CPE 334 - Introduction to Software
Engineering in the Age of AI Agents.

**Lab 2 Sprint Goal:** A Development Requester (temporary testing identity — not login) can
create validated tickets with a backend-generated official Ticket Number, browse their own
tickets with search/filter/sort/pagination, open Ticket Detail, and manage attachments
(upload, download, soft removal) inside a reusable, responsive Zen Green UI.

**Lab 3 Sprint Goal:** Cookie-based authentication with email/password, three roles
(REQUESTER, IT_STAFF, ADMINISTRATOR), staff ticket queue and detail actions (claim,
assign, priority, status transitions, comments, notes), admin user management
(create/edit/reset/deactivate), and a responsive UI following Zen Green design tokens.

## Tech Stack

| Area       | Technology                                                       |
| ---------- | ---------------------------------------------------------------- |
| Frontend   | React + TypeScript + Vite + Bootstrap + React Router             |
| Backend    | Node.js + Express + TypeScript + Multer (uploads)                |
| Database   | PostgreSQL + Prisma ORM                                          |
| Testing    | Vitest + Supertest (unit/API/UI), Playwright (E2E + screenshots) |
| Workflow   | GitHub Issues + Projects Kanban + feature branches + PR review   |

## Repository Structure

```
toktickit/
├── client/                  React + TypeScript + Vite frontend
│   ├── tests/lab-02/        Lab 2 UI tests (Vitest + Testing Library)
│   └── tests/lab-03/        Lab 3 UI tests (Vitest + Testing Library)
├── server/                  Express API + Prisma
│   ├── prisma/              Schema, migrations, idempotent seed
│   ├── src/                 Routers + lib (ticket, auth, staff, admin)
│   ├── uploads/             Attachment files on disk (gitignored)
│   ├── tests/lab-02/        Lab 2 API tests (Supertest)
│   └── tests/lab-03/        Lab 3 API tests (Supertest)
├── e2e/                     Standalone Playwright project (own package.json)
│   ├── lab-02/              E2E flows + responsive screenshot spec
│   └── lab-03/              E2E auth/staff/admin flows + screenshots
├── artifacts/               Generated: Playwright reports + screenshots (gitignored)
├── docs/
│   ├── lab-01/              Lab 1 evidence documents
│   ├── lab-02/              Lab 2 specification, api-spec, ui-spec, tests
│   └── lab-03/              Lab 3 specification, api-spec, ui-spec, tests,
│                            reviewer.md, ai-use.md
└── docker-compose.yml       PostgreSQL 16 container
```

## Prerequisites

- Node.js 20+ and npm
- Docker (with Docker Compose) — runs PostgreSQL
- Git

## Getting Started

### 1. Start PostgreSQL (Docker)

```bash
docker compose up -d
```

This starts PostgreSQL 16 (`toktickit-db`) on port `5432` (user/password/db: `toktickit`).

### 2. Start the backend

```bash
cd server
npm install
cp .env.example .env        # set DATABASE_URL if not using the compose defaults
npx prisma generate
npx prisma migrate deploy   # applies Lab 1 + Lab 2 migrations (Ticket, Attachment, ...)
npm run prisma:seed         # categories, related systems, Lab 2 + Lab 3 users, requester accounts
npm run dev                 # API on http://localhost:3001
```

### 3. Start the frontend

```bash
cd client
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :3001)
```

Open http://localhost:5173 — the app starts on the **Development Requester Selection**
screen (a Lab 2 testing mechanism, not authentication). Pick a requester, then create,
list, and manage tickets and attachments. Attachment files are stored under
`server/uploads/` as `<uuid>.<ext>`; the original filename is kept in the database only.

### 4. Run the tests

```bash
# Backend unit + API tests (needs the PostgreSQL container; uses the dev database)
cd server && npm test

# Frontend component/UI tests
cd client && npm test

# End-to-end + responsive screenshots (starts server & client automatically unless running)
cd e2e && npm install && npx playwright install chromium   # first time only
cd e2e && npx playwright test           # all labs
cd e2e && npx playwright test lab-03    # Lab 3 only
```

E2E output: HTML report in `artifacts/.../playwright-report/`, screenshots in
`artifacts/.../screenshots/`. Lab 3 screenshots are saved to
`artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/`.

## Git Workflow

- `main` — stable release branch
- `lab1-staging`, `lab2-staging`, `lab3-staging` — per-lab integration branches
- `feature/lab2-<topic>`, `feature/lab3-<topic>` — one branch per GitHub Issue; merged into
  the respective staging branch only through a peer-reviewed Pull Request
- At the end of the sprint, one release Pull Request integrates the staging branch into `main`

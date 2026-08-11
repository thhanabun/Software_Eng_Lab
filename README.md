# TokTickIT (ตอกติ๊กกิต)

TokTickIT is an IT service desk application for Account and Access, Hardware, Software, and
Network requests. This repository contains the full-stack foundation built during
**Lab 1: Full-Stack Hello World Starter** for CPE 334 - Introduction to Software Engineering
in the Age of AI Agents.

**Lab 1 Sprint Goal:** Build a tiny but complete vertical slice proving that every layer of the
tech stack works: React UI → Express REST API → Prisma ORM → PostgreSQL.

## Tech Stack

| Area       | Technology                               |
| ---------- | ---------------------------------------- |
| Frontend   | React + TypeScript + Vite + Bootstrap    |
| Backend    | Node.js + Express + TypeScript           |
| Database   | PostgreSQL + Prisma ORM                  |
| Testing    | Vitest + Supertest                       |
| Workflow   | Git Flow (feature branches), GitHub Projects, Pull Requests |

## Repository Structure

```
toktickit/
├── client/              React + TypeScript + Vite + Bootstrap frontend
├── server/              Node.js + Express + TypeScript backend
│   ├── prisma/          Prisma schema, migrations, seed
│   ├── src/             Express application source
│   └── tests/lab-01/    Lab 1 API tests (Supertest)
├── docs/
│   └── lab-01/          Lab 1 documents: tests.md, reviewer.md, ai_use.md
├── docker-compose.yml   PostgreSQL 16 container for local development
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 20+ and npm
- Docker (with Docker Compose) — used to run PostgreSQL
- Git

## Getting Started

### 1. Start PostgreSQL (Docker)

```bash
docker compose up -d
```

This starts a PostgreSQL 16 container named `toktickit-db` on port `5432`
(user: `toktickit`, password: `toktickit`, database: `toktickit`).

### 2. Start the backend

```bash
cd server
npm install
cp .env.example .env   # then edit DATABASE_URL with your real credentials
npx prisma generate    # generate the Prisma client
npm run dev            # http://localhost:3001
```

### 3. Start the frontend

```bash
cd client
npm install
npm run dev            # http://localhost:5173
```

Open http://localhost:5173 in a browser. Click **[Check System]** to call the
backend health check and load the supported request categories from PostgreSQL.

### 4. Run the tests

```bash
# Backend (Supertest API tests)
cd server && npm test

# Frontend (Vitest UI tests)
cd client && npm test
```

## Git Workflow

- `main` — stable release branch (production)
- `lab1-staging` — Lab 1 integration branch
- `feature/<n>-<name>` — feature branches; all work happens here
- Every Pull Request is merged into `lab1-staging` after peer review; `lab1-staging` is
  merged into `main` once Lab 1 is complete.

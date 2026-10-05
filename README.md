# Cerebrum

Cerebrum is a full-stack study platform for subject organization, study schedules, progress tracking, and AI-assisted learning. Its React/Vite frontend uses a Node.js and Express REST API backed by MySQL, with JWT authentication for protected user routes.

**Live demo:** [cerebrum-one.vercel.app](https://cerebrum-one.vercel.app)

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS
- **Backend:** Node.js, Express, MySQL (`mysql2`), JWT, Express sessions
- **AI services:** Python/Flask, Sentence Transformers and FAISS for document retrieval; Hugging Face integration in the backend
- **Deployment:** Frontend on Vercel; backend and MySQL are configured as separate services

## Architecture

The browser frontend calls the Express REST API. The API handles authentication and study workflows and reads/writes relational data in MySQL. AI-assisted features use backend services; document retrieval can use the Python/FAISS service and background indexer.

## REST API

Protected routes require the application's authentication middleware unless otherwise noted. Subject and user administration routes additionally require an admin account.

### Authentication

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/register` | Public |
| POST | `/api/login` | Public |
| POST | `/api/logout` | Public/session-aware |
| POST | `/api/forgot-password` | Public |
| POST | `/api/reset-password` | Public |
| GET | `/api/profile` | Authenticated |

### Users and subjects

| Method | Endpoint | Access |
|---|---|---|
| GET, POST | `/api/users` | Admin |
| PUT, DELETE | `/api/users/:id` | Admin |
| GET | `/api/subjects/minhas` | Authenticated |
| GET | `/api/subjects/disponiveis` | Authenticated |
| GET | `/api/subjects/plan` | Authenticated |
| POST | `/api/subjects/adicionar` | Authenticated |
| POST | `/api/subjects/sugerir` | Authenticated |
| PUT | `/api/subjects/progresso` | Authenticated |
| DELETE | `/api/subjects/remover/:subject_id` | Authenticated |
| GET, POST | `/api/subjects` | Admin |
| PUT, DELETE | `/api/subjects/:id` | Admin |
| GET | `/api/user/progress` | Authenticated |
| GET | `/api/statistics` | Public |

### Schedule

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/cronograma?from=<ISO>&to=<ISO>` | Authenticated |
| POST | `/api/cronograma` | Authenticated |
| PUT, DELETE | `/api/cronograma/:id` | Authenticated |

### AI and service endpoints

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/ai/provider-status` | Authenticated |
| POST | `/api/ai/assistant` | Authenticated |
| POST | `/api/ai/recommendations` | Authenticated |
| POST | `/api/ai/analyze` | Authenticated |
| POST | `/api/ai/quiz` | Authenticated |
| POST | `/api/ai/exercises` | Authenticated |
| POST | `/api/ai/upload` | No route-level auth middleware |
| POST | `/api/ai/chat` | No route-level auth middleware |
| POST | `/api/ai/create-event` | Authenticated |
| GET | `/api/health` | Public |
| GET | `/api/public-config` | Public |
| GET | `/api/debug/session` | Public diagnostic route |

## Database schema

The backend queries these MySQL tables:

- `users`: account identity, email, password hash, role and status.
- `subjects`: subject records (including name, description and creation time).
- `user_progress`: per-user/per-subject study hours, progress and last-studied time.
- `activity_logs`: user activity type, description, JSON metadata and timestamp.
- `events`: user schedule entries with an optional `materia_id` (subject), time range and display metadata.
- `password_reset_tokens`: user-linked hashed reset token, expiry, use time and creation time.
- `ai_documents`, `ai_chats`, `ai_chunks_meta`: document uploads, assistant conversations and chunk metadata.
- `chunks`: SQLite metadata for the Python/FAISS retrieval index, including a document ID.

The code references these relationships: `user_progress.user_id` to `users.id`, `user_progress.subject_id` to `subjects.id`, `events.user_id` to `users.id`, `events.materia_id` to `subjects.id`, and `password_reset_tokens.user_id` to `users.id`. Activity and AI records also carry user/document IDs. These are application-level relationships; do not assume database foreign-key constraints from the checked-in code.

The repository does not include the canonical DDL for the core `users`, `subjects`, `user_progress`, or `activity_logs` tables. The `events` and `password_reset_tokens` tables are created by backend code; the AI tables are defined in `backend/sql/offline_ai_schema.sql` and created by the AI migration command.

> TODO: Add or link the canonical core-table DDL and confirm which relationships are enforced with foreign keys.

## Run locally

Requirements: Node.js, npm, and a MySQL database with the application's core tables available.

1. Configure the frontend. Copy the root `.env.example` to `.env` and point the API origin to the local backend:

   ```env
   VITE_API_ORIGIN=http://localhost:3001
   VITE_DEV_API_TARGET=http://localhost:3001
   ```

2. Install frontend dependencies and start Vite from the repository root:

   ```bash
   npm install
   npm run dev
   ```

3. In a second terminal, configure the backend and start it:

   ```bash
   cd backend
   npm install
   ```

   Copy `backend/.env.example` to `backend/.env` and set at least `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `SESSION_SECRET`, and `CORS_ALLOWED` (use `http://localhost:5173` for local frontend access).

   ```bash
   npm run migrate:ai
   npm run dev
   ```

The frontend runs at `http://localhost:5173`; the API runs at `http://localhost:3001`. `npm run migrate:ai` creates the AI tables only. `events` and `password_reset_tokens` are created by the backend as those features are used; it does not create the core tables. Optional AI/document-retrieval features may need additional variables and the Python service configured in `backend/.env.example`.

## Screenshots

- TODO: Add the dashboard screenshot.
- TODO: Add the subject and progress tracking screenshot.
- TODO: Add the AI-assisted learning screenshot.
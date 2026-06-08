# Personal Task Manager — Backend

A RESTful API backend for the Personal Task Manager application, built with Node.js, Express.js, and PostgreSQL.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm
- Docker & Docker Compose (optional)

---

## Local Development Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL` and other variables as needed.

### 3. Run database migrations

Make sure your PostgreSQL instance is running, then:

```bash
psql $DATABASE_URL -f migrations/001_init.sql
```

Or manually connect to your database and run the SQL in `migrations/001_init.sql`.

### 4. Start the development server

```bash
npm run dev
```

The API will be available at `http://localhost:3001`.

---

## Docker Compose (Recommended)

This will start both the PostgreSQL database and the Node.js API server together.

```bash
docker compose up
```

To run in detached mode:

```bash
docker compose up -d
```

To stop all services:

```bash
docker compose down
```

To stop and remove volumes (resets the database):

```bash
docker compose down -v
```

---

## API Endpoints

| Method | Endpoint                    | Description                        |
|--------|-----------------------------|------------------------------------|
| GET    | /api/tasks                  | Get all tasks (optional filter)    |
| POST   | /api/tasks                  | Create a new task                  |
| PATCH  | /api/tasks/:id/complete     | Mark a task as complete            |

### GET /api/tasks

Query parameters:
- `is_complete` (optional): `true` or `false` to filter by completion status

### POST /api/tasks

Request body:
```json
{
  "title": "My Task",
  "description": "Optional description"
}
```

### PATCH /api/tasks/:id/complete

No request body required. Marks the task with the given ID as complete.

---

## Data Model

### Task

| Field        | Type                          | Notes                  |
|--------------|-------------------------------|------------------------|
| id           | integer                       | Primary key            |
| title        | string (max 255)              | Required               |
| description  | string \| null               | Optional               |
| is_complete  | boolean                       | Default: false         |
| created_at   | timestamp with time zone      | Auto-set on creation   |
| completed_at | timestamp with time zone \| null | Set when completed  |
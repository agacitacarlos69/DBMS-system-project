# EMS — Employee Management System

A small full-stack **Employee Management System** for a 3NF database project. A manager
signs in and performs CRUD (Create, Read, Update, Delete) on employees and the records
around them — management groups, team leads, SMEs, trainings, shifts, rooms, and login
users.


## Tech stack

| Layer    | Technology                                                        |
|----------|-------------------------------------------------------------------|
| Frontend | Static HTML + [Tailwind CSS](https://tailwindcss.com) (Play CDN) + vanilla JavaScript |
| Backend  | [Node.js](https://nodejs.org) + [Express 5](https://expressjs.com) (`server.js`) |
| Database | [PostgreSQL](https://www.postgresql.org) (via the `pg` driver)    |
| Config   | `cors`, `dotenv`                                                  |

Tailwind loads from the Play CDN, so the frontend has **no build step**.

## Project structure

```
DBMS-system-project/
├─ server.js              Express API server (all REST endpoints + PostgreSQL pool)
├─ package.json           Backend dependencies (express, pg, cors, dotenv)
├─ .env                   Database credentials + manager login (NOT committed)
├─ PROJECT_EXPLANATION.md Plain-language tour of the whole system
├─ README.md              this file
└─ src/                   Frontend pages (open in a browser)
   ├─ login.html          Manager login
   ├─ index.html          Dashboard (record counts + combined summary table)
   ├─ employees.html      Employee CRUD
   ├─ management.html     Management CRUD
   ├─ team-leads.html     Team Lead CRUD
   ├─ smes.html           SME CRUD
   ├─ trainings.html      Training CRUD
   ├─ shifts.html         Shift CRUD
   ├─ rooms.html          Room CRUD
   └─ users.html          User CRUD (password write-only)
```

## Prerequisites

- **Node.js** (v18+ recommended)
- A running **PostgreSQL** instance with the EMS tables already created
  (`Employee`, `Users`, `Management`, `Team_Lead`, `SME`, `Training`, `Shift`, `Room`).

## Setup

1. **Install backend dependencies** (from the project root):

   ```bash
   npm install
   ```

2. **Create a `.env` file** in the project root and set the variables below to **your
   own values** (the server reads them via `dotenv`). The actual values are secrets and
   are intentionally not listed here:

   | Variable           | Purpose                                              |
   |--------------------|------------------------------------------------------|
   | `DB_USER`          | PostgreSQL username                                  |
   | `DB_PASSWORD`      | PostgreSQL password                                  |
   | `DB_HOST`          | Database host (e.g. `localhost`)                     |
   | `DB_PORT`          | Database port (e.g. `5432`)                          |
   | `DB_NAME`          | Database name                                        |
   | `PORT`             | Port the API server listens on (defaults to `5000`)  |
   | `MANAGER_USERNAME` | Username for the manager login                       |
   | `MANAGER_PASSWORD` | Password for the manager login                       |

   `.env` is git-ignored, so secrets stay out of source control — **never commit it**.
   If `MANAGER_USERNAME` / `MANAGER_PASSWORD` are omitted, the server falls back to
   built-in defaults defined in `server.js`.

## Run it

1. **Start the backend:**

   ```bash
   node server.js
   ```

   On success you should see:

   ```
   ✅ Connected to PostgreSQL database safely.
   🚀 Server processing requests actively on port 5000
   ```

2. **Open the frontend:** open `src/login.html` in a browser, or serve the `src` folder
   with VS Code Live Server / `python -m http.server`.

3. **Sign in** with the manager credentials you configured in your `.env`.

> The frontend pages call the backend at `http://localhost:5000`. If you change `PORT`,
> update the `const API = 'http://localhost:5000'` line at the top of the `<script>` block
> in each `src/*.html` page.

---

## REST API reference

The backend is implemented in `server.js`. All responses are JSON. The frontend sends an
`Authorization: Bearer <token>` header on every request; on a `401` it clears the token
and redirects to `login.html`.

### Auth

| Method | Path              | Body                      | Response                                                    |
|--------|-------------------|---------------------------|------------------------------------------------------------|
| POST   | `/api/auth/login` | `{ username, password }`  | `200` → `{ token, user: { username, role } }`              |

Validation:

- `400` — if `username` or `password` is missing.
- `401` — if the credentials don't match the single manager account
  (`MANAGER_USERNAME` / `MANAGER_PASSWORD` from `.env`).
- On success it returns a demo token (`mock-jwt-token-xyz-123`) and the user object.

### Resource endpoints

The same four CRUD endpoints exist for each resource:

| Method | Path                    | Description                                  |
|--------|-------------------------|----------------------------------------------|
| GET    | `/api/<resource>`       | List all rows (returns a JSON array)         |
| POST   | `/api/<resource>`       | Create a row (returns the new primary key)   |
| PUT    | `/api/<resource>/:id`   | Update the row with that primary key         |
| DELETE | `/api/<resource>/:id`   | Delete the row with that primary key         |

**Resources:** `employees`, `users`, `management`, `team-leads`, `smes`, `trainings`,
`shifts`, `rooms`.

### Dashboard

| Method | Path                     | Description                                                                 |
|--------|--------------------------|-----------------------------------------------------------------------------|
| GET    | `/api/dashboard/summary` | Up to 30 employees `LEFT JOIN`ed with their management, team lead, SME, training, shift, and room — one row per employee. |

### Error shape

```json
{ "error": "Human-readable database/server error" }
```

The auth endpoint uses `{ "message": "..." }` instead. Resource endpoints return `500`
with `{ error }` on a database failure.

---

## Data model

The database is designed in **Third Normal Form (3NF)**. Relationships:

- An **Employee** belongs to one **Management** group (`employee.mgmt_id`).
- A **Management** group references a **Team Lead**, an **SME**, a **Training**, and a
  **Shift** (`mgmt.tlead_id`, `sme_id`, `training_id`, `shift_id`).
- A **Team Lead** and an **SME** each link back to an **Employee** (`emp_id`).
- A **Training** and a **Shift** each take place in a **Room** (`room_id`).
- A **User** account links to an **Employee** (`emp_id`) and is who you log in as.

### JSON shapes (matching the database columns)

```jsonc
// employee — GET /api/employees
{
  "emp_id": "10009302",
  "mgmt_id": "MG001",
  "full_name": "Jorge Camama",
  "personal_email": "jorge@example.com",
  "contact_number": "9156390467",
  "tenurity": "Repeater",        // New Joiner | Repeater | Returnee
  "role": "Core",                // Core | Project | SME | Team Lead
  "status": "Active"             // Active | Inactive
}

// management
{ "mgmt_id": "MG001", "training_id": "T001", "shift_id": "S001",
  "tlead_id": "TL001", "sme_id": "SME001" }

// team_lead
{ "tlead_id": "TL001", "emp_id": "10008502", "tlead_name": "Aldwin Salameda" }

// sme
{ "sme_id": "SME001", "emp_id": "10008651", "sme_name": "Mark Baguiao" }

// training
{ "training_id": "T001", "room_id": "RM1",
  "training_start": "2026-03-23T21:00:00.000Z",
  "training_end":   "2026-03-24T06:00:00.000Z" }

// shift
{ "shift_id": "S001", "room_id": "RM1", "shift_value": "1",
  "shift_start": "2026-04-09T19:30:00.000Z",
  "shift_end":   "2026-04-11T04:30:00.000Z" }

// room
{ "room_id": "RM1", "room_name": "7th Floor Higantes" }

// user — user_id is server-assigned; send `password` on create/update only
{
  "user_id": 1,
  "emp_id": "10009302",
  "email": "jorge@example.com",
  "password_plain": "<plaintext-on-write>", // demo convenience column
  "date_time_created": "2026-01-15T02:22:00.000Z",
  "password_changed_at": "2026-01-15T02:22:00.000Z"
}
```

On `POST` / `PUT` to `/api/users`, the password is hashed inside PostgreSQL with
`crypt(..., gen_salt('bf'))` (bcrypt, via the `pgcrypto` extension). If no password is
provided on create, the server applies a built-in default password defined in
`server.js`.

---

## Known limitations (student-project scope)

These are honest gaps, not blockers — they're the natural next steps:

- **Login checks one built-in account, not the database.** `/api/auth/login` validates
  against the single `MANAGER_USERNAME` / `MANAGER_PASSWORD` from `.env`; it does not look
  users up in the `Users` table, and the token it returns is a fixed demo string.
- **The token isn't verified server-side.** The frontend sends `Authorization: Bearer
  <token>`, but the resource endpoints don't currently validate it.
- **Plaintext passwords are stored.** The `Users` table keeps both a bcrypt
  `password_hash` and a readable `password_plain` column — convenient for a class demo,
  but not something a production app should do.
- **Deletes are single-table.** The `DELETE` handlers remove only the target row; they do
  not perform referential-integrity cascades. Enforce these in the database schema with
  foreign keys (`ON DELETE SET NULL` / `ON DELETE CASCADE`) if you need them. A delete
  blocked by a foreign-key constraint surfaces in the UI as a "Failed to delete record"
  alert.

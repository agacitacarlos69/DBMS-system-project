# EMS Frontend — Simple HTML + Tailwind

Manager console for the 3NF Employee Management System. **Frontend only** —
your team writes the Node.js backend and database to match the REST contract
documented below. The frontend ships with an in-browser **mock backend**
(`mock.js`) so you can demo every flow before the real backend exists.

## Folder

```
DBMS Project/
├─ login.html            Manager login
├─ index.html            Dashboard (record counts)
├─ employees.html        Employee CRUD (auto-links to team-leads / smes by role)
├─ management.html       Management CRUD
├─ team-leads.html       Team Lead CRUD
├─ smes.html             SME CRUD
├─ trainings.html        Training CRUD
├─ shifts.html           Shift CRUD
├─ rooms.html            Room CRUD
├─ users.html            User CRUD (password write-only)
├─ lookups.html          Role + Tenurity (read-only)
├─ mock.js               In-browser mock backend (delete when real API is ready)
└─ README.md             this file
```

Tailwind loads from the Play CDN — **no build step, no `node_modules`**.

## Run it

1. Open `login.html` directly, or serve the folder with VS Code Live Server /
   `python -m http.server`.
2. Sign in with any non-empty username/password (e.g. `manager` / `password`).
3. The mock backend immediately serves seed data so every page works.
4. To use your real Node.js backend instead: **delete `mock.js`** and start
   your API on `http://localhost:3000`.

## Mock backend (demo mode)

`mock.js` wraps `window.fetch` and intercepts only URLs starting with
`http://localhost:3000/api/`. Everything else passes through.

- Seeds `localStorage` on first load with sample data for every entity.
- All CRUD persists in `localStorage` and survives reloads.
- Implements **cascade rules** (see below) so the demo prevents the same
  anomalies the real backend will.
- Yellow **DEMO MODE** banner with a **Reset demo data** button on every page.

### Delete the mock when your real backend is ready

1. Delete `mock.js`.
2. (Optional) Remove the `<script src="mock.js"></script>` line from each
   HTML file. Leaving it produces a harmless 404.
3. (Optional) Clear `ems_mock_*` keys from DevTools → Application → Local Storage.

---

## Referential integrity (anomaly prevention)

The frontend and mock both enforce the rules below. **Mirror these in your
SQL schema** (e.g. `ON DELETE SET NULL`, `ON DELETE CASCADE`) and in your
Employee service layer.

### Deletion cascades

| Delete this  | What also happens                                                                                                    |
|--------------|----------------------------------------------------------------------------------------------------------------------|
| Employee     | Delete the matching `team-leads` row, `smes` row, and `users` row(s). Then null-out `management.tlead_id` / `sme_id` where they pointed at the now-deleted tlead/sme. |
| Team Lead    | NULL `management.tlead_id` everywhere it pointed to this tlead.                                                      |
| SME          | NULL `management.sme_id` everywhere it pointed to this sme.                                                          |
| Training     | NULL `management.training_id` everywhere.                                                                            |
| Shift        | NULL `management.shift_id` everywhere.                                                                               |
| Room         | NULL `trainings.room_id` and `shifts.room_id` everywhere.                                                            |
| Management   | NULL `employees.mgmt_id` everywhere it pointed.                                                                      |
| User         | No dependents.                                                                                                       |

Before issuing the DELETE, the UI calls `GET /api/_preflight/<resource>/<id>`
to fetch a list of human-readable warnings, then shows them in the confirm
dialog ("This will also delete SME 'Mark Baguiao' and user account 'mark'").
If the preflight endpoint isn't implemented by your backend, the UI falls
back to a generic confirm and the DELETE still works.

### Insertion side — Employee role auto-link

When an Employee is created or updated, the backend **must**:

- If `role === 'Team Lead'` and there is no `team-leads` row with this
  `emp_id`, insert one: `{ tlead_id: 'TL-' + emp_id, emp_id, tlead_name: full_name }`.
- If `role === 'SME'` and there is no `smes` row with this `emp_id`,
  insert one: `{ sme_id: 'SME-' + emp_id, emp_id, sme_name: full_name }`.
- If the role **changes away** from `Team Lead` / `SME`, delete the
  matching `team-leads` / `smes` row (with the same null-out cascade on
  `management`).
- Keep `tlead_name` / `sme_name` in sync with `full_name` while the role
  is held.

The POST/PUT response should include a `_cascade` array with human-readable
messages of what auto-linking happened so the UI can toast them.

---

## REST contract — build your API to match

JSON only. All resource endpoints require `Authorization: Bearer <token>`.

### Auth

| Method | Path              | Request body              | Response                                                |
|--------|-------------------|---------------------------|---------------------------------------------------------|
| POST   | `/api/auth/login` | `{ username, password }`  | `{ token: "...", user: { id, username, email, role } }` |
| GET    | `/api/auth/me`    | —                         | `{ id, username, email, role }`                         |

On any 401 the frontend wipes the token and redirects to `login.html`.

### Resources

For each resource the frontend uses:

| Method | Path                       | Description                                |
|--------|----------------------------|--------------------------------------------|
| GET    | `/api/<resource>`          | List — array, or `{ items: [...] }`        |
| GET    | `/api/<resource>/:id`      | Get one                                    |
| POST   | `/api/<resource>`          | Create — return the created row            |
| PUT    | `/api/<resource>/:id`      | Update — return the updated row            |
| DELETE | `/api/<resource>/:id`      | Delete (with cascade per above)            |
| GET    | `/api/_preflight/<resource>/:id` | `{ warnings: ["...","..."] }` listing what cascade-deletion will do (optional but recommended) |

Resources: `employees`, `management`, `team-leads`, `smes`, `trainings`,
`shifts`, `rooms`, `users`, `roles` (read-only), `tenurities` (read-only).

### Error shape

```json
{ "message": "Human-readable error" }
```

Status: `400` validation, `401` auth, `404` not found, `409` duplicate PK,
`405` method not allowed, `500` server error.

### JSON shapes

```jsonc
// employee
{
  "emp_id": "10009302",
  "mgmt_id": "MG001",
  "full_name": "Jorge Camama",
  "personal_email": "jorge@example.com",
  "contact_number": "9156390467",
  "tenurity": "Repeater",
  "role": "Core",
  "status": "Active"            // Active | Inactive | On Leave | Terminated
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

// user  (password write-only; user_id is server-assigned)
{
  "user_id": 1,
  "emp_id": "10009302",
  "username": "jorge",
  "email": "jorge@example.com",
  "password": "plaintext-on-write",   // hash with bcrypt server-side
  "date_time_created": "2026-01-15T02:22:00.000Z"
}

// role         (read-only)
{ "role_code": "RC3", "role_type": "Core" }

// tenurity     (read-only)
{ "tenurity_code": "TN2", "class": "Repeater" }
```

### Cascade response shape

POST/PUT/DELETE responses **may** include `_cascade` so the frontend can
toast what additional changes happened:

```json
{
  "...": "...the resource fields...",
  "_cascade": [
    "Auto-created team-lead record TL-10009302 for Jorge Camama",
    "Unassigned team lead from 1 management record(s)"
  ]
}
```

### Notes for backend

- **CORS:** allow `Authorization, Content-Type` headers and methods
  `GET, POST, PUT, DELETE, OPTIONS`.
- **Datetimes:** ISO 8601 strings (`new Date(...).toISOString()`).
- **Passwords:** plaintext on POST/PUT to `/api/users`; hash with bcrypt
  before storing. Never echo the password back.
- **List endpoint shape:** the frontend handles both `[...]` and
  `{ items: [...] }`.
- **PUT semantics:** treated as full update; the URL `:id` is authoritative.
- **PK on create:** the frontend submits the natural PK for every resource
  except `users` (server-assigned `user_id`).

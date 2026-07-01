# SCORE NGO ERP — Backend API

REST API for the SCORE NGO ERP, built with **Node.js + Express + PostgreSQL**.
Implements the six core modules from the design doc: Beneficiaries, Finance & Grants,
Projects, Donors/CSR CRM, HR & Volunteers, and Reporting/MIS.

## Tech stack

- **Express** — HTTP framework
- **PostgreSQL** (via `pg`) — database, raw parameterized SQL (no ORM)
- **JWT** (`jsonwebtoken`) + **bcryptjs** — auth & password hashing
- **express-validator** — request validation
- **helmet**, **cors**, **morgan** — security, CORS, logging

## Project structure

```
backend/
├── src/
│   ├── config/        # env + db pool
│   ├── db/            # schema.sql, migrate.js, seed.js
│   ├── middleware/    # auth, validation, error handling
│   ├── utils/         # jwt, ApiError, asyncHandler, pagination, crudFactory
│   ├── modules/       # one folder per domain (routes/controller/service)
│   │   ├── auth/
│   │   ├── beneficiaries/
│   │   ├── clusters/
│   │   ├── donors/
│   │   ├── finance/
│   │   ├── projects/
│   │   ├── hr/
│   │   └── reports/
│   ├── routes/        # mounts all module routers under /api
│   ├── app.js         # express app
│   └── server.js      # entrypoint
├── .env.example
└── package.json
```

## Setup

1. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Create the database** (in psql or pgAdmin)
   ```sql
   CREATE DATABASE score_erp;
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # edit .env with your PostgreSQL credentials and a strong JWT_SECRET
   ```

4. **Run migrations + seed**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
   Seed creates a default admin: **admin@score.org / Admin@123**

5. **Start the server**
   ```bash
   npm run dev      # with auto-reload (nodemon)
   # or
   npm start
   ```
   API base URL: `http://localhost:5000/api`

## Authentication

1. `POST /api/auth/login` with `{ "email", "password" }` → returns `{ token, user }`.
2. Send the token on protected routes: `Authorization: Bearer <token>`.

**Roles:** `admin`, `manager`, `finance`, `field_staff`, `viewer`.
New users are created by an admin via `POST /api/auth/register`.

## API overview

| Method | Endpoint | Description | Min role |
| --- | --- | --- | --- |
| POST | `/auth/login` | Login, get JWT | public |
| GET | `/auth/me` | Current user | any |
| POST | `/auth/register` | Create user | admin |
| GET | `/auth/users` | List users | manager |
| GET/POST/PUT/DELETE | `/beneficiaries` | Beneficiary CRUD | field_staff+ |
| GET | `/beneficiaries/stats` | Counts by skill/village/status | any |
| GET/POST/PUT/DELETE | `/clusters` | Skill clusters | manager (write) |
| GET/POST/PUT/DELETE | `/donors` | CSR donors | finance+ |
| GET/POST/PUT/DELETE | `/finance/grants` | Grants | finance+ |
| GET | `/finance/grants/:id` | Grant + utilization | any |
| GET/POST/PUT/DELETE | `/finance/expenditures` | Expenditures | finance+ |
| GET | `/finance/summary` | Finance totals | any |
| GET/POST/PUT/DELETE | `/projects` | Projects | manager (write) |
| POST/PUT/DELETE | `/projects/:id/milestones` | Milestones | manager |
| POST/DELETE | `/projects/:id/assignments` | Staff assignments | manager |
| GET/POST/PUT/DELETE | `/hr/employees` | Employees & volunteers | manager (write) |
| GET/POST | `/hr/employees/:id/attendance` | Attendance | manager (write) |
| GET | `/reports/dashboard` | Leadership dashboard counts | any |

### Common query params (list endpoints)
- `?page=1&limit=20` — pagination
- `?search=...` — text search on searchable fields
- Beneficiaries also support `?village=`, `?cluster_id=`, `?skill=`, `?status=`

### Response shape
```json
// success
{ "success": true, "data": { ... } }
// list
{ "success": true, "data": [ ... ], "pagination": { "total", "page", "limit", "totalPages" } }
// error
{ "success": false, "message": "...", "details": [ ... ] }
```

## Notes

- All tables use UUID primary keys and `created_at`/`updated_at` timestamps.
- `updated_at` is maintained automatically by a PostgreSQL trigger.
- Beneficiary `skills` is a `TEXT[]` array with a GIN index for fast skill filtering
  — this is the foundation for the AI skill-clustering feature in the design doc.

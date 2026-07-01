# SCORE NGO ERP — Frontend

React single-page app for the SCORE ERP, built with **Vite + React + React Router + Axios**.
Consumes the backend API and covers all six modules plus auth and a dashboard.

## Tech stack

- **Vite** — build tool / dev server
- **React 18** + **React Router 6** — UI and routing
- **Axios** — HTTP client with JWT interceptor
- Plain CSS theme (no UI framework) — see `src/index.css`

## Project structure

```
frontend/
├── index.html
├── vite.config.js
├── .env                      # VITE_API_URL
└── src/
    ├── main.jsx              # entry, mounts Router + AuthProvider
    ├── App.jsx               # routes
    ├── index.css             # global theme
    ├── api/client.js         # axios instance + auth interceptor
    ├── context/AuthContext.jsx
    ├── components/
    │   ├── Layout.jsx        # sidebar + topbar shell
    │   ├── ProtectedRoute.jsx
    │   ├── Modal.jsx
    │   ├── CrudPage.jsx      # reusable list/create/edit/delete page
    │   └── ui.jsx            # Spinner, Alert, Pagination, badges, formatters
    └── pages/
        ├── Login.jsx
        ├── Dashboard.jsx
        ├── Beneficiaries.jsx
        ├── Clusters.jsx
        ├── Projects.jsx
        ├── Finance.jsx       # grants + expenditures tabs
        ├── Donors.jsx
        ├── Hr.jsx            # employees + attendance
        └── Users.jsx
```

## Setup

1. **Install**
   ```bash
   cd frontend
   npm install
   ```

2. **Configure API URL** — edit `.env` if your backend isn't on the default:
   ```
   VITE_API_URL=http://localhost:5000/api
   ```

3. **Run the backend first** (see `../backend/README.md`), then start the frontend:
   ```bash
   npm run dev
   ```
   Opens on `http://localhost:5173`.

4. **Login** with the seeded admin: **admin@score.org / Admin@123**

## Build for production

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build
```

## Features

- **Auth** — JWT login, token stored in localStorage, auto-redirect to `/login` on 401.
- **Role-aware UI** — the Users nav item and admin actions only show for admin/manager.
- **Dashboard** — live counts, fund-utilization bar, beneficiaries-by-skill chart.
- **Beneficiaries** — full CRUD, search + village/skill/status filters, comma-separated
  skills mapped to the backend `TEXT[]` column, pagination.
- **Skill Clusters, Donors** — CRUD via the shared `CrudPage` component.
- **Finance** — grants & expenditures with a summary header.
- **Projects** — CRUD plus a detail modal with milestone checklist.
- **HR** — staff/volunteers CRUD plus per-employee attendance marking.
- **Users** — admin user creation and enable/disable.

## Notes

- The CORS origin on the backend defaults to `http://localhost:5173`, matching Vite.
- All API responses follow `{ success, data, pagination? }`; errors surface via the
  shared `apiError()` helper which unpacks validation `details`.

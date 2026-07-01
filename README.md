# SCORE ERP

An open-source **ERP + AI platform for NGOs**, built for SCORE. It centralizes
beneficiaries, finance, projects, donors/CSR, HR and reporting, and adds AI
features (skill clustering, voice data collection, automated CSR reports).

## Tech stack
- **Backend:** Node.js + Express + PostgreSQL (raw `pg`, JWT auth)
- **Frontend:** React + Vite + React Router + Axios

## Modules
- **Beneficiary Management** — demographics, skills, clusters, Excel/CSV import, voice entry
- **Finance & Grants** — grants, expenditures, fund utilization, audit trail
- **Project Management** — projects, milestones, staff assignments, beneficiary enrollment & outcomes
- **Donor / CSR CRM** — donors, communication log, reporting schedules
- **HR & Volunteers** — employees, attendance, payroll & payslips, field-staff schedules
- **Reporting & MIS** — dashboard, CSR impact & compliance reports
- **Livelihoods** — opportunity registry with AI skill-matching
- **AI** — skill clustering, voice-based data collection (Hindi/Gujarati/English)

## Getting started

### Backend
```bash
cd backend
npm install
cp .env.example .env      # set DB credentials + JWT secret
npm run db:migrate
npm run db:seed           # default admin: admin@score.org / Admin@123
npm run dev               # http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for details.

## Repository layout
```
backend/    Express API + PostgreSQL schema/migrations
frontend/   React (Vite) single-page app
degine.md   Original design document
summary.md  Executive summary
```

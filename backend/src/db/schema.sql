-- ============================================================
-- SCORE NGO ERP — PostgreSQL schema
-- Modules: Auth/Users, Beneficiaries, Finance & Grants,
--          Projects, Donors/CSR CRM, HR & Volunteers
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- Reusable trigger to maintain updated_at columns
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- AUTH / USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  phone         VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(30)  NOT NULL DEFAULT 'field_staff'
                 CHECK (role IN ('admin','manager','finance','field_staff','viewer')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- profile avatar stored as a data URL (added after initial release)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- BENEFICIARY MANAGEMENT
-- ============================================================
CREATE TABLE IF NOT EXISTS clusters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL,
  description TEXT,
  village     VARCHAR(120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_clusters_updated ON clusters;
CREATE TRIGGER trg_clusters_updated BEFORE UPDATE ON clusters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS beneficiaries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             VARCHAR(30) UNIQUE,               -- human-friendly id e.g. SCORE-0001
  full_name        VARCHAR(150) NOT NULL,
  gender           VARCHAR(10) CHECK (gender IN ('male','female','other')),
  date_of_birth    DATE,
  phone            VARCHAR(20),
  village          VARCHAR(120),
  district         VARCHAR(120),
  state            VARCHAR(120) DEFAULT 'Gujarat',
  -- demographics / household
  education        VARCHAR(120),
  occupation       VARCHAR(120),
  monthly_income   NUMERIC(12,2),
  household_size   INTEGER,
  household_head   VARCHAR(150),
  -- skills (array of strings e.g. {stitching,weaving,pottery})
  skills           TEXT[] DEFAULT '{}',
  cluster_id       UUID REFERENCES clusters(id) ON DELETE SET NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive','graduated')),
  notes            TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_village  ON beneficiaries(village);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_cluster  ON beneficiaries(cluster_id);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_skills   ON beneficiaries USING GIN (skills);

DROP TRIGGER IF EXISTS trg_beneficiaries_updated ON beneficiaries;
CREATE TRIGGER trg_beneficiaries_updated BEFORE UPDATE ON beneficiaries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- DONORS / CSR CRM
-- ============================================================
CREATE TABLE IF NOT EXISTS donors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(150) NOT NULL,
  type            VARCHAR(30) DEFAULT 'corporate'
                   CHECK (type IN ('corporate','foundation','individual','government')),
  contact_person  VARCHAR(150),
  email           VARCHAR(150),
  phone           VARCHAR(20),
  address         TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_donors_updated ON donors;
CREATE TRIGGER trg_donors_updated BEFORE UPDATE ON donors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Communication history with a donor (CRM interaction log)
CREATE TABLE IF NOT EXISTS donor_communications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id        UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  type            VARCHAR(20) NOT NULL DEFAULT 'note'
                   CHECK (type IN ('call','email','meeting','note')),
  subject         VARCHAR(200),
  summary         TEXT,
  contact_person  VARCHAR(150),
  communicated_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doncomm_donor ON donor_communications(donor_id);

-- Reporting commitments / deadlines owed to a donor
CREATE TABLE IF NOT EXISTS donor_report_schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id     UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  title        VARCHAR(200) NOT NULL,
  frequency    VARCHAR(20) NOT NULL DEFAULT 'one_time'
                CHECK (frequency IN ('one_time','monthly','quarterly','half_yearly','annual')),
  due_date     DATE NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','submitted')),
  submitted_on DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_donrep_donor ON donor_report_schedules(donor_id);

DROP TRIGGER IF EXISTS trg_donrep_updated ON donor_report_schedules;
CREATE TRIGGER trg_donrep_updated BEFORE UPDATE ON donor_report_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- FINANCE & GRANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           VARCHAR(200) NOT NULL,
  donor_id        UUID REFERENCES donors(id) ON DELETE SET NULL,
  amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(8) NOT NULL DEFAULT 'INR',
  start_date      DATE,
  end_date        DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('pledged','active','closed','cancelled')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_grants_updated ON grants;
CREATE TRIGGER trg_grants_updated BEFORE UPDATE ON grants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Expenditures booked against a grant (and optionally a project)
CREATE TABLE IF NOT EXISTS expenditures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id        UUID REFERENCES grants(id) ON DELETE CASCADE,
  project_id      UUID,  -- FK added after projects table
  category        VARCHAR(80),
  description     TEXT,
  amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  spent_on        DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenditures_grant   ON expenditures(grant_id);
CREATE INDEX IF NOT EXISTS idx_expenditures_project ON expenditures(project_id);

DROP TRIGGER IF EXISTS trg_expenditures_updated ON expenditures;
CREATE TRIGGER trg_expenditures_updated BEFORE UPDATE ON expenditures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Immutable audit trail of changes to records (compliance)
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  VARCHAR(40) NOT NULL,            -- e.g. 'grant', 'expenditure'
  entity_id    UUID,
  action       VARCHAR(10) NOT NULL CHECK (action IN ('create','update','delete')),
  changes      JSONB,                           -- snapshot (create/delete) or field diff (update)
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name   VARCHAR(150),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ============================================================
-- PROJECT MANAGEMENT
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  grant_id        UUID REFERENCES grants(id) ON DELETE SET NULL,
  manager_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  village         VARCHAR(120),
  start_date      DATE,
  end_date        DATE,
  budget          NUMERIC(14,2) DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned','active','on_hold','completed','cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_projects_updated ON projects;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- now that projects exists, link expenditures.project_id
ALTER TABLE expenditures
  DROP CONSTRAINT IF EXISTS fk_expenditures_project;
ALTER TABLE expenditures
  ADD CONSTRAINT fk_expenditures_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  due_date        DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','in_progress','done','delayed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);

DROP TRIGGER IF EXISTS trg_milestones_updated ON milestones;
CREATE TRIGGER trg_milestones_updated BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Staff assigned to projects (many-to-many users<->projects)
CREATE TABLE IF NOT EXISTS project_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_on_project VARCHAR(80),
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

-- Beneficiaries enrolled into a project, with programme outcomes
CREATE TABLE IF NOT EXISTS enrollments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  beneficiary_id UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
  enrolled_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  status         VARCHAR(20) NOT NULL DEFAULT 'enrolled'
                  CHECK (status IN ('enrolled','in_training','completed','employed','dropped_out')),
  outcome        TEXT,                       -- e.g. job placement / livelihood secured
  outcome_income NUMERIC(12,2),              -- post-programme monthly income, if known
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, beneficiary_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_project     ON enrollments(project_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_beneficiary ON enrollments(beneficiary_id);

DROP TRIGGER IF EXISTS trg_enrollments_updated ON enrollments;
CREATE TRIGGER trg_enrollments_updated BEFORE UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- LIVELIHOOD OPPORTUNITIES & MATCHING  (workflow Step 5)
-- ============================================================
CREATE TABLE IF NOT EXISTS livelihood_opportunities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           VARCHAR(200) NOT NULL,
  organization    VARCHAR(200),
  type            VARCHAR(30) NOT NULL DEFAULT 'job'
                   CHECK (type IN ('job','self_employment','apprenticeship','scheme')),
  required_skills TEXT[] DEFAULT '{}',
  location        VARCHAR(120),
  positions       INTEGER DEFAULT 1,
  monthly_wage    NUMERIC(12,2),
  status          VARCHAR(20) NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','filled','closed')),
  description     TEXT,
  contact         VARCHAR(200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opp_skills ON livelihood_opportunities USING GIN (required_skills);

DROP TRIGGER IF EXISTS trg_opp_updated ON livelihood_opportunities;
CREATE TRIGGER trg_opp_updated BEFORE UPDATE ON livelihood_opportunities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS opportunity_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  UUID NOT NULL REFERENCES livelihood_opportunities(id) ON DELETE CASCADE,
  beneficiary_id  UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'suggested'
                   CHECK (status IN ('suggested','applied','placed','rejected')),
  match_score     NUMERIC(5,2),
  notes           TEXT,
  matched_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (opportunity_id, beneficiary_id)
);

CREATE INDEX IF NOT EXISTS idx_match_opp ON opportunity_matches(opportunity_id);

DROP TRIGGER IF EXISTS trg_match_updated ON opportunity_matches;
CREATE TRIGGER trg_match_updated BEFORE UPDATE ON opportunity_matches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- HR & VOLUNTEER MANAGEMENT
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  full_name       VARCHAR(150) NOT NULL,
  designation     VARCHAR(120),
  department      VARCHAR(120),
  employment_type VARCHAR(20) DEFAULT 'staff'
                   CHECK (employment_type IN ('staff','volunteer','contract')),
  phone           VARCHAR(20),
  email           VARCHAR(150),
  monthly_salary  NUMERIC(12,2) DEFAULT 0,
  date_joined     DATE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_employees_updated ON employees;
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS attendance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  status       VARCHAR(15) NOT NULL DEFAULT 'present'
                CHECK (status IN ('present','absent','leave','half_day')),
  remarks      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);

-- Payroll: a run per pay period, with one payslip per employee
CREATE TABLE IF NOT EXISTS payroll_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period      VARCHAR(7) NOT NULL UNIQUE,         -- 'YYYY-MM'
  label       VARCHAR(120),
  run_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  status      VARCHAR(20) NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','finalized')),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_payroll_updated ON payroll_runs;
CREATE TRIGGER trg_payroll_updated BEFORE UPDATE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS payslips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id  UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- earnings
  basic_salary    NUMERIC(12,2) NOT NULL DEFAULT 0,
  hra             NUMERIC(12,2) NOT NULL DEFAULT 0,   -- house rent allowance
  da              NUMERIC(12,2) NOT NULL DEFAULT 0,   -- dearness allowance
  other_allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- deductions
  pf              NUMERIC(12,2) NOT NULL DEFAULT 0,   -- provident fund
  professional_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  tds             NUMERIC(12,2) NOT NULL DEFAULT 0,   -- tax deducted at source
  other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- totals
  gross_earnings  NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay         NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','paid')),
  paid_on         DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payslips_run ON payslips(payroll_run_id);

DROP TRIGGER IF EXISTS trg_payslips_updated ON payslips;
CREATE TRIGGER trg_payslips_updated BEFORE UPDATE ON payslips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Field-staff schedule / roster: who visits which village/activity on which date
CREATE TABLE IF NOT EXISTS field_schedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title          VARCHAR(200) NOT NULL,             -- activity, e.g. "Beneficiary survey"
  village        VARCHAR(120),
  project_id     UUID REFERENCES projects(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  start_time     TIME,
  status         VARCHAR(20) NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','completed','missed','cancelled')),
  notes          TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fieldsched_date ON field_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_fieldsched_emp  ON field_schedules(employee_id);

DROP TRIGGER IF EXISTS trg_fieldsched_updated ON field_schedules;
CREATE TRIGGER trg_fieldsched_updated BEFORE UPDATE ON field_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

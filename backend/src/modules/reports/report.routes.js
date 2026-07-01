const express = require('express');
const { authenticate } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const { query } = require('../../config/db');
const csr = require('./csr.service');

const router = express.Router();
router.use(authenticate);

/**
 * High-level dashboard counts for leadership / MIS.
 */
router.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const [beneficiaries, projects, grants, spent, donors, employees, funnelRes] =
      await Promise.all([
        query('SELECT COUNT(*)::int AS c FROM beneficiaries'),
        query(`SELECT COUNT(*)::int AS c FROM projects WHERE status = 'active'`),
        query(`SELECT COALESCE(SUM(amount),0)::numeric AS s FROM grants WHERE status IN ('active','pledged')`),
        query('SELECT COALESCE(SUM(amount),0)::numeric AS s FROM expenditures'),
        query('SELECT COUNT(*)::int AS c FROM donors'),
        query('SELECT COUNT(*)::int AS c FROM employees WHERE is_active = TRUE'),
        query(`
          SELECT
            COUNT(*)::int AS registered,
            COUNT(*) FILTER (WHERE status = 'active')::int AS active,
            COUNT(*) FILTER (WHERE array_length(skills, 1) > 0)::int AS skilled,
            COUNT(*) FILTER (WHERE array_length(skills, 1) > 1)::int AS multi_skilled,
            COUNT(*) FILTER (WHERE cluster_id IS NOT NULL)::int AS clustered
          FROM beneficiaries`),
      ]);

    const totalGrants = Number(grants.rows[0].s);
    const totalSpent = Number(spent.rows[0].s);

    // Beneficiary engagement funnel (naturally decreasing stages)
    const f = funnelRes.rows[0];
    const base = f.registered || 1;
    const funnel = [
      { stage: 'Registered', value: f.registered },
      { stage: 'Active', value: f.active },
      { stage: 'Skilled', value: f.skilled },
      { stage: 'Multi-skilled', value: f.multi_skilled },
      { stage: 'Clustered', value: f.clustered },
    ].map((s) => ({ ...s, pct: Math.round((s.value / base) * 100) }));

    res.json({
      success: true,
      data: {
        beneficiaries: beneficiaries.rows[0].c,
        active_projects: projects.rows[0].c,
        donors: donors.rows[0].c,
        active_employees: employees.rows[0].c,
        finance: {
          total_grants: totalGrants,
          total_spent: totalSpent,
          total_remaining: totalGrants - totalSpent,
          utilization_pct: totalGrants > 0 ? Math.round((totalSpent / totalGrants) * 100) : 0,
        },
        funnel,
      },
    });
  })
);

/**
 * Live notifications derived from operational data:
 * overdue / upcoming milestones, grants ending soon, and over-utilised grants.
 */
router.get(
  '/notifications',
  asyncHandler(async (_req, res) => {
    const [overdue, upcomingMs, endingGrants, overUsed, onHold] = await Promise.all([
      query(`
        SELECT m.id, m.title, m.due_date, p.name AS project
        FROM milestones m JOIN projects p ON p.id = m.project_id
        WHERE m.due_date < CURRENT_DATE AND m.status <> 'done'
        ORDER BY m.due_date ASC LIMIT 20`),
      query(`
        SELECT m.id, m.title, m.due_date, p.name AS project
        FROM milestones m JOIN projects p ON p.id = m.project_id
        WHERE m.status <> 'done' AND m.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        ORDER BY m.due_date ASC LIMIT 20`),
      query(`
        SELECT id, title, end_date
        FROM grants
        WHERE status = 'active' AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ORDER BY end_date ASC LIMIT 20`),
      query(`
        SELECT g.id, g.title, g.amount,
               COALESCE(SUM(e.amount), 0) AS spent
        FROM grants g LEFT JOIN expenditures e ON e.grant_id = g.id
        WHERE g.amount > 0 AND g.status = 'active'
        GROUP BY g.id
        HAVING COALESCE(SUM(e.amount), 0) >= 0.9 * g.amount
        LIMIT 20`),
      query(`SELECT id, name FROM projects WHERE status = 'on_hold' LIMIT 20`),
    ]);

    const donorReports = await query(`
      SELECT r.id, r.title, r.due_date, d.name AS donor
      FROM donor_report_schedules r JOIN donors d ON d.id = r.donor_id
      WHERE r.status = 'pending' AND r.due_date <= CURRENT_DATE + INTERVAL '14 days'
      ORDER BY r.due_date ASC LIMIT 20`);

    const fieldVisits = await query(`
      SELECT fs.id, fs.title, fs.village, fs.scheduled_date, e.full_name AS staff
      FROM field_schedules fs JOIN employees e ON e.id = fs.employee_id
      WHERE fs.status = 'planned' AND fs.scheduled_date <= CURRENT_DATE + INTERVAL '3 days'
      ORDER BY fs.scheduled_date ASC LIMIT 20`);

    // Format a DB date to YYYY-MM-DD using local components (avoids the
    // off-by-one that toISOString() causes in positive-offset timezones).
    const ymd = (d) => {
      const x = new Date(d);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    };

    const items = [];
    for (const r of overdue.rows) {
      items.push({ id: `ms-${r.id}`, severity: 'danger', icon: '⏰',
        title: 'Overdue milestone',
        message: `"${r.title}" in ${r.project} was due ${ymd(r.due_date)}`,
        link: '/projects' });
    }
    for (const r of upcomingMs.rows) {
      items.push({ id: `up-${r.id}`, severity: 'warning', icon: '📅',
        title: 'Milestone due soon',
        message: `"${r.title}" in ${r.project} is due ${ymd(r.due_date)}`,
        link: '/projects' });
    }
    for (const r of endingGrants.rows) {
      items.push({ id: `gr-${r.id}`, severity: 'warning', icon: '⌛',
        title: 'Grant ending soon',
        message: `"${r.title}" ends ${ymd(r.end_date)}`,
        link: '/finance' });
    }
    for (const r of overUsed.rows) {
      const pct = Math.round((Number(r.spent) / Number(r.amount)) * 100);
      items.push({ id: `ov-${r.id}`, severity: 'danger', icon: '💸',
        title: 'Grant nearly exhausted',
        message: `"${r.title}" is ${pct}% utilised`,
        link: '/finance' });
    }
    for (const r of onHold.rows) {
      items.push({ id: `oh-${r.id}`, severity: 'info', icon: '⏸',
        title: 'Project on hold',
        message: `"${r.name}" is currently on hold`,
        link: '/projects' });
    }
    for (const r of donorReports.rows) {
      const overdue = ymd(r.due_date) < ymd(new Date());
      items.push({ id: `dr-${r.id}`, severity: overdue ? 'danger' : 'warning', icon: '📑',
        title: overdue ? 'Donor report overdue' : 'Donor report due soon',
        message: `"${r.title}" for ${r.donor} — due ${ymd(r.due_date)}`,
        link: '/donors' });
    }
    for (const r of fieldVisits.rows) {
      const overdue = ymd(r.scheduled_date) < ymd(new Date());
      items.push({ id: `fv-${r.id}`, severity: overdue ? 'danger' : 'info', icon: '🗓',
        title: overdue ? 'Field visit overdue' : 'Field visit scheduled',
        message: `${r.staff}: "${r.title}"${r.village ? ` at ${r.village}` : ''} — ${ymd(r.scheduled_date)}`,
        link: '/field-schedule' });
    }

    res.json({ success: true, data: { count: items.length, items } });
  })
);

/** CSR impact overview — all donors with headline metrics */
router.get(
  '/csr',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await csr.overview() });
  })
);

/** Full CSR impact report for a single donor */
router.get(
  '/csr/:donorId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await csr.donorReport(req.params.donorId) });
  })
);

/** CSR compliance / fund-utilisation report for a single donor */
router.get(
  '/csr/:donorId/compliance',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await csr.complianceReport(req.params.donorId) });
  })
);

module.exports = router;

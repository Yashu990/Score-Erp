const express = require('express');
const { body } = require('express-validator');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const crudFactory = require('../../utils/crudFactory');
const { query, getClient } = require('../../config/db');
const ApiError = require('../../utils/ApiError');

const router = express.Router();
router.use(authenticate);

const hrManage = authorize('admin', 'manager');

/* ---------------------------- EMPLOYEES --------------------------- */
const empCrud = crudFactory({
  table: 'employees',
  fields: [
    'id', 'user_id', 'full_name', 'designation', 'department', 'employment_type',
    'phone', 'email', 'monthly_salary', 'date_joined', 'is_active',
    'created_at', 'updated_at',
  ],
  writable: [
    'user_id', 'full_name', 'designation', 'department', 'employment_type',
    'phone', 'email', 'monthly_salary', 'date_joined', 'is_active',
  ],
  searchable: ['full_name', 'designation', 'department', 'email'],
  orderBy: 'full_name ASC',
});

const empRules = [
  body('full_name').trim().notEmpty().withMessage('Full name required'),
  body('employment_type').optional().isIn(['staff', 'volunteer', 'contract']),
  body('email').optional({ nullable: true }).isEmail(),
  body('monthly_salary').optional().isFloat({ min: 0 }),
];

router.get('/employees', empCrud.list);
router.get('/employees/:id', empCrud.getOne);
router.post('/employees', hrManage, empRules, validate, empCrud.create);
router.put('/employees/:id', hrManage, empCrud.update);
router.delete('/employees/:id', authorize('admin'), empCrud.remove);

/* --------------------------- ATTENDANCE --------------------------- */
// List attendance for an employee, optionally filtered by date range
router.get(
  '/employees/:id/attendance',
  asyncHandler(async (req, res) => {
    const { from, to } = req.query;
    const params = [req.params.id];
    let where = 'WHERE employee_id = $1';
    if (from) {
      params.push(from);
      where += ` AND work_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      where += ` AND work_date <= $${params.length}`;
    }
    const r = await query(
      `SELECT * FROM attendance ${where} ORDER BY work_date DESC`,
      params
    );
    res.json({ success: true, data: r.rows });
  })
);

// Monthly attendance summary + day-by-day statuses for one employee
router.get(
  '/employees/:id/attendance/summary',
  asyncHandler(async (req, res) => {
    const month = req.query.month; // 'YYYY-MM'
    if (!/^\d{4}-\d{2}$/.test(month || '')) {
      throw ApiError.badRequest('month query param required as YYYY-MM');
    }
    const start = `${month}-01`;
    const r = await query(
      `SELECT work_date, status, remarks FROM attendance
       WHERE employee_id = $1
         AND work_date >= $2::date
         AND work_date < ($2::date + INTERVAL '1 month')
       ORDER BY work_date`,
      [req.params.id, start]
    );

    // format each work_date to YYYY-MM-DD using local components (no UTC shift)
    const ymd = (d) => {
      const x = new Date(d);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    };
    const counts = { present: 0, absent: 0, leave: 0, half_day: 0 };
    const byDate = {};
    for (const row of r.rows) {
      counts[row.status] = (counts[row.status] || 0) + 1;
      byDate[ymd(row.work_date)] = { status: row.status, remarks: row.remarks };
    }
    const recorded = r.rows.length;
    const attendancePct = recorded
      ? Math.round(((counts.present + counts.half_day * 0.5) / recorded) * 100)
      : 0;

    res.json({
      success: true,
      data: { month, counts, byDate, recorded, attendancePct },
    });
  })
);

// Mark / upsert attendance for a day
router.post(
  '/employees/:id/attendance',
  hrManage,
  [
    body('work_date').optional().isISO8601(),
    body('status').optional().isIn(['present', 'absent', 'leave', 'half_day']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { work_date, status, remarks } = req.body;
    const r = await query(
      `INSERT INTO attendance (employee_id, work_date, status, remarks)
       VALUES ($1, COALESCE($2, CURRENT_DATE), COALESCE($3,'present'), $4)
       ON CONFLICT (employee_id, work_date)
       DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks
       RETURNING *`,
      [req.params.id, work_date || null, status || null, remarks || null]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  })
);

/* ------------------------------ PAYROLL --------------------------- */
// List payroll runs with payslip counts + totals
router.get(
  '/payroll',
  asyncHandler(async (_req, res) => {
    const r = await query(`
      SELECT pr.id, pr.period, pr.label, pr.run_date, pr.status,
             COUNT(ps.id)::int AS payslip_count,
             COALESCE(SUM(ps.net_pay), 0) AS total_net,
             COUNT(ps.id) FILTER (WHERE ps.status = 'paid')::int AS paid_count
      FROM payroll_runs pr
      LEFT JOIN payslips ps ON ps.payroll_run_id = pr.id
      GROUP BY pr.id
      ORDER BY pr.period DESC`);
    res.json({ success: true, data: r.rows });
  })
);

// Create a run and auto-generate payslips for all active employees
router.post(
  '/payroll',
  hrManage,
  [
    body('period').matches(/^\d{4}-\d{2}$/).withMessage('period must be YYYY-MM'),
    body('label').optional().trim(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { period, label } = req.body;
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const run = await client.query(
        `INSERT INTO payroll_runs (period, label, created_by) VALUES ($1, $2, $3) RETURNING *`,
        [period, label || null, req.user.id]
      );
      const runId = run.rows[0].id;
      const emps = await client.query(
        `SELECT id, COALESCE(monthly_salary, 0) AS salary FROM employees WHERE is_active = TRUE`
      );
      for (const e of emps.rows) {
        await client.query(
          `INSERT INTO payslips (payroll_run_id, employee_id, basic_salary, gross_earnings, net_pay)
           VALUES ($1, $2, $3, $3, $3)`,
          [runId, e.id, e.salary]
        );
      }
      await client.query('COMMIT');
      res.status(201).json({
        success: true,
        data: { ...run.rows[0], payslip_count: emps.rows.length },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') throw ApiError.conflict('A payroll run already exists for this period');
      throw err;
    } finally {
      client.release();
    }
  })
);

// Run detail with payslips
router.get(
  '/payroll/:id',
  asyncHandler(async (req, res) => {
    const run = await query('SELECT * FROM payroll_runs WHERE id = $1', [req.params.id]);
    if (!run.rows.length) throw ApiError.notFound('Payroll run not found');
    const slips = await query(
      `SELECT ps.*, e.full_name, e.designation, e.employment_type
       FROM payslips ps JOIN employees e ON e.id = ps.employee_id
       WHERE ps.payroll_run_id = $1
       ORDER BY e.full_name`,
      [req.params.id]
    );
    const total = slips.rows.reduce((s, p) => s + Number(p.net_pay), 0);
    res.json({ success: true, data: { ...run.rows[0], total_net: total, payslips: slips.rows } });
  })
);

// Finalize / reopen a run
router.put(
  '/payroll/:id',
  hrManage,
  [body('status').isIn(['draft', 'finalized'])],
  validate,
  asyncHandler(async (req, res) => {
    const r = await query(
      'UPDATE payroll_runs SET status = $2 WHERE id = $1 RETURNING *',
      [req.params.id, req.body.status]
    );
    if (!r.rows.length) throw ApiError.notFound('Payroll run not found');
    res.json({ success: true, data: r.rows[0] });
  })
);

router.delete(
  '/payroll/:id',
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const r = await query('DELETE FROM payroll_runs WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rows.length) throw ApiError.notFound('Payroll run not found');
    res.json({ success: true, message: 'Payroll run deleted' });
  })
);

// Get a single payslip with employee + run details (for the printable slip)
router.get(
  '/payslips/:id',
  asyncHandler(async (req, res) => {
    const r = await query(
      `SELECT ps.*, e.full_name, e.designation, e.department, e.employment_type, e.date_joined,
              pr.period, pr.label, pr.status AS run_status
       FROM payslips ps
       JOIN employees e ON e.id = ps.employee_id
       JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
       WHERE ps.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) throw ApiError.notFound('Payslip not found');
    res.json({ success: true, data: r.rows[0] });
  })
);

// Update a payslip — gross & net are recomputed server-side from components
const PAY_COMPONENTS = ['basic_salary', 'hra', 'da', 'other_allowances', 'pf', 'professional_tax', 'tds', 'other_deductions'];

router.put(
  '/payslips/:id',
  hrManage,
  [
    ...PAY_COMPONENTS.map((c) => body(c).optional().isFloat({ min: 0 })),
    body('status').optional().isIn(['pending', 'paid']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const cur = await query('SELECT * FROM payslips WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) throw ApiError.notFound('Payslip not found');
    const p = cur.rows[0];

    // merge incoming components over current values
    const v = {};
    for (const c of PAY_COMPONENTS) {
      v[c] = req.body[c] != null ? Number(req.body[c]) : Number(p[c]);
    }
    const gross = v.basic_salary + v.hra + v.da + v.other_allowances;
    const net = gross - v.pf - v.professional_tax - v.tds - v.other_deductions;
    const status = req.body.status || p.status;

    const r = await query(
      `UPDATE payslips SET
         basic_salary = $2, hra = $3, da = $4, other_allowances = $5,
         pf = $6, professional_tax = $7, tds = $8, other_deductions = $9,
         gross_earnings = $10, net_pay = $11,
         status = $12::varchar,
         paid_on = CASE WHEN $12::text = 'paid' THEN COALESCE(paid_on, CURRENT_DATE)
                        WHEN $12::text = 'pending' THEN NULL ELSE paid_on END,
         notes = COALESCE($13, notes)
       WHERE id = $1 RETURNING *`,
      [req.params.id, v.basic_salary, v.hra, v.da, v.other_allowances,
        v.pf, v.professional_tax, v.tds, v.other_deductions, gross, net, status, req.body.notes ?? null]
    );
    res.json({ success: true, data: r.rows[0] });
  })
);

/* ------------------------- FIELD SCHEDULES ------------------------ */
// List schedules; defaults to upcoming (today onward). Filters: from, to, employee_id, status
router.get(
  '/schedules',
  asyncHandler(async (req, res) => {
    const where = [];
    const params = [];
    let i = 1;
    if (req.query.from) { where.push(`fs.scheduled_date >= $${i++}`); params.push(req.query.from); }
    if (req.query.to) { where.push(`fs.scheduled_date <= $${i++}`); params.push(req.query.to); }
    if (req.query.employee_id) { where.push(`fs.employee_id = $${i++}`); params.push(req.query.employee_id); }
    if (req.query.status) { where.push(`fs.status = $${i++}`); params.push(req.query.status); }
    if (!req.query.from && !req.query.to) { where.push(`fs.scheduled_date >= CURRENT_DATE - INTERVAL '1 day'`); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await query(
      `SELECT fs.id, fs.title, fs.village, fs.scheduled_date, fs.start_time, fs.status,
              fs.notes, fs.employee_id, fs.project_id,
              e.full_name AS staff_name, p.name AS project_name
       FROM field_schedules fs
       JOIN employees e ON e.id = fs.employee_id
       LEFT JOIN projects p ON p.id = fs.project_id
       ${whereSql}
       ORDER BY fs.scheduled_date ASC, fs.start_time ASC NULLS LAST`,
      params
    );
    res.json({ success: true, data: r.rows });
  })
);

router.post(
  '/schedules',
  hrManage,
  [
    body('employee_id').isUUID().withMessage('Valid employee_id required'),
    body('title').trim().notEmpty().withMessage('Activity title required'),
    body('scheduled_date').isISO8601().withMessage('Valid scheduled_date required'),
    body('project_id').optional({ nullable: true }).isUUID(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { employee_id, title, village, project_id, scheduled_date, start_time, notes } = req.body;
    const r = await query(
      `INSERT INTO field_schedules
         (employee_id, title, village, project_id, scheduled_date, start_time, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [employee_id, title, village || null, project_id || null, scheduled_date,
        start_time || null, notes || null, req.user.id]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  })
);

router.put(
  '/schedules/:id',
  hrManage,
  [body('status').optional().isIn(['planned', 'completed', 'missed', 'cancelled'])],
  validate,
  asyncHandler(async (req, res) => {
    const { title, village, project_id, scheduled_date, start_time, status, notes } = req.body;
    const r = await query(
      `UPDATE field_schedules SET
         title = COALESCE($2, title),
         village = COALESCE($3, village),
         project_id = COALESCE($4, project_id),
         scheduled_date = COALESCE($5, scheduled_date),
         start_time = COALESCE($6, start_time),
         status = COALESCE($7, status),
         notes = COALESCE($8, notes)
       WHERE id = $1 RETURNING *`,
      [req.params.id, title ?? null, village ?? null, project_id ?? null,
        scheduled_date ?? null, start_time ?? null, status ?? null, notes ?? null]
    );
    if (!r.rows.length) throw ApiError.notFound('Schedule not found');
    res.json({ success: true, data: r.rows[0] });
  })
);

router.delete(
  '/schedules/:id',
  hrManage,
  asyncHandler(async (req, res) => {
    const r = await query('DELETE FROM field_schedules WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rows.length) throw ApiError.notFound('Schedule not found');
    res.json({ success: true, message: 'Schedule deleted' });
  })
);

/* ----------------------------- SUMMARY ---------------------------- */
router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const byType = await query(`
      SELECT employment_type, COUNT(*)::int AS count
      FROM employees WHERE is_active = TRUE
      GROUP BY employment_type`);
    const totalRes = await query(
      'SELECT COUNT(*)::int AS count FROM employees WHERE is_active = TRUE'
    );
    res.json({
      success: true,
      data: { active_total: totalRes.rows[0].count, by_type: byType.rows },
    });
  })
);

module.exports = router;

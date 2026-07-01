const express = require('express');
const { body } = require('express-validator');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const crudFactory = require('../../utils/crudFactory');
const { query } = require('../../config/db');
const ApiError = require('../../utils/ApiError');

const router = express.Router();
router.use(authenticate);

const crud = crudFactory({
  table: 'donors',
  fields: [
    'id', 'name', 'type', 'contact_person', 'email', 'phone',
    'address', 'notes', 'created_at', 'updated_at',
  ],
  writable: ['name', 'type', 'contact_person', 'email', 'phone', 'address', 'notes'],
  searchable: ['name', 'contact_person', 'email'],
  orderBy: 'name ASC',
});

const manage = authorize('admin', 'manager', 'finance');

const rules = [
  body('name').trim().notEmpty().withMessage('Donor name required'),
  body('type').optional().isIn(['corporate', 'foundation', 'individual', 'government']),
  body('email').optional({ nullable: true }).isEmail().withMessage('Invalid email'),
];

router.get('/', crud.list);

/* ---------------------- COMMUNICATION LOG ------------------------- */
router.get(
  '/:id/communications',
  asyncHandler(async (req, res) => {
    const r = await query(
      `SELECT c.id, c.type, c.subject, c.summary, c.contact_person, c.communicated_on,
              u.full_name AS logged_by
       FROM donor_communications c
       LEFT JOIN users u ON u.id = c.created_by
       WHERE c.donor_id = $1
       ORDER BY c.communicated_on DESC, c.created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: r.rows });
  })
);

router.post(
  '/:id/communications',
  manage,
  [
    body('type').optional().isIn(['call', 'email', 'meeting', 'note']),
    body('summary').trim().notEmpty().withMessage('Summary required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { type, subject, summary, contact_person, communicated_on } = req.body;
    const r = await query(
      `INSERT INTO donor_communications
         (donor_id, type, subject, summary, contact_person, communicated_on, created_by)
       VALUES ($1, COALESCE($2,'note'), $3, $4, $5, COALESCE($6,CURRENT_DATE), $7)
       RETURNING *`,
      [req.params.id, type || null, subject || null, summary, contact_person || null,
        communicated_on || null, req.user.id]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  })
);

router.delete(
  '/communications/:commId',
  manage,
  asyncHandler(async (req, res) => {
    const r = await query('DELETE FROM donor_communications WHERE id = $1 RETURNING id', [req.params.commId]);
    if (!r.rows.length) throw ApiError.notFound('Communication not found');
    res.json({ success: true, message: 'Deleted' });
  })
);

/* --------------------- REPORTING SCHEDULES ------------------------ */
router.get(
  '/:id/reports',
  asyncHandler(async (req, res) => {
    const r = await query(
      'SELECT * FROM donor_report_schedules WHERE donor_id = $1 ORDER BY due_date ASC',
      [req.params.id]
    );
    res.json({ success: true, data: r.rows });
  })
);

router.post(
  '/:id/reports',
  manage,
  [
    body('title').trim().notEmpty().withMessage('Title required'),
    body('due_date').isISO8601().withMessage('Valid due_date required'),
    body('frequency').optional().isIn(['one_time', 'monthly', 'quarterly', 'half_yearly', 'annual']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { title, frequency, due_date, notes } = req.body;
    const r = await query(
      `INSERT INTO donor_report_schedules (donor_id, title, frequency, due_date, notes)
       VALUES ($1, $2, COALESCE($3,'one_time'), $4, $5) RETURNING *`,
      [req.params.id, title, frequency || null, due_date, notes || null]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  })
);

router.put(
  '/reports/:reportId',
  manage,
  [body('status').optional().isIn(['pending', 'submitted'])],
  validate,
  asyncHandler(async (req, res) => {
    const { status, due_date, notes } = req.body;
    // when marking submitted, stamp submitted_on automatically
    const r = await query(
      `UPDATE donor_report_schedules SET
         status = COALESCE($2, status),
         submitted_on = CASE WHEN $2 = 'submitted' THEN CURRENT_DATE
                             WHEN $2 = 'pending' THEN NULL
                             ELSE submitted_on END,
         due_date = COALESCE($3, due_date),
         notes = COALESCE($4, notes)
       WHERE id = $1 RETURNING *`,
      [req.params.reportId, status ?? null, due_date ?? null, notes ?? null]
    );
    if (!r.rows.length) throw ApiError.notFound('Report schedule not found');
    res.json({ success: true, data: r.rows[0] });
  })
);

router.delete(
  '/reports/:reportId',
  manage,
  asyncHandler(async (req, res) => {
    const r = await query('DELETE FROM donor_report_schedules WHERE id = $1 RETURNING id', [req.params.reportId]);
    if (!r.rows.length) throw ApiError.notFound('Report schedule not found');
    res.json({ success: true, message: 'Deleted' });
  })
);

/* --------------------------- DONOR CRUD --------------------------- */
router.get('/:id', crud.getOne);
router.post('/', manage, rules, validate, crud.create);
router.put('/:id', manage, crud.update);
router.delete('/:id', authorize('admin', 'manager'), crud.remove);

module.exports = router;

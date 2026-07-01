const express = require('express');
const { body } = require('express-validator');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const crudFactory = require('../../utils/crudFactory');
const { query } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const { recordAudit, diff } = require('../../utils/audit');

const GRANT_FIELDS = ['title', 'donor_id', 'amount', 'currency', 'start_date', 'end_date', 'status', 'notes'];
const EXP_FIELDS = ['grant_id', 'project_id', 'category', 'description', 'amount', 'spent_on'];

const router = express.Router();
router.use(authenticate);

const finance = authorize('admin', 'manager', 'finance');

/* ----------------------------- GRANTS ----------------------------- */
const grantCrud = crudFactory({
  table: 'grants',
  fields: [
    'id', 'title', 'donor_id', 'amount', 'currency', 'start_date', 'end_date',
    'status', 'notes', 'created_at', 'updated_at',
  ],
  writable: [
    'title', 'donor_id', 'amount', 'currency', 'start_date', 'end_date', 'status', 'notes',
  ],
  searchable: ['title'],
  orderBy: 'created_at DESC',
});

const grantRules = [
  body('title').trim().notEmpty().withMessage('Grant title required'),
  body('amount').optional().isFloat({ min: 0 }),
  body('donor_id').optional({ nullable: true }).isUUID(),
  body('status').optional().isIn(['pledged', 'active', 'closed', 'cancelled']),
];

router.get('/grants', grantCrud.list);

// Grant detail with utilization (spent vs remaining)
router.get(
  '/grants/:id',
  asyncHandler(async (req, res) => {
    const g = await query('SELECT * FROM grants WHERE id = $1', [req.params.id]);
    if (!g.rows.length) throw ApiError.notFound('Grant not found');
    const spentRes = await query(
      'SELECT COALESCE(SUM(amount),0)::numeric AS spent FROM expenditures WHERE grant_id = $1',
      [req.params.id]
    );
    const grant = g.rows[0];
    const spent = Number(spentRes.rows[0].spent);
    res.json({
      success: true,
      data: {
        ...grant,
        spent,
        remaining: Number(grant.amount) - spent,
        utilization_pct: grant.amount > 0 ? Math.round((spent / grant.amount) * 100) : 0,
      },
    });
  })
);

router.post(
  '/grants', finance, grantRules, validate,
  asyncHandler(async (req, res) => {
    const cols = GRANT_FIELDS.filter((f) => req.body[f] !== undefined);
    const r = await query(
      `INSERT INTO grants (${cols.join(', ')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      cols.map((f) => req.body[f])
    );
    await recordAudit({ entityType: 'grant', entityId: r.rows[0].id, action: 'create',
      changes: { title: r.rows[0].title, amount: r.rows[0].amount }, actor: req.user });
    res.status(201).json({ success: true, data: r.rows[0] });
  })
);

router.put(
  '/grants/:id', finance,
  asyncHandler(async (req, res) => {
    const before = (await query('SELECT * FROM grants WHERE id = $1', [req.params.id])).rows[0];
    if (!before) throw ApiError.notFound('Grant not found');
    const sets = GRANT_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(req.body, f));
    if (!sets.length) throw ApiError.badRequest('No valid fields to update');
    const r = await query(
      `UPDATE grants SET ${sets.map((f, i) => `${f} = $${i + 1}`).join(', ')}
       WHERE id = $${sets.length + 1} RETURNING *`,
      [...sets.map((f) => req.body[f]), req.params.id]
    );
    const changes = diff(before, r.rows[0], GRANT_FIELDS);
    if (Object.keys(changes).length) {
      await recordAudit({ entityType: 'grant', entityId: req.params.id, action: 'update', changes, actor: req.user });
    }
    res.json({ success: true, data: r.rows[0] });
  })
);

router.delete(
  '/grants/:id', authorize('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const r = await query('DELETE FROM grants WHERE id = $1 RETURNING *', [req.params.id]);
    if (!r.rows.length) throw ApiError.notFound('Grant not found');
    await recordAudit({ entityType: 'grant', entityId: req.params.id, action: 'delete',
      changes: { title: r.rows[0].title, amount: r.rows[0].amount }, actor: req.user });
    res.json({ success: true, message: 'Deleted' });
  })
);

/* -------------------------- EXPENDITURES -------------------------- */
const expCrud = crudFactory({
  table: 'expenditures',
  fields: [
    'id', 'grant_id', 'project_id', 'category', 'description', 'amount',
    'spent_on', 'recorded_by', 'created_at', 'updated_at',
  ],
  writable: [
    'grant_id', 'project_id', 'category', 'description', 'amount', 'spent_on',
  ],
  searchable: ['category', 'description'],
  orderBy: 'spent_on DESC',
});

const expRules = [
  body('amount').isFloat({ min: 0 }).withMessage('amount must be a positive number'),
  body('grant_id').optional({ nullable: true }).isUUID(),
  body('project_id').optional({ nullable: true }).isUUID(),
];

// record recorded_by from token
const attachRecorder = (req, _res, next) => {
  req.body.recorded_by = req.user.id;
  next();
};

router.get('/expenditures', expCrud.list);
router.get('/expenditures/:id', expCrud.getOne);
router.post('/expenditures', finance, expRules, validate, attachRecorder,
  asyncHandler(async (req, res) => {
    const r = await query(
      `INSERT INTO expenditures
        (grant_id, project_id, category, description, amount, spent_on, recorded_by)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,CURRENT_DATE),$7)
       RETURNING *`,
      [
        req.body.grant_id || null,
        req.body.project_id || null,
        req.body.category || null,
        req.body.description || null,
        req.body.amount,
        req.body.spent_on || null,
        req.user.id,
      ]
    );
    await recordAudit({ entityType: 'expenditure', entityId: r.rows[0].id, action: 'create',
      changes: { amount: r.rows[0].amount, category: r.rows[0].category }, actor: req.user });
    res.status(201).json({ success: true, data: r.rows[0] });
  })
);

router.put(
  '/expenditures/:id', finance,
  asyncHandler(async (req, res) => {
    const before = (await query('SELECT * FROM expenditures WHERE id = $1', [req.params.id])).rows[0];
    if (!before) throw ApiError.notFound('Expenditure not found');
    const sets = EXP_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(req.body, f));
    if (!sets.length) throw ApiError.badRequest('No valid fields to update');
    const r = await query(
      `UPDATE expenditures SET ${sets.map((f, i) => `${f} = $${i + 1}`).join(', ')}
       WHERE id = $${sets.length + 1} RETURNING *`,
      [...sets.map((f) => req.body[f]), req.params.id]
    );
    const changes = diff(before, r.rows[0], EXP_FIELDS);
    if (Object.keys(changes).length) {
      await recordAudit({ entityType: 'expenditure', entityId: req.params.id, action: 'update', changes, actor: req.user });
    }
    res.json({ success: true, data: r.rows[0] });
  })
);

router.delete(
  '/expenditures/:id', finance,
  asyncHandler(async (req, res) => {
    const r = await query('DELETE FROM expenditures WHERE id = $1 RETURNING *', [req.params.id]);
    if (!r.rows.length) throw ApiError.notFound('Expenditure not found');
    await recordAudit({ entityType: 'expenditure', entityId: req.params.id, action: 'delete',
      changes: { amount: r.rows[0].amount, category: r.rows[0].category }, actor: req.user });
    res.json({ success: true, message: 'Deleted' });
  })
);

/* ---------------------------- AUDIT TRAIL ------------------------- */
router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const params = [];
    let where = '';
    if (req.query.entity_type) {
      params.push(req.query.entity_type);
      where = `WHERE entity_type = $1`;
    }
    const r = await query(
      `SELECT id, entity_type, entity_id, action, changes, actor_name, created_at
       FROM audit_logs ${where}
       ORDER BY created_at DESC LIMIT 100`,
      params
    );
    res.json({ success: true, data: r.rows });
  })
);

/* ---------------------------- SUMMARY ----------------------------- */
router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const totals = await query(`
      SELECT
        (SELECT COALESCE(SUM(amount),0) FROM grants WHERE status IN ('active','pledged')) AS total_grants,
        (SELECT COALESCE(SUM(amount),0) FROM expenditures) AS total_spent`);
    const byCategory = await query(`
      SELECT COALESCE(category,'Uncategorized') AS category, SUM(amount)::numeric AS total
      FROM expenditures GROUP BY category ORDER BY total DESC`);
    const t = totals.rows[0];
    res.json({
      success: true,
      data: {
        total_grants: Number(t.total_grants),
        total_spent: Number(t.total_spent),
        total_remaining: Number(t.total_grants) - Number(t.total_spent),
        by_category: byCategory.rows,
      },
    });
  })
);

module.exports = router;

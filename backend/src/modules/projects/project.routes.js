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

const manage = authorize('admin', 'manager');

/* ---------------------------- PROJECTS ---------------------------- */
const projectCrud = crudFactory({
  table: 'projects',
  fields: [
    'id', 'name', 'description', 'grant_id', 'manager_id', 'village',
    'start_date', 'end_date', 'budget', 'status', 'created_at', 'updated_at',
  ],
  writable: [
    'name', 'description', 'grant_id', 'manager_id', 'village',
    'start_date', 'end_date', 'budget', 'status',
  ],
  searchable: ['name', 'village'],
  orderBy: 'created_at DESC',
});

const projectRules = [
  body('name').trim().notEmpty().withMessage('Project name required'),
  body('budget').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(['planned', 'active', 'on_hold', 'completed', 'cancelled']),
];

router.get('/', projectCrud.list);

// Project detail with milestones, assignments and spend
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const p = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (!p.rows.length) throw ApiError.notFound('Project not found');

    const milestones = await query(
      'SELECT * FROM milestones WHERE project_id = $1 ORDER BY due_date NULLS LAST',
      [id]
    );
    const assignments = await query(
      `SELECT pa.id, pa.user_id, pa.role_on_project, pa.assigned_at,
              u.full_name, u.email
       FROM project_assignments pa
       JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = $1`,
      [id]
    );
    const spent = await query(
      'SELECT COALESCE(SUM(amount),0)::numeric AS spent FROM expenditures WHERE project_id = $1',
      [id]
    );
    const enroll = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'employed')::int AS employed,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
       FROM enrollments WHERE project_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...p.rows[0],
        spent: Number(spent.rows[0].spent),
        milestones: milestones.rows,
        assignments: assignments.rows,
        enrollment: enroll.rows[0],
      },
    });
  })
);

router.post('/', manage, projectRules, validate, projectCrud.create);
router.put('/:id', manage, projectCrud.update);
router.delete('/:id', authorize('admin'), projectCrud.remove);

/* --------------------------- MILESTONES --------------------------- */
router.post(
  '/:id/milestones',
  manage,
  [body('title').trim().notEmpty().withMessage('Milestone title required')],
  validate,
  asyncHandler(async (req, res) => {
    const { title, description, due_date, status } = req.body;
    const r = await query(
      `INSERT INTO milestones (project_id, title, description, due_date, status)
       VALUES ($1,$2,$3,$4,COALESCE($5,'pending')) RETURNING *`,
      [req.params.id, title, description || null, due_date || null, status || null]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  })
);

router.put(
  '/milestones/:milestoneId',
  manage,
  asyncHandler(async (req, res) => {
    const { title, description, due_date, status } = req.body;
    const r = await query(
      `UPDATE milestones SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         due_date = COALESCE($4, due_date),
         status = COALESCE($5, status)
       WHERE id = $1 RETURNING *`,
      [req.params.milestoneId, title ?? null, description ?? null, due_date ?? null, status ?? null]
    );
    if (!r.rows.length) throw ApiError.notFound('Milestone not found');
    res.json({ success: true, data: r.rows[0] });
  })
);

router.delete(
  '/milestones/:milestoneId',
  manage,
  asyncHandler(async (req, res) => {
    const r = await query('DELETE FROM milestones WHERE id = $1 RETURNING id', [req.params.milestoneId]);
    if (!r.rows.length) throw ApiError.notFound('Milestone not found');
    res.json({ success: true, message: 'Milestone deleted' });
  })
);

/* -------------------------- ASSIGNMENTS --------------------------- */
router.post(
  '/:id/assignments',
  manage,
  [body('user_id').isUUID().withMessage('Valid user_id required')],
  validate,
  asyncHandler(async (req, res) => {
    const { user_id, role_on_project } = req.body;
    const r = await query(
      `INSERT INTO project_assignments (project_id, user_id, role_on_project)
       VALUES ($1,$2,$3)
       ON CONFLICT (project_id, user_id)
       DO UPDATE SET role_on_project = EXCLUDED.role_on_project
       RETURNING *`,
      [req.params.id, user_id, role_on_project || null]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  })
);

router.delete(
  '/assignments/:assignmentId',
  manage,
  asyncHandler(async (req, res) => {
    const r = await query('DELETE FROM project_assignments WHERE id = $1 RETURNING id', [req.params.assignmentId]);
    if (!r.rows.length) throw ApiError.notFound('Assignment not found');
    res.json({ success: true, message: 'Assignment removed' });
  })
);

/* -------------------------- ENROLLMENTS --------------------------- */
// List beneficiaries enrolled in a project (with their details)
router.get(
  '/:id/enrollments',
  asyncHandler(async (req, res) => {
    const r = await query(
      `SELECT e.id, e.beneficiary_id, e.enrolled_on, e.status, e.outcome,
              e.outcome_income, e.notes,
              b.full_name, b.village, b.skills, b.monthly_income AS baseline_income
       FROM enrollments e
       JOIN beneficiaries b ON b.id = e.beneficiary_id
       WHERE e.project_id = $1
       ORDER BY b.full_name`,
      [req.params.id]
    );
    res.json({ success: true, data: r.rows });
  })
);

// Enroll a beneficiary into a project
router.post(
  '/:id/enrollments',
  manage,
  [
    body('beneficiary_id').isUUID().withMessage('Valid beneficiary_id required'),
    body('status').optional().isIn(['enrolled', 'in_training', 'completed', 'employed', 'dropped_out']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { beneficiary_id, status, notes } = req.body;
    const r = await query(
      `INSERT INTO enrollments (project_id, beneficiary_id, status, notes)
       VALUES ($1, $2, COALESCE($3,'enrolled'), $4)
       ON CONFLICT (project_id, beneficiary_id)
       DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes
       RETURNING *`,
      [req.params.id, beneficiary_id, status || null, notes || null]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  })
);

// Update an enrollment's status / outcome / income
router.put(
  '/enrollments/:enrollmentId',
  manage,
  [
    body('status').optional().isIn(['enrolled', 'in_training', 'completed', 'employed', 'dropped_out']),
    body('outcome_income').optional({ nullable: true }).isFloat({ min: 0 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { status, outcome, outcome_income, notes } = req.body;
    const r = await query(
      `UPDATE enrollments SET
         status = COALESCE($2, status),
         outcome = COALESCE($3, outcome),
         outcome_income = COALESCE($4, outcome_income),
         notes = COALESCE($5, notes)
       WHERE id = $1 RETURNING *`,
      [req.params.enrollmentId, status ?? null, outcome ?? null, outcome_income ?? null, notes ?? null]
    );
    if (!r.rows.length) throw ApiError.notFound('Enrollment not found');
    res.json({ success: true, data: r.rows[0] });
  })
);

router.delete(
  '/enrollments/:enrollmentId',
  manage,
  asyncHandler(async (req, res) => {
    const r = await query('DELETE FROM enrollments WHERE id = $1 RETURNING id', [req.params.enrollmentId]);
    if (!r.rows.length) throw ApiError.notFound('Enrollment not found');
    res.json({ success: true, message: 'Enrollment removed' });
  })
);

module.exports = router;

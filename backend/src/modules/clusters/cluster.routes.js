const express = require('express');
const { body } = require('express-validator');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const { query } = require('../../config/db');
const ApiError = require('../../utils/ApiError');

const router = express.Router();
router.use(authenticate);

const FIELDS = 'id, name, description, village, created_at, updated_at';

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT c.id, c.name, c.description, c.village, c.created_at, c.updated_at,
              COUNT(b.id)::int AS beneficiary_count
       FROM clusters c
       LEFT JOIN beneficiaries b ON b.cluster_id = c.id
       GROUP BY c.id
       ORDER BY c.name`
    );
    res.json({ success: true, data: result.rows });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await query(`SELECT ${FIELDS} FROM clusters WHERE id = $1`, [req.params.id]);
    if (!result.rows.length) throw ApiError.notFound('Cluster not found');
    res.json({ success: true, data: result.rows[0] });
  })
);

router.post(
  '/',
  authorize('admin', 'manager'),
  [body('name').trim().notEmpty().withMessage('Name required')],
  validate,
  asyncHandler(async (req, res) => {
    const { name, description, village } = req.body;
    const result = await query(
      `INSERT INTO clusters (name, description, village)
       VALUES ($1, $2, $3) RETURNING ${FIELDS}`,
      [name, description || null, village || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  })
);

router.put(
  '/:id',
  authorize('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const { name, description, village } = req.body;
    const result = await query(
      `UPDATE clusters
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           village = COALESCE($4, village)
       WHERE id = $1 RETURNING ${FIELDS}`,
      [req.params.id, name ?? null, description ?? null, village ?? null]
    );
    if (!result.rows.length) throw ApiError.notFound('Cluster not found');
    res.json({ success: true, data: result.rows[0] });
  })
);

router.delete(
  '/:id',
  authorize('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const result = await query('DELETE FROM clusters WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) throw ApiError.notFound('Cluster not found');
    res.json({ success: true, message: 'Cluster deleted' });
  })
);

module.exports = router;

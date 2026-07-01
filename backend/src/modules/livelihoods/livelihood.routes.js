const express = require('express');
const { body } = require('express-validator');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const crudFactory = require('../../utils/crudFactory');
const service = require('./livelihood.service');

const router = express.Router();
router.use(authenticate);

const manage = authorize('admin', 'manager', 'field_staff');

/* ----------------------- OPPORTUNITIES (CRUD) --------------------- */
const crud = crudFactory({
  table: 'livelihood_opportunities',
  fields: [
    'id', 'title', 'organization', 'type', 'required_skills', 'location',
    'positions', 'monthly_wage', 'status', 'description', 'contact',
    'created_at', 'updated_at',
  ],
  writable: [
    'title', 'organization', 'type', 'required_skills', 'location',
    'positions', 'monthly_wage', 'status', 'description', 'contact',
  ],
  searchable: ['title', 'organization', 'location'],
  orderBy: 'created_at DESC',
});

const oppRules = [
  body('title').trim().notEmpty().withMessage('Title required'),
  body('type').optional().isIn(['job', 'self_employment', 'apprenticeship', 'scheme']),
  body('required_skills').optional().isArray().withMessage('required_skills must be an array'),
  body('monthly_wage').optional({ nullable: true }).isFloat({ min: 0 }),
  body('positions').optional({ nullable: true }).isInt({ min: 0 }),
  body('status').optional().isIn(['open', 'filled', 'closed']),
];

router.get('/', crud.list);

/* --------- specific routes BEFORE '/:id' to avoid shadowing -------- */
// AI-ranked candidate beneficiaries for an opportunity
router.get(
  '/:id/candidates',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.candidates(req.params.id) });
  })
);

// Matches for an opportunity
router.get(
  '/:id/matches',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.listMatches(req.params.id) });
  })
);

router.post(
  '/:id/matches',
  manage,
  [body('beneficiary_id').isUUID().withMessage('Valid beneficiary_id required')],
  validate,
  asyncHandler(async (req, res) => {
    const m = await service.createMatch(req.params.id, req.body.beneficiary_id, req.body.status);
    res.status(201).json({ success: true, data: m });
  })
);

router.put(
  '/matches/:matchId',
  manage,
  [body('status').optional().isIn(['suggested', 'applied', 'placed', 'rejected'])],
  validate,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.updateMatch(req.params.matchId, req.body) });
  })
);

router.delete(
  '/matches/:matchId',
  manage,
  asyncHandler(async (req, res) => {
    await service.removeMatch(req.params.matchId);
    res.json({ success: true, message: 'Match removed' });
  })
);

router.get('/:id', crud.getOne);
router.post('/', manage, oppRules, validate, crud.create);
router.put('/:id', manage, crud.update);
router.delete('/:id', authorize('admin', 'manager'), crud.remove);

module.exports = router;

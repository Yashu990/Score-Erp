const express = require('express');
const { body } = require('express-validator');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./beneficiary.controller');

const router = express.Router();

router.use(authenticate);

const writeRoles = authorize('admin', 'manager', 'field_staff');

const createRules = [
  body('full_name').trim().notEmpty().withMessage('Full name required'),
  body('gender').optional().isIn(['male', 'female', 'other']),
  body('date_of_birth').optional({ nullable: true }).isISO8601().withMessage('Invalid date'),
  body('monthly_income').optional({ nullable: true }).isFloat({ min: 0 }),
  body('household_size').optional({ nullable: true }).isInt({ min: 0 }),
  body('skills').optional().isArray().withMessage('skills must be an array'),
  body('cluster_id').optional({ nullable: true }).isUUID().withMessage('Invalid cluster_id'),
  body('status').optional().isIn(['active', 'inactive', 'graduated']),
];

router.get('/', ctrl.list);
router.get('/stats', ctrl.stats);
router.post('/bulk-import', writeRoles, ctrl.bulkImport);
router.get('/:id', ctrl.getOne);
router.post('/', writeRoles, createRules, validate, ctrl.create);
router.put('/:id', writeRoles, ctrl.update);
router.delete('/:id', authorize('admin', 'manager'), ctrl.remove);

module.exports = router;

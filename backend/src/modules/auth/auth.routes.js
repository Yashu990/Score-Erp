const express = require('express');
const { body } = require('express-validator');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const ctrl = require('./auth.controller');

const router = express.Router();

const ROLES = ['admin', 'manager', 'finance', 'field_staff', 'viewer'];

// Public
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password required'),
  ],
  validate,
  ctrl.login
);

// Authenticated — own profile
router.get('/me', authenticate, ctrl.me);

router.put(
  '/me',
  authenticate,
  [
    body('full_name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('phone').optional({ nullable: true }).trim(),
    body('avatar_url').optional({ nullable: true }).isString(),
  ],
  validate,
  ctrl.updateMe
);

router.put(
  '/me/password',
  authenticate,
  [
    body('current_password').notEmpty().withMessage('Current password required'),
    body('new_password').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  ],
  validate,
  ctrl.changePassword
);

// Admin-only user management
router.post(
  '/register',
  authenticate,
  authorize('admin'),
  [
    body('full_name').trim().notEmpty().withMessage('Full name required'),
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(ROLES).withMessage('Invalid role'),
  ],
  validate,
  ctrl.register
);

router.get('/users', authenticate, authorize('admin', 'manager'), ctrl.listUsers);

router.patch(
  '/users/:id/active',
  authenticate,
  authorize('admin'),
  [body('is_active').isBoolean().withMessage('is_active must be boolean')],
  validate,
  ctrl.setActive
);

module.exports = router;

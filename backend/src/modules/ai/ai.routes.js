const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./ai.service');

const router = express.Router();
router.use(authenticate);

/** GET /api/ai/skill-clusters?k=4 — unsupervised clustering of beneficiaries by skills */
router.get(
  '/skill-clusters',
  asyncHandler(async (req, res) => {
    const k = Math.max(1, Math.min(parseInt(req.query.k, 10) || 4, 12));
    res.json({ success: true, data: await service.skillClusters(k) });
  })
);

/** GET /api/ai/skill-insights — frequencies, co-occurrence, multi-skilled stats */
router.get(
  '/skill-insights',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await service.skillInsights() });
  })
);

/** GET /api/ai/recommendations/:beneficiaryId — livelihood + upskilling suggestions */
router.get(
  '/recommendations/:beneficiaryId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.recommendForBeneficiary(req.params.beneficiaryId) });
  })
);

/** POST /api/ai/auto-cluster?k=4 — create cluster records and assign beneficiaries */
router.post(
  '/auto-cluster',
  authorize('admin', 'manager'),
  asyncHandler(async (req, res) => {
    const k = Math.max(1, Math.min(parseInt(req.query.k, 10) || 4, 12));
    res.json({ success: true, data: await service.autoAssignClusters(k) });
  })
);

module.exports = router;

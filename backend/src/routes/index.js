const express = require('express');

const authRoutes = require('../modules/auth/auth.routes');
const beneficiaryRoutes = require('../modules/beneficiaries/beneficiary.routes');
const clusterRoutes = require('../modules/clusters/cluster.routes');
const donorRoutes = require('../modules/donors/donor.routes');
const financeRoutes = require('../modules/finance/finance.routes');
const projectRoutes = require('../modules/projects/project.routes');
const hrRoutes = require('../modules/hr/hr.routes');
const reportRoutes = require('../modules/reports/report.routes');
const aiRoutes = require('../modules/ai/ai.routes');
const livelihoodRoutes = require('../modules/livelihoods/livelihood.routes');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    success: true,
    name: 'SCORE NGO ERP API',
    version: '1.0.0',
    modules: [
      'auth', 'beneficiaries', 'clusters', 'donors',
      'finance', 'projects', 'hr', 'reports', 'ai', 'livelihoods',
    ],
  });
});

router.use('/auth', authRoutes);
router.use('/beneficiaries', beneficiaryRoutes);
router.use('/clusters', clusterRoutes);
router.use('/donors', donorRoutes);
router.use('/finance', financeRoutes);
router.use('/projects', projectRoutes);
router.use('/hr', hrRoutes);
router.use('/reports', reportRoutes);
router.use('/ai', aiRoutes);
router.use('/livelihoods', livelihoodRoutes);

module.exports = router;

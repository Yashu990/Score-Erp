const asyncHandler = require('../../utils/asyncHandler');
const { getPagination, paginated } = require('../../utils/pagination');
const service = require('./beneficiary.service');

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const filters = {
    search: req.query.search,
    village: req.query.village,
    cluster_id: req.query.cluster_id,
    status: req.query.status,
    skill: req.query.skill,
  };
  const { rows, total } = await service.list(filters, { limit, offset });
  res.json(paginated(rows, total, page, limit));
});

const stats = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await service.stats() });
});

const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getById(req.params.id) });
});

const create = asyncHandler(async (req, res) => {
  const created = await service.create(req.body, req.user.id);
  res.status(201).json({ success: true, data: created });
});

const update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.update(req.params.id, req.body) });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ success: true, message: 'Beneficiary deleted' });
});

const bulkImport = asyncHandler(async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) {
    return res.status(400).json({ success: false, message: 'No rows provided' });
  }
  if (rows.length > 5000) {
    return res.status(400).json({ success: false, message: 'Too many rows (max 5000 per import)' });
  }
  const result = await service.bulkImport(rows, req.user.id);
  res.json({ success: true, data: result });
});

module.exports = { list, stats, getOne, create, update, remove, bulkImport };

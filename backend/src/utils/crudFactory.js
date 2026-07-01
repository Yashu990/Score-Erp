const { query } = require('../config/db');
const asyncHandler = require('./asyncHandler');
const { getPagination, paginated } = require('./pagination');
const ApiError = require('./ApiError');

/**
 * Builds standard CRUD controller handlers for a simple table.
 *
 * @param {object} cfg
 * @param {string} cfg.table        - table name
 * @param {string[]} cfg.fields     - columns to return
 * @param {string[]} cfg.writable   - columns accepted on create/update
 * @param {string[]} [cfg.searchable] - columns used by ?search (ILIKE)
 * @param {string} [cfg.orderBy]    - default ORDER BY clause
 */
function crudFactory(cfg) {
  const {
    table,
    fields,
    writable,
    searchable = [],
    orderBy = 'created_at DESC',
  } = cfg;
  const selectCols = fields.join(', ');

  const list = asyncHandler(async (req, res) => {
    const { page, limit, offset } = getPagination(req.query);
    const where = [];
    const params = [];
    let i = 1;

    if (req.query.search && searchable.length) {
      const ors = searchable.map((c) => `${c} ILIKE $${i}`);
      where.push(`(${ors.join(' OR ')})`);
      params.push(`%${req.query.search}%`);
      i++;
    }

    // exact-match filters for any writable column passed as a query param
    for (const col of writable) {
      if (req.query[col] !== undefined) {
        where.push(`${col} = $${i}`);
        params.push(req.query[col]);
        i++;
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRes = await query(
      `SELECT COUNT(*)::int AS count FROM ${table} ${whereSql}`,
      params
    );
    const dataRes = await query(
      `SELECT ${selectCols} FROM ${table} ${whereSql}
       ORDER BY ${orderBy} LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    );
    res.json(paginated(dataRes.rows, totalRes.rows[0].count, page, limit));
  });

  const getOne = asyncHandler(async (req, res) => {
    const r = await query(`SELECT ${selectCols} FROM ${table} WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) throw ApiError.notFound(`${table} record not found`);
    res.json({ success: true, data: r.rows[0] });
  });

  const create = asyncHandler(async (req, res) => {
    const cols = [];
    const placeholders = [];
    const params = [];
    let i = 1;
    for (const col of writable) {
      if (req.body[col] !== undefined) {
        cols.push(col);
        placeholders.push(`$${i}`);
        params.push(req.body[col]);
        i++;
      }
    }
    if (!cols.length) throw ApiError.badRequest('No valid fields provided');
    const r = await query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
       RETURNING ${selectCols}`,
      params
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  });

  const update = asyncHandler(async (req, res) => {
    const sets = [];
    const params = [];
    let i = 1;
    for (const col of writable) {
      if (Object.prototype.hasOwnProperty.call(req.body, col)) {
        sets.push(`${col} = $${i}`);
        params.push(req.body[col]);
        i++;
      }
    }
    if (!sets.length) throw ApiError.badRequest('No valid fields to update');
    params.push(req.params.id);
    const r = await query(
      `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${selectCols}`,
      params
    );
    if (!r.rows.length) throw ApiError.notFound(`${table} record not found`);
    res.json({ success: true, data: r.rows[0] });
  });

  const remove = asyncHandler(async (req, res) => {
    const r = await query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) throw ApiError.notFound(`${table} record not found`);
    res.json({ success: true, message: 'Deleted' });
  });

  return { list, getOne, create, update, remove };
}

module.exports = crudFactory;

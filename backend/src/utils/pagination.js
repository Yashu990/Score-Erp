/**
 * Parses ?page & ?limit query params into { limit, offset, page }.
 * Defaults: page 1, limit 20 (max 100).
 */
function getPagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (Number.isNaN(page) || page < 1) page = 1;
  if (Number.isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Builds a standard paginated envelope.
 */
function paginated(rows, total, page, limit) {
  return {
    success: true,
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

module.exports = { getPagination, paginated };

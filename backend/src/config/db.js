const { Pool } = require('pg');
const env = require('./env');

/**
 * Single shared PostgreSQL connection pool for the whole app.
 */
const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected PostgreSQL pool error:', err);
});

/**
 * Run a single query against the pool.
 * @param {string} text - SQL text with $1, $2 ... placeholders
 * @param {Array} [params] - parameter values
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Acquire a client for a transaction. Caller MUST release it.
 * Usage:
 *   const client = await getClient();
 *   try { await client.query('BEGIN'); ...; await client.query('COMMIT'); }
 *   catch (e) { await client.query('ROLLBACK'); throw e; }
 *   finally { client.release(); }
 */
function getClient() {
  return pool.connect();
}

module.exports = { pool, query, getClient };

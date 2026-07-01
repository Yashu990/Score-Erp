/**
 * Runs schema.sql against the configured database.
 * Usage: npm run db:migrate
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // eslint-disable-next-line no-console
  console.log('Running migrations from schema.sql ...');
  try {
    await pool.query(sql);
    // eslint-disable-next-line no-console
    console.log('✅ Migration complete.');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();

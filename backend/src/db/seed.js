/**
 * Seeds a default admin user and a little sample data.
 * Safe to re-run: uses ON CONFLICT to avoid duplicates.
 * Usage: npm run db:seed
 */
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

async function seed() {
  try {
    const adminEmail = 'admin@score.org';
    const adminPassword = 'Admin@123';
    const hash = await bcrypt.hash(adminPassword, 10);

    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      ['SCORE Admin', adminEmail, hash]
    );

    await pool.query(
      `INSERT INTO clusters (name, description, village)
       VALUES ('Stitching Cluster', 'Beneficiaries skilled in stitching/tailoring', 'Rampur')
       ON CONFLICT DO NOTHING`
    );

    // eslint-disable-next-line no-console
    console.log('✅ Seed complete.');
    // eslint-disable-next-line no-console
    console.log(`   Admin login -> ${adminEmail} / ${adminPassword}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();

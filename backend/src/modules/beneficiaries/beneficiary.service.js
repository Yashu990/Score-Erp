const { query } = require('../../config/db');
const ApiError = require('../../utils/ApiError');

const FIELDS = `
  id, code, full_name, gender, date_of_birth, phone, village, district, state,
  education, occupation, monthly_income, household_size, household_head,
  skills, cluster_id, status, notes, created_by, created_at, updated_at`;

/**
 * List with optional filters: search, village, cluster_id, skill, status.
 * Returns { rows, total }.
 */
async function list(filters, { limit, offset }) {
  const where = [];
  const params = [];
  let i = 1;

  if (filters.search) {
    where.push(`(full_name ILIKE $${i} OR code ILIKE $${i} OR phone ILIKE $${i})`);
    params.push(`%${filters.search}%`);
    i++;
  }
  if (filters.village) {
    where.push(`village ILIKE $${i}`);
    params.push(`%${filters.village}%`);
    i++;
  }
  if (filters.cluster_id) {
    where.push(`cluster_id = $${i}`);
    params.push(filters.cluster_id);
    i++;
  }
  if (filters.status) {
    where.push(`status = $${i}`);
    params.push(filters.status);
    i++;
  }
  if (filters.skill) {
    // matches any beneficiary whose skills array contains the given skill
    where.push(`$${i} = ANY (skills)`);
    params.push(filters.skill);
    i++;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRes = await query(
    `SELECT COUNT(*)::int AS count FROM beneficiaries ${whereSql}`,
    params
  );
  const total = totalRes.rows[0].count;

  const dataRes = await query(
    `SELECT ${FIELDS} FROM beneficiaries ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );

  return { rows: dataRes.rows, total };
}

async function getById(id) {
  const res = await query(`SELECT ${FIELDS} FROM beneficiaries WHERE id = $1`, [id]);
  if (!res.rows.length) throw ApiError.notFound('Beneficiary not found');
  return res.rows[0];
}

async function create(data, userId) {
  const res = await query(
    `INSERT INTO beneficiaries
       (code, full_name, gender, date_of_birth, phone, village, district, state,
        education, occupation, monthly_income, household_size, household_head,
        skills, cluster_id, status, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'Gujarat'),
             $9,$10,$11,$12,$13,
             COALESCE($14::text[],'{}'),$15,COALESCE($16,'active'),$17,$18)
     RETURNING ${FIELDS}`,
    [
      data.code || null,
      data.full_name,
      data.gender || null,
      data.date_of_birth || null,
      data.phone || null,
      data.village || null,
      data.district || null,
      data.state || null,
      data.education || null,
      data.occupation || null,
      data.monthly_income ?? null,
      data.household_size ?? null,
      data.household_head || null,
      data.skills || null,
      data.cluster_id || null,
      data.status || null,
      data.notes || null,
      userId || null,
    ]
  );
  return res.rows[0];
}

const UPDATABLE = [
  'code', 'full_name', 'gender', 'date_of_birth', 'phone', 'village', 'district',
  'state', 'education', 'occupation', 'monthly_income', 'household_size',
  'household_head', 'skills', 'cluster_id', 'status', 'notes',
];

async function update(id, data) {
  const sets = [];
  const params = [];
  let i = 1;

  for (const key of UPDATABLE) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      sets.push(`${key} = $${i}`);
      params.push(data[key]);
      i++;
    }
  }
  if (!sets.length) throw ApiError.badRequest('No valid fields to update');

  params.push(id);
  const res = await query(
    `UPDATE beneficiaries SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${FIELDS}`,
    params
  );
  if (!res.rows.length) throw ApiError.notFound('Beneficiary not found');
  return res.rows[0];
}

async function remove(id) {
  const res = await query('DELETE FROM beneficiaries WHERE id = $1 RETURNING id', [id]);
  if (!res.rows.length) throw ApiError.notFound('Beneficiary not found');
  return { id };
}

/**
 * Aggregate stats for dashboards: counts by skill, village, status.
 */
async function stats() {
  const bySkill = await query(
    `SELECT skill, COUNT(*)::int AS count
     FROM beneficiaries, UNNEST(skills) AS skill
     GROUP BY skill ORDER BY count DESC`
  );
  const byVillage = await query(
    `SELECT COALESCE(village,'Unknown') AS village, COUNT(*)::int AS count
     FROM beneficiaries GROUP BY village ORDER BY count DESC`
  );
  const byStatus = await query(
    `SELECT status, COUNT(*)::int AS count
     FROM beneficiaries GROUP BY status`
  );
  const totalRes = await query('SELECT COUNT(*)::int AS count FROM beneficiaries');

  return {
    total: totalRes.rows[0].count,
    bySkill: bySkill.rows,
    byVillage: byVillage.rows,
    byStatus: byStatus.rows,
  };
}

/**
 * Bulk import beneficiaries. Each row is validated individually; valid rows are
 * inserted in a single transaction, invalid rows are reported back (not fatal).
 * @returns {{ inserted: number, skipped: number, errors: Array }}
 */
async function bulkImport(rows, userId) {
  const { getClient } = require('../../config/db');
  const valid = [];
  const errors = [];

  rows.forEach((raw, idx) => {
    const rowNum = idx + 1;
    const name = (raw.full_name || '').toString().trim();
    if (!name) {
      errors.push({ row: rowNum, message: 'Missing full_name' });
      return;
    }
    const gender = (raw.gender || '').toString().trim().toLowerCase();
    if (gender && !['male', 'female', 'other'].includes(gender)) {
      errors.push({ row: rowNum, message: `Invalid gender "${raw.gender}"` });
      return;
    }
    let skills = raw.skills;
    if (typeof skills === 'string') {
      skills = skills.split(/[;,]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    } else if (!Array.isArray(skills)) {
      skills = [];
    }
    const income = raw.monthly_income === '' || raw.monthly_income == null ? null : Number(raw.monthly_income);
    const hh = raw.household_size === '' || raw.household_size == null ? null : parseInt(raw.household_size, 10);

    valid.push({
      full_name: name,
      gender: gender || null,
      village: (raw.village || '').toString().trim() || null,
      district: (raw.district || '').toString().trim() || null,
      education: (raw.education || '').toString().trim() || null,
      occupation: (raw.occupation || '').toString().trim() || null,
      monthly_income: Number.isNaN(income) ? null : income,
      household_size: Number.isNaN(hh) ? null : hh,
      skills,
      status: 'active',
    });
  });

  let inserted = 0;
  if (valid.length) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      for (const v of valid) {
        await client.query(
          `INSERT INTO beneficiaries
             (full_name, gender, village, district, education, occupation,
              monthly_income, household_size, skills, status, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::text[],'{}'),'active',$10)`,
          [
            v.full_name, v.gender, v.village, v.district, v.education,
            v.occupation, v.monthly_income, v.household_size, v.skills, userId || null,
          ]
        );
        inserted++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return { inserted, skipped: errors.length, errors };
}

module.exports = { list, getById, create, update, remove, stats, bulkImport };

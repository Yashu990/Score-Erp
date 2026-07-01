const bcrypt = require('bcryptjs');
const { query } = require('../../config/db');
const { signToken } = require('../../utils/jwt');
const ApiError = require('../../utils/ApiError');

const PUBLIC_FIELDS =
  'id, full_name, email, phone, avatar_url, role, is_active, last_login_at, created_at';

async function register({ full_name, email, phone, password, role }) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) throw ApiError.conflict('Email is already registered');

  const password_hash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO users (full_name, email, phone, password_hash, role)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'field_staff'))
     RETURNING ${PUBLIC_FIELDS}`,
    [full_name, email, phone || null, password_hash, role || null]
  );
  return result.rows[0];
}

async function login({ email, password }) {
  const result = await query(
    `SELECT id, full_name, email, role, is_active, password_hash
     FROM users WHERE email = $1`,
    [email]
  );
  const user = result.rows[0];
  if (!user) throw ApiError.unauthorized('Invalid email or password');
  if (!user.is_active) throw ApiError.forbidden('Account is deactivated');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw ApiError.unauthorized('Invalid email or password');

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const token = signToken({ sub: user.id, role: user.role, email: user.email });
  delete user.password_hash;
  return { token, user };
}

async function getById(id) {
  const result = await query(
    `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`,
    [id]
  );
  if (!result.rows.length) throw ApiError.notFound('User not found');
  return result.rows[0];
}

async function list() {
  const result = await query(
    `SELECT ${PUBLIC_FIELDS} FROM users ORDER BY created_at DESC`
  );
  return result.rows;
}

async function setActive(id, isActive) {
  const result = await query(
    `UPDATE users SET is_active = $2 WHERE id = $1 RETURNING ${PUBLIC_FIELDS}`,
    [id, isActive]
  );
  if (!result.rows.length) throw ApiError.notFound('User not found');
  return result.rows[0];
}

/** Update the caller's own profile (name, phone, avatar). */
async function updateProfile(id, { full_name, phone, avatar_url }) {
  const sets = [];
  const params = [];
  let i = 1;
  if (full_name !== undefined) { sets.push(`full_name = $${i++}`); params.push(full_name); }
  if (phone !== undefined) { sets.push(`phone = $${i++}`); params.push(phone || null); }
  if (avatar_url !== undefined) { sets.push(`avatar_url = $${i++}`); params.push(avatar_url || null); }
  if (!sets.length) throw ApiError.badRequest('No fields to update');

  params.push(id);
  const result = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${PUBLIC_FIELDS}`,
    params
  );
  if (!result.rows.length) throw ApiError.notFound('User not found');
  return result.rows[0];
}

/** Change the caller's own password after verifying the current one. */
async function changePassword(id, currentPassword, newPassword) {
  const result = await query('SELECT password_hash FROM users WHERE id = $1', [id]);
  if (!result.rows.length) throw ApiError.notFound('User not found');

  const ok = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!ok) throw ApiError.badRequest('Current password is incorrect');

  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, hash]);
  return { updated: true };
}

module.exports = {
  register, login, getById, list, setActive, updateProfile, changePassword,
};

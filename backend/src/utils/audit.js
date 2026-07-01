const { query } = require('../config/db');

/**
 * Append an entry to the immutable audit trail.
 * @param {object} p
 * @param {string} p.entityType  e.g. 'grant'
 * @param {string} p.entityId
 * @param {'create'|'update'|'delete'} p.action
 * @param {object} [p.changes]   snapshot or field diff
 * @param {object} [p.actor]     req.user ({ id, email })
 */
async function recordAudit({ entityType, entityId, action, changes, actor }) {
  try {
    await query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, changes, actor_id, actor_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entityType,
        entityId || null,
        action,
        changes ? JSON.stringify(changes) : null,
        actor?.id || null,
        actor?.email || null,
      ]
    );
  } catch (err) {
    // Auditing must never break the primary operation; log and continue.
    // eslint-disable-next-line no-console
    console.error('audit log failed:', err.message);
  }
}

/** Compute a { field: { from, to } } diff between two rows for the given fields. */
function diff(before, after, fields) {
  const changes = {};
  for (const f of fields) {
    const a = before ? before[f] : undefined;
    const b = after ? after[f] : undefined;
    if (String(a ?? '') !== String(b ?? '')) {
      changes[f] = { from: a ?? null, to: b ?? null };
    }
  }
  return changes;
}

module.exports = { recordAudit, diff };

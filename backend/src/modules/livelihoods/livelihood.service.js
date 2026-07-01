const { query } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const { jaccard } = require('../ai/clustering');

/**
 * AI-ranked candidate beneficiaries for an opportunity, scored by how well
 * their skills overlap the opportunity's required skills (Jaccard similarity),
 * with the exact matched skills surfaced. Already-matched beneficiaries are
 * annotated with their current match status.
 */
async function candidates(opportunityId, limit = 25) {
  const o = await query(
    'SELECT id, title, required_skills FROM livelihood_opportunities WHERE id = $1',
    [opportunityId]
  );
  if (!o.rows.length) throw ApiError.notFound('Opportunity not found');
  const required = o.rows[0].required_skills || [];

  const bens = await query(
    `SELECT id, full_name, village, skills, monthly_income
     FROM beneficiaries
     WHERE array_length(skills, 1) > 0`
  );
  const existing = await query(
    'SELECT beneficiary_id, status FROM opportunity_matches WHERE opportunity_id = $1',
    [opportunityId]
  );
  const statusByBen = new Map(existing.rows.map((m) => [m.beneficiary_id, m.status]));

  const ranked = bens.rows
    .map((b) => {
      const skills = b.skills || [];
      const matchedSkills = skills.filter((s) => required.includes(s));
      const score = required.length ? Math.round(jaccard(required, skills) * 100) : 0;
      return {
        id: b.id,
        full_name: b.full_name,
        village: b.village,
        skills,
        matchedSkills,
        score,
        matchStatus: statusByBen.get(b.id) || null,
      };
    })
    .filter((b) => b.matchedSkills.length > 0)
    .sort((a, b) => b.score - a.score || b.matchedSkills.length - a.matchedSkills.length)
    .slice(0, limit);

  return { opportunity: o.rows[0], required, candidates: ranked };
}

/** Matches for an opportunity, with beneficiary details. */
async function listMatches(opportunityId) {
  const r = await query(
    `SELECT m.id, m.beneficiary_id, m.status, m.match_score, m.notes, m.matched_on,
            b.full_name, b.village, b.skills
     FROM opportunity_matches m
     JOIN beneficiaries b ON b.id = m.beneficiary_id
     WHERE m.opportunity_id = $1
     ORDER BY m.matched_on DESC, b.full_name`,
    [opportunityId]
  );
  return r.rows;
}

/** Create/refresh a match; computes a score from current skill overlap. */
async function createMatch(opportunityId, beneficiaryId, status) {
  const o = await query(
    'SELECT required_skills FROM livelihood_opportunities WHERE id = $1',
    [opportunityId]
  );
  if (!o.rows.length) throw ApiError.notFound('Opportunity not found');
  const b = await query('SELECT skills FROM beneficiaries WHERE id = $1', [beneficiaryId]);
  if (!b.rows.length) throw ApiError.notFound('Beneficiary not found');

  const score = Math.round(jaccard(o.rows[0].required_skills || [], b.rows[0].skills || []) * 100);

  const r = await query(
    `INSERT INTO opportunity_matches (opportunity_id, beneficiary_id, status, match_score)
     VALUES ($1, $2, COALESCE($3,'suggested'), $4)
     ON CONFLICT (opportunity_id, beneficiary_id)
     DO UPDATE SET status = EXCLUDED.status, match_score = EXCLUDED.match_score
     RETURNING *`,
    [opportunityId, beneficiaryId, status || null, score]
  );
  return r.rows[0];
}

async function updateMatch(matchId, { status, notes }) {
  const r = await query(
    `UPDATE opportunity_matches
     SET status = COALESCE($2, status), notes = COALESCE($3, notes)
     WHERE id = $1 RETURNING *`,
    [matchId, status ?? null, notes ?? null]
  );
  if (!r.rows.length) throw ApiError.notFound('Match not found');
  return r.rows[0];
}

async function removeMatch(matchId) {
  const r = await query('DELETE FROM opportunity_matches WHERE id = $1 RETURNING id', [matchId]);
  if (!r.rows.length) throw ApiError.notFound('Match not found');
  return { id: matchId };
}

module.exports = { candidates, listMatches, createMatch, updateMatch, removeMatch };

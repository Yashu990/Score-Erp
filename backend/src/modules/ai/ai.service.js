const { query, getClient } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const {
  buildVocabulary,
  vectorize,
  kmeans,
  coOccurrence,
} = require('./clustering');

/**
 * Maps a skill to suggested livelihood / income opportunities.
 * This is the knowledge base behind livelihood recommendations and can be
 * extended over time as SCORE adds programmes.
 */
const SKILL_LIVELIHOOD = {
  stitching: ['Tailoring unit', 'Garment factory work', 'Boutique / alterations'],
  tailoring: ['Tailoring unit', 'Garment factory work', 'School uniform contracts'],
  weaving: ['Handloom cooperative', 'Textile SHG', 'Home furnishing supply'],
  pottery: ['Ceramics workshop', 'Pottery cooperative', 'Handicraft exports'],
  embroidery: ['Boutique embroidery', 'Export handicrafts', 'Designer tie-ups'],
  carpentry: ['Furniture workshop', 'Construction contracts', 'Repair services'],
  farming: ['FPO membership', 'Organic produce supply', 'Contract farming'],
  dairy: ['Dairy cooperative', 'Milk collection centre', 'Cattle rearing'],
  cooking: ['Catering services', 'Mid-day meal contracts', 'Food stall / canteen'],
  beautician: ['Salon employment', 'Home beauty services', 'Bridal makeup'],
  driving: ['Commercial driving', 'Delivery / logistics', 'Auto / cab service'],
  computer: ['Data entry', 'CSC / e-Mitra centre', 'Digital services kiosk'],
};

/** Fetch beneficiaries that have at least one skill. */
async function fetchSkilled() {
  const res = await query(
    `SELECT id, full_name, village, skills, cluster_id
     FROM beneficiaries
     WHERE skills IS NOT NULL AND array_length(skills, 1) > 0
     ORDER BY full_name`
  );
  return res.rows;
}

/** Cosine-similarity centroid label = the cluster's most common skills. */
function labelFor(members) {
  const freq = new Map();
  for (const m of members) {
    for (const s of m.skills) freq.set(s, (freq.get(s) || 0) + 1);
  }
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s]) => s);
  return { topSkills: top, label: top.map(cap).join(' + ') || 'Unskilled' };
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Run skill clustering. @param {number} k desired number of clusters.
 * Returns clusters with members, dominant skills, and suggested livelihoods.
 */
async function skillClusters(k = 4) {
  const rows = await fetchSkilled();
  if (rows.length === 0) {
    return { totalAnalyzed: 0, requestedK: k, clusters: [] };
  }

  const skillSets = rows.map((r) => r.skills);
  const vocab = buildVocabulary(skillSets);
  const points = skillSets.map((s) => vectorize(s, vocab));
  const { assignments, k: usedK } = kmeans(points, k);

  const grouped = Array.from({ length: usedK }, () => []);
  rows.forEach((r, i) => grouped[assignments[i]].push(r));

  const clusters = grouped
    .map((members, idx) => {
      const { topSkills, label } = labelFor(members);
      const livelihoods = Array.from(
        new Set(topSkills.flatMap((s) => SKILL_LIVELIHOOD[s] || []))
      ).slice(0, 4);
      return {
        clusterIndex: idx,
        label,
        size: members.length,
        topSkills,
        suggestedLivelihoods: livelihoods,
        members: members.map((m) => ({
          id: m.id,
          full_name: m.full_name,
          village: m.village,
          skills: m.skills,
        })),
      };
    })
    .filter((c) => c.size > 0)
    .sort((a, b) => b.size - a.size);

  return { totalAnalyzed: rows.length, requestedK: k, usedK, clusters };
}

/** Skill insights: frequencies, co-occurrence pairs, multi-skilled people. */
async function skillInsights() {
  const rows = await fetchSkilled();
  const skillSets = rows.map((r) => r.skills);

  const freq = new Map();
  let multiSkilled = 0;
  for (const r of rows) {
    if (r.skills.length > 1) multiSkilled++;
    for (const s of r.skills) freq.set(s, (freq.get(s) || 0) + 1);
  }

  return {
    totalSkilled: rows.length,
    distinctSkills: freq.size,
    multiSkilled,
    multiSkilledPct: rows.length ? Math.round((multiSkilled / rows.length) * 100) : 0,
    skillFrequency: Array.from(freq.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count),
    topCoOccurrences: coOccurrence(skillSets).slice(0, 10),
  };
}

/**
 * Livelihood recommendations for one beneficiary:
 *  - direct opportunities from their own skills
 *  - complementary skills to learn next (from co-occurrence with peers)
 */
async function recommendForBeneficiary(id) {
  const res = await query('SELECT id, full_name, skills FROM beneficiaries WHERE id = $1', [id]);
  if (!res.rows.length) throw ApiError.notFound('Beneficiary not found');
  const ben = res.rows[0];
  const skills = ben.skills || [];

  const direct = Array.from(
    new Set(skills.flatMap((s) => SKILL_LIVELIHOOD[s] || []))
  );

  // Complementary skills: among peers who share a skill, what else do they have?
  const all = await fetchSkilled();
  const pairs = coOccurrence(all.map((r) => r.skills));
  const have = new Set(skills);
  const suggestedSkills = [];
  for (const { pair } of pairs) {
    const [a, b] = pair;
    if (have.has(a) && !have.has(b)) suggestedSkills.push(b);
    else if (have.has(b) && !have.has(a)) suggestedSkills.push(a);
    if (suggestedSkills.length >= 3) break;
  }

  return {
    beneficiary: { id: ben.id, full_name: ben.full_name, skills },
    directOpportunities: direct,
    recommendedUpskilling: Array.from(new Set(suggestedSkills)),
  };
}

/**
 * Persist clusters: create a cluster row per group and assign cluster_id to
 * each member. Runs in a transaction. Returns a summary.
 */
async function autoAssignClusters(k = 4) {
  const { clusters } = await skillClusters(k);
  if (clusters.length === 0) throw ApiError.badRequest('No skilled beneficiaries to cluster');

  const client = await getClient();
  try {
    await client.query('BEGIN');
    let createdClusters = 0;
    let assigned = 0;

    for (const c of clusters) {
      const name = `AI: ${c.label}`;
      const description = `Auto-generated from skill clustering. Top skills: ${c.topSkills.join(', ')}.`;
      const ins = await client.query(
        `INSERT INTO clusters (name, description) VALUES ($1, $2) RETURNING id`,
        [name, description]
      );
      const clusterId = ins.rows[0].id;
      createdClusters++;

      const ids = c.members.map((m) => m.id);
      if (ids.length) {
        const r = await client.query(
          `UPDATE beneficiaries SET cluster_id = $1 WHERE id = ANY($2::uuid[])`,
          [clusterId, ids]
        );
        assigned += r.rowCount;
      }
    }

    await client.query('COMMIT');
    return { createdClusters, assigned };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  skillClusters,
  skillInsights,
  recommendForBeneficiary,
  autoAssignClusters,
};

const { query } = require('../../config/db');
const ApiError = require('../../utils/ApiError');

/**
 * Automated CSR Impact Reporting.
 *
 * Generates donor-ready impact reports directly from ERP data — funds granted
 * vs utilised, projects funded, villages and beneficiaries reached, skill
 * impact, expenditure breakdown — plus a template-based narrative summary.
 *
 * NOTE on beneficiary reach: the schema links grants -> projects (which carry a
 * village), but beneficiaries are not directly tied to a project. We therefore
 * approximate "reach" as beneficiaries living in the villages where the donor's
 * funded projects operate, and flag it as an estimate in the output.
 */

function money(n) {
  return Number(n || 0);
}

function inr(n) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(money(n));
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** List donors with headline impact metrics for an overview screen. */
async function overview() {
  const res = await query(`
    SELECT
      d.id, d.name, d.type,
      COALESCE(g.grant_count, 0)        AS grant_count,
      COALESCE(g.total_granted, 0)      AS total_granted,
      COALESCE(e.total_spent, 0)        AS total_spent,
      COALESCE(p.project_count, 0)      AS project_count
    FROM donors d
    LEFT JOIN (
      SELECT donor_id, COUNT(*) AS grant_count, SUM(amount) AS total_granted
      FROM grants GROUP BY donor_id
    ) g ON g.donor_id = d.id
    LEFT JOIN (
      SELECT gr.donor_id, SUM(ex.amount) AS total_spent
      FROM expenditures ex JOIN grants gr ON gr.id = ex.grant_id
      GROUP BY gr.donor_id
    ) e ON e.donor_id = d.id
    LEFT JOIN (
      SELECT gr.donor_id, COUNT(DISTINCT pr.id) AS project_count
      FROM projects pr JOIN grants gr ON gr.id = pr.grant_id
      GROUP BY gr.donor_id
    ) p ON p.donor_id = d.id
    ORDER BY total_granted DESC NULLS LAST, d.name
  `);

  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    grantCount: Number(r.grant_count),
    totalGranted: money(r.total_granted),
    totalSpent: money(r.total_spent),
    utilizationPct:
      money(r.total_granted) > 0
        ? Math.round((money(r.total_spent) / money(r.total_granted)) * 100)
        : 0,
    projectCount: Number(r.project_count),
  }));
}

/** Full impact report for one donor. */
async function donorReport(donorId) {
  const dRes = await query('SELECT * FROM donors WHERE id = $1', [donorId]);
  if (!dRes.rows.length) throw ApiError.notFound('Donor not found');
  const donor = dRes.rows[0];

  // Grants
  const grants = (
    await query(
      `SELECT id, title, amount, currency, status, start_date, end_date
       FROM grants WHERE donor_id = $1 ORDER BY start_date NULLS LAST`,
      [donorId]
    )
  ).rows;
  const grantIds = grants.map((g) => g.id);
  const totalGranted = grants.reduce((s, g) => s + money(g.amount), 0);

  // No grants -> minimal report
  if (grantIds.length === 0) {
    return {
      donor,
      generatedAt: new Date().toISOString(),
      period: null,
      funds: { totalGranted: 0, totalSpent: 0, remaining: 0, utilizationPct: 0 },
      grants: [],
      projects: { count: 0, byStatus: [], villages: [], milestoneCompletionPct: 0 },
      expenditureByCategory: [],
      reach: { estimatedBeneficiaries: 0, topSkills: [], note: 'No grants recorded for this donor.' },
      narrative: `${donor.name} does not yet have any grants recorded in the system.`,
    };
  }

  // Spend
  const spentRes = await query(
    'SELECT COALESCE(SUM(amount),0) AS spent FROM expenditures WHERE grant_id = ANY($1::uuid[])',
    [grantIds]
  );
  const totalSpent = money(spentRes.rows[0].spent);

  // Expenditure by category
  const byCat = (
    await query(
      `SELECT COALESCE(category,'Uncategorized') AS category, SUM(amount)::numeric AS total
       FROM expenditures WHERE grant_id = ANY($1::uuid[])
       GROUP BY category ORDER BY total DESC`,
      [grantIds]
    )
  ).rows.map((r) => ({ category: r.category, total: money(r.total) }));

  // Projects funded by these grants
  const projects = (
    await query(
      `SELECT id, name, village, status FROM projects WHERE grant_id = ANY($1::uuid[])`,
      [grantIds]
    )
  ).rows;
  const projectIds = projects.map((p) => p.id);
  const villages = Array.from(new Set(projects.map((p) => p.village).filter(Boolean)));

  const projByStatus = Object.entries(
    projects.reduce((acc, p) => ((acc[p.status] = (acc[p.status] || 0) + 1), acc), {})
  ).map(([status, count]) => ({ status, count }));

  // Milestone completion across those projects
  let milestoneCompletionPct = 0;
  if (projectIds.length) {
    const ms = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'done')::int AS done
       FROM milestones WHERE project_id = ANY($1::uuid[])`,
      [projectIds]
    );
    const { total, done } = ms.rows[0];
    milestoneCompletionPct = total > 0 ? Math.round((done / total) * 100) : 0;
  }

  // Beneficiary reach — prefer ACTUAL enrolled beneficiaries on the donor's
  // projects; fall back to a village-based estimate only if none are enrolled.
  let estimatedBeneficiaries = 0;
  let topSkills = [];
  let reachMethod = 'none';
  let employedCount = 0;

  let enrolledCount = 0;
  if (projectIds.length) {
    const enr = await query(
      `SELECT
         COUNT(DISTINCT beneficiary_id)::int AS total,
         COUNT(*) FILTER (WHERE status = 'employed')::int AS employed
       FROM enrollments WHERE project_id = ANY($1::uuid[])`,
      [projectIds]
    );
    enrolledCount = enr.rows[0].total;
    employedCount = enr.rows[0].employed;
  }

  if (enrolledCount > 0) {
    reachMethod = 'enrolled';
    estimatedBeneficiaries = enrolledCount;
    const skills = await query(
      `SELECT skill, COUNT(*)::int AS count
       FROM (
         SELECT DISTINCT b.id, b.skills
         FROM enrollments e JOIN beneficiaries b ON b.id = e.beneficiary_id
         WHERE e.project_id = ANY($1::uuid[])
       ) bb, UNNEST(bb.skills) AS skill
       GROUP BY skill ORDER BY count DESC LIMIT 5`,
      [projectIds]
    );
    topSkills = skills.rows;
  } else if (villages.length) {
    reachMethod = 'village_estimate';
    const reach = await query(
      'SELECT COUNT(*)::int AS c FROM beneficiaries WHERE village = ANY($1)',
      [villages]
    );
    estimatedBeneficiaries = reach.rows[0].c;
    const skills = await query(
      `SELECT skill, COUNT(*)::int AS count
       FROM beneficiaries, UNNEST(skills) AS skill
       WHERE village = ANY($1)
       GROUP BY skill ORDER BY count DESC LIMIT 5`,
      [villages]
    );
    topSkills = skills.rows;
  }

  // Period
  const dates = grants.flatMap((g) => [g.start_date, g.end_date]).filter(Boolean).sort();
  const period = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;

  const utilizationPct = totalGranted > 0 ? Math.round((totalSpent / totalGranted) * 100) : 0;

  // ---- Narrative generation (template-based NLG) ----
  const narrative = buildNarrative({
    donor,
    totalGranted,
    totalSpent,
    utilizationPct,
    grantCount: grants.length,
    projectCount: projects.length,
    villages,
    estimatedBeneficiaries,
    topSkills,
    milestoneCompletionPct,
  });

  return {
    donor,
    generatedAt: new Date().toISOString(),
    period,
    funds: {
      totalGranted,
      totalSpent,
      remaining: totalGranted - totalSpent,
      utilizationPct,
    },
    grants: grants.map((g) => ({ ...g, amount: money(g.amount) })),
    projects: {
      count: projects.length,
      byStatus: projByStatus,
      villages,
      milestoneCompletionPct,
    },
    expenditureByCategory: byCat,
    reach: {
      estimatedBeneficiaries,
      employed: employedCount,
      method: reachMethod,
      topSkills,
      note:
        reachMethod === 'enrolled'
          ? 'Beneficiary reach reflects the actual number of beneficiaries enrolled in this donor’s funded projects.'
          : 'No beneficiaries are enrolled yet, so reach is estimated from beneficiaries residing in the villages where this donor’s funded projects operate.',
    },
    narrative,
  };
}

function buildNarrative(d) {
  const lines = [];
  lines.push(
    `${d.donor.name} has committed ${inr(d.totalGranted)} to SCORE across ${d.grantCount} grant${
      d.grantCount === 1 ? '' : 's'
    }.`
  );
  if (d.projectCount > 0) {
    lines.push(
      `These funds support ${d.projectCount} project${d.projectCount === 1 ? '' : 's'}${
        d.villages.length
          ? ` operating in ${d.villages.length} village${d.villages.length === 1 ? '' : 's'} (${d.villages.join(', ')})`
          : ''
      }.`
    );
  }
  lines.push(
    `To date, ${inr(d.totalSpent)} (${d.utilizationPct}% of committed funds) has been utilised.`
  );
  if (d.estimatedBeneficiaries > 0) {
    const skillText = d.topSkills.length
      ? ` Common livelihood skills in these communities include ${d.topSkills
          .slice(0, 3)
          .map((s) => cap(s.skill))
          .join(', ')}.`
      : '';
    lines.push(
      `An estimated ${d.estimatedBeneficiaries} beneficiaries live in the communities served by these programmes.${skillText}`
    );
  }
  if (d.projectCount > 0) {
    lines.push(`Overall project milestone completion stands at ${d.milestoneCompletionPct}%.`);
  }
  return lines.join(' ');
}

/**
 * CSR Compliance Report — a utilization-certificate-style statement for a donor:
 * funds received vs utilised vs balance, project-wise fund utilisation, and a
 * compliance declaration. Complements the narrative impact report.
 */
async function complianceReport(donorId) {
  const dRes = await query('SELECT * FROM donors WHERE id = $1', [donorId]);
  if (!dRes.rows.length) throw ApiError.notFound('Donor not found');
  const donor = dRes.rows[0];

  const grants = (
    await query(
      `SELECT id, title, amount, status, start_date, end_date FROM grants
       WHERE donor_id = $1 ORDER BY start_date NULLS LAST`,
      [donorId]
    )
  ).rows;
  const grantIds = grants.map((g) => g.id);
  const totalReceived = grants.reduce((s, g) => s + money(g.amount), 0);

  let totalUtilised = 0;
  let projectRows = [];
  let byCategory = [];
  if (grantIds.length) {
    totalUtilised = money(
      (await query('SELECT COALESCE(SUM(amount),0) s FROM expenditures WHERE grant_id = ANY($1::uuid[])', [grantIds])).rows[0].s
    );

    // Project-wise utilisation (expenditures tagged to each project of these grants)
    projectRows = (
      await query(
        `SELECT p.id, p.name, p.village, p.budget, p.status,
                COALESCE(SUM(e.amount), 0) AS spent,
                (SELECT COUNT(*) FROM enrollments en WHERE en.project_id = p.id)::int AS beneficiaries
         FROM projects p
         LEFT JOIN expenditures e ON e.project_id = p.id
         WHERE p.grant_id = ANY($1::uuid[])
         GROUP BY p.id
         ORDER BY p.name`,
        [grantIds]
      )
    ).rows.map((r) => ({
      id: r.id, name: r.name, village: r.village, status: r.status,
      budget: money(r.budget), spent: money(r.spent), beneficiaries: Number(r.beneficiaries),
    }));

    byCategory = (
      await query(
        `SELECT COALESCE(category,'Uncategorized') AS category, SUM(amount)::numeric AS total
         FROM expenditures WHERE grant_id = ANY($1::uuid[]) GROUP BY category ORDER BY total DESC`,
        [grantIds]
      )
    ).rows.map((r) => ({ category: r.category, total: money(r.total) }));
  }

  const dates = grants.flatMap((g) => [g.start_date, g.end_date]).filter(Boolean).sort();
  const period = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
  const balance = totalReceived - totalUtilised;
  const utilizationPct = totalReceived > 0 ? Math.round((totalUtilised / totalReceived) * 100) : 0;

  return {
    reportType: 'compliance',
    donor,
    generatedAt: new Date().toISOString(),
    period,
    funds: { totalReceived, totalUtilised, balance, utilizationPct },
    grants: grants.map((g) => ({ ...g, amount: money(g.amount) })),
    projects: projectRows,
    expenditureByCategory: byCategory,
    declaration:
      `This is to certify that the grant funds received from ${donor.name} have been utilised ` +
      `for the sanctioned programme activities of SCORE. As on the date of this report, ` +
      `${inr(totalUtilised)} of ${inr(totalReceived)} (${utilizationPct}%) has been utilised, ` +
      `with an unspent balance of ${inr(balance)}. The above figures are drawn from the ` +
      `organisation's books of account and are true and correct to the best of our knowledge.`,
  };
}

module.exports = { overview, donorReport, complianceReport };

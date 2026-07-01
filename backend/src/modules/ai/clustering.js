/**
 * Lightweight, dependency-free clustering + skill analysis utilities.
 *
 * These power the "AI Skill Clustering" feature: given beneficiaries and their
 * skill arrays, we build binary skill vectors and run a deterministic k-means
 * (cosine similarity) to discover groups, plus co-occurrence analysis to find
 * hidden patterns that manual classification tends to miss.
 */

/** Build the sorted skill vocabulary from a list of skill arrays. */
function buildVocabulary(skillSets) {
  const set = new Set();
  for (const skills of skillSets) {
    for (const s of skills) set.add(s);
  }
  return Array.from(set).sort();
}

/** One-hot encode a skill array against the vocabulary. */
function vectorize(skills, vocab) {
  const idx = new Map(vocab.map((s, i) => [s, i]));
  const v = new Array(vocab.length).fill(0);
  for (const s of skills) {
    if (idx.has(s)) v[idx.get(s)] = 1;
  }
  return v;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(a) {
  return Math.sqrt(dot(a, a));
}

/** Cosine similarity in [0,1] for non-negative vectors (0 if either is empty). */
function cosine(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

/** Jaccard similarity between two skill arrays. */
function jaccard(skillsA, skillsB) {
  const a = new Set(skillsA);
  const b = new Set(skillsB);
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Deterministic k-means over binary skill vectors using cosine similarity.
 *
 * Centroids are seeded from the most frequent distinct skill-set "signatures"
 * (no randomness — results are stable and reproducible across runs).
 *
 * @returns {{ assignments: number[], k: number, iterations: number }}
 *          assignments[i] = cluster index for points[i]
 */
function kmeans(points, k, maxIterations = 50) {
  const n = points.length;
  if (n === 0) return { assignments: [], k: 0, iterations: 0 };

  // Seed centroids from most common distinct signatures
  const sigCount = new Map();
  points.forEach((p) => {
    const sig = p.join('');
    sigCount.set(sig, (sigCount.get(sig) || 0) + 1);
  });
  const distinctSigs = Array.from(sigCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([sig]) => sig);

  const effectiveK = Math.max(1, Math.min(k, distinctSigs.length));
  const sigToVector = new Map();
  points.forEach((p) => sigToVector.set(p.join(''), p));
  let centroids = distinctSigs.slice(0, effectiveK).map((sig) => [...sigToVector.get(sig)]);

  let assignments = new Array(n).fill(0);
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    let changed = false;

    // Assignment step — nearest centroid by cosine similarity
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestSim = -1;
      for (let c = 0; c < centroids.length; c++) {
        const sim = cosine(points[i], centroids[c]);
        if (sim > bestSim) {
          bestSim = sim;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }

    // Update step — centroid = mean of assigned points
    const dim = points[0].length;
    const sums = centroids.map(() => new Array(dim).fill(0));
    const counts = new Array(centroids.length).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      for (let d = 0; d < dim; d++) sums[c][d] += points[i][d];
    }
    centroids = sums.map((sum, c) =>
      counts[c] === 0 ? sum : sum.map((x) => x / counts[c])
    );

    if (!changed) break;
  }

  return { assignments, k: effectiveK, iterations };
}

/**
 * Pairwise skill co-occurrence: how often two skills appear in the same person.
 * @returns Array<{ pair: [string,string], count: number }> sorted desc
 */
function coOccurrence(skillSets) {
  const counts = new Map();
  for (const skills of skillSets) {
    const uniq = Array.from(new Set(skills)).sort();
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const key = `${uniq[i]}|${uniq[j]}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ pair: key.split('|'), count }))
    .sort((a, b) => b.count - a.count);
}

module.exports = {
  buildVocabulary,
  vectorize,
  cosine,
  jaccard,
  kmeans,
  coOccurrence,
};

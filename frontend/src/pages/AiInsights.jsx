import { useEffect, useState, useCallback } from 'react';
import api, { apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Spinner, Empty, Alert } from '../components/ui';

export default function AiInsights() {
  const { hasRole } = useAuth();
  const canCluster = hasRole('admin', 'manager');

  const [k, setK] = useState(4);
  const [clusters, setClusters] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [c, i] = await Promise.all([
        api.get('/ai/skill-clusters', { params: { k } }),
        api.get('/ai/skill-insights'),
      ]);
      setClusters(c.data.data);
      setInsights(i.data.data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [k]);

  useEffect(() => { load(); }, [load]);

  const autoCluster = async () => {
    if (!window.confirm(`Create ${clusters?.usedK || k} clusters and assign beneficiaries to them?`)) return;
    setAssigning(true);
    setNotice('');
    try {
      const { data } = await api.post('/ai/auto-cluster', null, { params: { k } });
      setNotice(`Created ${data.data.createdClusters} clusters and assigned ${data.data.assigned} beneficiaries.`);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>AI Skill Insights</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Clusters (k)</label>
          <select value={k} onChange={(e) => setK(Number(e.target.value))}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
            {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {canCluster && (
            <button className="btn btn-primary" onClick={autoCluster} disabled={assigning || !clusters?.clusters?.length}>
              {assigning ? 'Assigning…' : 'Auto-create & assign clusters'}
            </button>
          )}
        </div>
      </div>

      <p style={{ color: 'var(--text-muted)', marginTop: -8, marginBottom: 18 }}>
        Unsupervised grouping of beneficiaries by their skills (k-means on skill vectors),
        with livelihood suggestions and hidden skill patterns.
      </p>

      {notice && <Alert type="success">{notice}</Alert>}
      <Alert>{error}</Alert>

      {loading ? <Spinner /> : (
        <>
          {insights && (
            <div className="stat-grid">
              <Stat label="Skilled Beneficiaries" value={insights.totalSkilled} />
              <Stat label="Distinct Skills" value={insights.distinctSkills} />
              <Stat label="Multi-skilled" value={`${insights.multiSkilled} (${insights.multiSkilledPct}%)`} />
              <Stat label="Clusters Found" value={clusters?.usedK ?? 0} />
            </div>
          )}

          {/* Clusters */}
          {!clusters?.clusters?.length ? (
            <div className="card"><Empty>No skilled beneficiaries to cluster yet.</Empty></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {clusters.clusters.map((c) => (
                <div className="card" key={c.clusterIndex}>
                  <div className="card-header">
                    <h3 className="card-title">{c.label}</h3>
                    <span className="badge">{c.size} people</span>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    {c.topSkills.map((s) => <span key={s} className="chip">{s}</span>)}
                  </div>
                  {c.suggestedLivelihoods.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Suggested livelihoods</div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                        {c.suggestedLivelihoods.map((l) => <li key={l}>{l}</li>)}
                      </ul>
                    </div>
                  )}
                  <details>
                    <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--primary)' }}>
                      View {c.members.length} members
                    </summary>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                      {c.members.map((m) => (
                        <li key={m.id}>{m.full_name} <span style={{ color: 'var(--text-muted)' }}>· {m.village || '—'}</span></li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
            </div>
          )}

          {/* Co-occurrence patterns */}
          {insights?.topCoOccurrences?.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <h3 className="card-title">Hidden Skill Patterns (co-occurrence)</h3>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Skill A</th><th>Skill B</th><th>Beneficiaries with both</th></tr></thead>
                  <tbody>
                    {insights.topCoOccurrences.map((p, i) => (
                      <tr key={i}>
                        <td><span className="chip">{p.pair[0]}</span></td>
                        <td><span className="chip">{p.pair[1]}</span></td>
                        <td><strong>{p.count}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

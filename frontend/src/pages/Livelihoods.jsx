import { useEffect, useState, useCallback } from 'react';
import api, { apiError } from '../api/client';
import Modal from '../components/Modal';
import { Spinner, Empty, Alert, StatusBadge, money } from '../components/ui';

const EMPTY = {
  title: '', organization: '', type: 'job', required_skills: '', location: '',
  positions: 1, monthly_wage: '', status: 'open', description: '', contact: '',
};
const TYPES = [
  { v: 'job', l: 'Job' },
  { v: 'self_employment', l: 'Self-employment' },
  { v: 'apprenticeship', l: 'Apprenticeship' },
  { v: 'scheme', l: 'Govt. scheme' },
];

export default function Livelihoods() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [detailId, setDetailId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/livelihoods', { params: { limit: 50 } });
      setRows(data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const openCreate = () => { setEditing(null); setForm(EMPTY); setFormError(''); setShow(true); };
  const openEdit = (o) => {
    setEditing(o);
    setForm({ ...EMPTY, ...o, required_skills: (o.required_skills || []).join(', '),
      monthly_wage: o.monthly_wage ?? '', positions: o.positions ?? 1 });
    setFormError(''); setShow(true);
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      const payload = {
        ...form,
        positions: form.positions === '' ? null : Number(form.positions),
        monthly_wage: form.monthly_wage === '' ? null : Number(form.monthly_wage),
        required_skills: form.required_skills
          ? form.required_skills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
          : [],
      };
      if (editing) await api.put(`/livelihoods/${editing.id}`, payload);
      else await api.post('/livelihoods', payload);
      setShow(false); load();
    } catch (err) { setFormError(apiError(err)); }
    finally { setSaving(false); }
  };

  const remove = async (o) => {
    if (!window.confirm(`Delete opportunity "${o.title}"?`)) return;
    try { await api.delete(`/livelihoods/${o.id}`); load(); }
    catch (err) { alert(apiError(err)); }
  };

  return (
    <>
      <div className="page-header">
        <h1>Livelihood Opportunities</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Opportunity</button>
      </div>
      <p style={{ color: 'var(--text-muted)', marginTop: -8, marginBottom: 18 }}>
        Register employment &amp; livelihood opportunities, auto-match beneficiaries by skill, and track placements.
      </p>

      <div className="card">
        <Alert>{error}</Alert>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty>No opportunities yet.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Title</th><th>Organization</th><th>Type</th><th>Skills</th><th>Wage</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.title}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.location || ''}</div></td>
                    <td>{o.organization || '—'}</td>
                    <td><span className="badge badge-gray">{o.type.replace('_', ' ')}</span></td>
                    <td>{(o.required_skills || []).map((s) => <span key={s} className="chip">{s}</span>)}</td>
                    <td>{o.monthly_wage ? money(o.monthly_wage) : '—'}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td><div className="row-actions">
                      <button className="btn btn-sm btn-primary" onClick={() => setDetailId(o.id)}>Match</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(o)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(o)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {show && (
        <Modal title={editing ? 'Edit Opportunity' : 'Add Opportunity'} onClose={() => setShow(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>}>
          <Alert>{formError}</Alert>
          <form onSubmit={save} className="form-grid">
            <div className="field full"><label>Title *</label><input name="title" value={form.title} onChange={onField} required /></div>
            <div className="field"><label>Organization</label><input name="organization" value={form.organization} onChange={onField} /></div>
            <div className="field"><label>Type</label>
              <select name="type" value={form.type} onChange={onField}>
                {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div className="field"><label>Location</label><input name="location" value={form.location} onChange={onField} /></div>
            <div className="field"><label>Positions</label><input type="number" name="positions" value={form.positions} onChange={onField} /></div>
            <div className="field"><label>Monthly Wage (₹)</label><input type="number" name="monthly_wage" value={form.monthly_wage} onChange={onField} /></div>
            <div className="field"><label>Status</label>
              <select name="status" value={form.status} onChange={onField}>
                <option value="open">Open</option><option value="filled">Filled</option><option value="closed">Closed</option>
              </select>
            </div>
            <div className="field full"><label>Required Skills (comma-separated)</label>
              <input name="required_skills" placeholder="stitching, tailoring" value={form.required_skills} onChange={onField} /></div>
            <div className="field full"><label>Contact</label><input name="contact" value={form.contact} onChange={onField} /></div>
            <div className="field full"><label>Description</label><textarea name="description" rows="2" value={form.description} onChange={onField} /></div>
          </form>
        </Modal>
      )}

      {detailId && <MatchDetail id={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}

/* ----------------------- MATCH DETAIL MODAL ----------------------- */
function MatchDetail({ id, onClose }) {
  const [opp, setOpp] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, m] = await Promise.all([
        api.get(`/livelihoods/${id}/candidates`),
        api.get(`/livelihoods/${id}/matches`),
      ]);
      setOpp(c.data.data.opportunity);
      setCandidates(c.data.data.candidates);
      setMatches(m.data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const matchedIds = new Set(matches.map((m) => m.beneficiary_id));

  const addMatch = async (benId, status) => {
    try { await api.post(`/livelihoods/${id}/matches`, { beneficiary_id: benId, status: status || 'suggested' }); load(); }
    catch (err) { alert(apiError(err)); }
  };
  const updateMatch = async (m, status) => {
    try { await api.put(`/livelihoods/matches/${m.id}`, { status }); load(); }
    catch (err) { alert(apiError(err)); }
  };
  const removeMatch = async (m) => {
    try { await api.delete(`/livelihoods/matches/${m.id}`); load(); }
    catch (err) { alert(apiError(err)); }
  };

  return (
    <Modal title={opp ? `Match — ${opp.title}` : 'Match'} onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      <Alert>{error}</Alert>
      {loading ? <Spinner /> : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Required skills: {(opp?.required_skills || []).map((s) => <span key={s} className="chip">{s}</span>) || '—'}
          </div>

          <h4 style={{ margin: '4px 0 8px' }}>🤖 AI-suggested candidates</h4>
          {candidates.length === 0 ? <div className="empty">No beneficiaries match these skills. Add required skills to the opportunity.</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Beneficiary</th><th>Matched skills</th><th>Score</th><th></th></tr></thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.full_name}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.village || '—'}</div></td>
                      <td>{c.matchedSkills.map((s) => <span key={s} className="chip">{s}</span>)}</td>
                      <td><span className="badge">{c.score}%</span></td>
                      <td>
                        {matchedIds.has(c.id)
                          ? <span className="badge badge-gray">added</span>
                          : <button className="btn btn-sm btn-primary" onClick={() => addMatch(c.id)}>Match</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h4 style={{ margin: '20px 0 8px' }}>Matched beneficiaries &amp; placements</h4>
          {matches.length === 0 ? <div className="empty">No matches yet</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Beneficiary</th><th>Score</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {matches.map((m) => (
                    <tr key={m.id}>
                      <td><strong>{m.full_name}</strong></td>
                      <td>{m.match_score != null ? `${m.match_score}%` : '—'}</td>
                      <td>
                        <select value={m.status} onChange={(e) => updateMatch(m, e.target.value)}
                          style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>
                          <option value="suggested">Suggested</option>
                          <option value="applied">Applied</option>
                          <option value="placed">Placed</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => removeMatch(m)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

import { useEffect, useState, useCallback } from 'react';
import api, { apiError } from '../api/client';
import Modal from '../components/Modal';
import { Spinner, Empty, Alert, StatusBadge, money, fmtDate } from '../components/ui';

const EMPTY = { name: '', description: '', grant_id: '', village: '', start_date: '', end_date: '', budget: '', status: 'planned' };
const STATUSES = ['planned', 'active', 'on_hold', 'completed', 'cancelled'];

export default function Projects() {
  const [rows, setRows] = useState([]);
  const [grants, setGrants] = useState([]);
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
      const { data } = await api.get('/projects', { params: { limit: 50 } });
      setRows(data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/finance/grants', { params: { limit: 100 } }).then((r) => setGrants(r.data.data)).catch(() => {}); }, []);

  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const openCreate = () => { setEditing(null); setForm(EMPTY); setFormError(''); setShow(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({ ...EMPTY, ...p, grant_id: p.grant_id || '', budget: p.budget ?? '',
      start_date: p.start_date?.slice(0, 10) || '', end_date: p.end_date?.slice(0, 10) || '' });
    setFormError(''); setShow(true);
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      const payload = { ...form, budget: form.budget === '' ? 0 : Number(form.budget),
        grant_id: form.grant_id || null, start_date: form.start_date || null, end_date: form.end_date || null };
      if (editing) await api.put(`/projects/${editing.id}`, payload);
      else await api.post('/projects', payload);
      setShow(false); load();
    } catch (err) { setFormError(apiError(err)); }
    finally { setSaving(false); }
  };

  const remove = async (p) => {
    if (!window.confirm(`Delete project "${p.name}"?`)) return;
    try { await api.delete(`/projects/${p.id}`); load(); }
    catch (err) { alert(apiError(err)); }
  };

  return (
    <>
      <div className="page-header">
        <h1>Projects</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Project</button>
      </div>

      <div className="card">
        <Alert>{error}</Alert>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Village</th><th>Budget</th><th>Period</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.village || '—'}</td>
                    <td>{money(p.budget)}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(p.start_date)} → {fmtDate(p.end_date)}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td><div className="row-actions">
                      <button className="btn btn-sm btn-ghost" onClick={() => setDetailId(p.id)}>View</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(p)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {show && (
        <Modal title={editing ? 'Edit Project' : 'Add Project'} onClose={() => setShow(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>}>
          <Alert>{formError}</Alert>
          <form onSubmit={save} className="form-grid">
            <div className="field full"><label>Project Name *</label><input name="name" value={form.name} onChange={onField} required /></div>
            <div className="field"><label>Village</label><input name="village" value={form.village} onChange={onField} /></div>
            <div className="field"><label>Linked Grant</label>
              <select name="grant_id" value={form.grant_id} onChange={onField}>
                <option value="">—</option>
                {grants.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
            <div className="field"><label>Budget (₹)</label><input type="number" name="budget" value={form.budget} onChange={onField} /></div>
            <div className="field"><label>Status</label>
              <select name="status" value={form.status} onChange={onField}>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="field"><label>Start Date</label><input type="date" name="start_date" value={form.start_date} onChange={onField} /></div>
            <div className="field"><label>End Date</label><input type="date" name="end_date" value={form.end_date} onChange={onField} /></div>
            <div className="field full"><label>Description</label><textarea name="description" rows="2" value={form.description || ''} onChange={onField} /></div>
          </form>
        </Modal>
      )}

      {detailId && <ProjectDetail id={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}

/* ------------------------- PROJECT DETAIL ------------------------- */
function ProjectDetail({ id, onClose }) {
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const [enrollments, setEnrollments] = useState([]);
  const [allBeneficiaries, setAllBeneficiaries] = useState([]);
  const [selBen, setSelBen] = useState('');

  const load = useCallback(async () => {
    try {
      const [{ data }, enr] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/enrollments`),
      ]);
      setProject(data.data);
      setEnrollments(enr.data.data);
    } catch (err) { setError(apiError(err)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/beneficiaries', { params: { limit: 100 } })
      .then((r) => setAllBeneficiaries(r.data.data)).catch(() => {});
  }, []);

  const enrolledIds = new Set(enrollments.map((e) => e.beneficiary_id));
  const available = allBeneficiaries.filter((b) => !enrolledIds.has(b.id));

  const enroll = async () => {
    if (!selBen) return;
    try {
      await api.post(`/projects/${id}/enrollments`, { beneficiary_id: selBen });
      setSelBen(''); load();
    } catch (err) { alert(apiError(err)); }
  };
  const updateEnrollment = async (e, patch) => {
    try { await api.put(`/projects/enrollments/${e.id}`, patch); load(); }
    catch (err) { alert(apiError(err)); }
  };
  const removeEnrollment = async (e) => {
    if (!window.confirm(`Remove ${e.full_name} from this project?`)) return;
    try { await api.delete(`/projects/enrollments/${e.id}`); load(); }
    catch (err) { alert(apiError(err)); }
  };

  const addMilestone = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    try {
      await api.post(`/projects/${id}/milestones`, { title });
      setTitle(''); load();
    } catch (err) { alert(apiError(err)); }
    finally { setAdding(false); }
  };

  const toggleMilestone = async (m) => {
    const next = m.status === 'done' ? 'pending' : 'done';
    try { await api.put(`/projects/milestones/${m.id}`, { status: next }); load(); }
    catch (err) { alert(apiError(err)); }
  };

  return (
    <Modal title={project?.name || 'Project'} onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      <Alert>{error}</Alert>
      {!project ? <Spinner /> : (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card"><div className="stat-label">Budget</div><div className="stat-value" style={{ fontSize: 20 }}>{money(project.budget)}</div></div>
            <div className="stat-card"><div className="stat-label">Spent</div><div className="stat-value" style={{ fontSize: 20 }}>{money(project.spent)}</div></div>
            <div className="stat-card"><div className="stat-label">Enrolled</div><div className="stat-value" style={{ fontSize: 20 }}>{project.enrollment?.total ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Employed</div><div className="stat-value" style={{ fontSize: 20 }}>{project.enrollment?.employed ?? 0}</div></div>
          </div>

          <h4 style={{ margin: '4px 0 8px' }}>Milestones</h4>
          {project.milestones.length === 0 ? <div className="empty">No milestones yet</div> : (
            <table>
              <tbody>
                {project.milestones.map((m) => (
                  <tr key={m.id}>
                    <td style={{ width: 30 }}>
                      <input type="checkbox" checked={m.status === 'done'} onChange={() => toggleMilestone(m)} />
                    </td>
                    <td>{m.title}</td>
                    <td>{fmtDate(m.due_date)}</td>
                    <td><StatusBadge status={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form onSubmit={addMilestone} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input style={{ flex: 1, padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8 }}
              placeholder="New milestone title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={adding}>Add</button>
          </form>

          <h4 style={{ margin: '20px 0 8px' }}>Enrolled Beneficiaries &amp; Outcomes</h4>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select value={selBen} onChange={(e) => setSelBen(e.target.value)}
              style={{ flex: 1, padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <option value="">Select a beneficiary to enroll…</option>
              {available.map((b) => (
                <option key={b.id} value={b.id}>{b.full_name}{b.village ? ` · ${b.village}` : ''}</option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" onClick={enroll} disabled={!selBen}>Enroll</button>
          </div>

          {enrollments.length === 0 ? <div className="empty">No beneficiaries enrolled yet</div> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Beneficiary</th><th>Status</th><th>Outcome income</th><th></th></tr>
                </thead>
                <tbody>
                  {enrollments.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.full_name}</strong>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.village || '—'}</div>
                      </td>
                      <td>
                        <select value={e.status} onChange={(ev) => updateEnrollment(e, { status: ev.target.value })}
                          style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>
                          <option value="enrolled">Enrolled</option>
                          <option value="in_training">In training</option>
                          <option value="completed">Completed</option>
                          <option value="employed">Employed</option>
                          <option value="dropped_out">Dropped out</option>
                        </select>
                      </td>
                      <td>
                        <input type="number" defaultValue={e.outcome_income ?? ''} placeholder="₹ / month"
                          onBlur={(ev) => {
                            const v = ev.target.value;
                            if (String(e.outcome_income ?? '') !== v) {
                              updateEnrollment(e, { outcome_income: v === '' ? null : Number(v) });
                            }
                          }}
                          style={{ width: 110, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                      </td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => removeEnrollment(e)}>Remove</button></td>
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

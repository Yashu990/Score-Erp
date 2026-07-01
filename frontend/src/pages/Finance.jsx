import { useEffect, useState, useCallback } from 'react';
import api, { apiError } from '../api/client';
import Modal from '../components/Modal';
import { Spinner, Empty, Alert, StatusBadge, money, fmtDate } from '../components/ui';

export default function Finance() {
  const [tab, setTab] = useState('grants');
  const [summary, setSummary] = useState(null);

  const loadSummary = useCallback(() => {
    api.get('/finance/summary').then((r) => setSummary(r.data.data)).catch(() => {});
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  return (
    <>
      <div className="page-header">
        <h1>Finance & Grants</h1>
      </div>

      {summary && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">Total Grants</div>
            <div className="stat-value">{money(summary.total_grants)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Spent</div>
            <div className="stat-value">{money(summary.total_spent)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Remaining</div>
            <div className="stat-value">{money(summary.total_remaining)}</div>
          </div>
        </div>
      )}

      <div className="tabs">
        <div className={`tab ${tab === 'grants' ? 'active' : ''}`} onClick={() => setTab('grants')}>Grants</div>
        <div className={`tab ${tab === 'expenditures' ? 'active' : ''}`} onClick={() => setTab('expenditures')}>Expenditures</div>
        <div className={`tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>Audit Trail</div>
      </div>

      {tab === 'grants' && <Grants onChange={loadSummary} />}
      {tab === 'expenditures' && <Expenditures onChange={loadSummary} />}
      {tab === 'audit' && <AuditTrail />}
    </>
  );
}

/* ----------------------------- GRANTS ----------------------------- */
const GRANT_EMPTY = { title: '', donor_id: '', amount: '', currency: 'INR', start_date: '', end_date: '', status: 'active', notes: '' };

function Grants({ onChange }) {
  const [rows, setRows] = useState([]);
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(GRANT_EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/finance/grants', { params: { limit: 50 } });
      setRows(data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/donors', { params: { limit: 100 } }).then((r) => setDonors(r.data.data)).catch(() => {}); }, []);

  const donorName = (id) => donors.find((d) => d.id === id)?.name || '—';
  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const openCreate = () => { setEditing(null); setForm(GRANT_EMPTY); setFormError(''); setShow(true); };
  const openEdit = (g) => {
    setEditing(g);
    setForm({ ...GRANT_EMPTY, ...g, donor_id: g.donor_id || '', amount: g.amount ?? '',
      start_date: g.start_date?.slice(0, 10) || '', end_date: g.end_date?.slice(0, 10) || '' });
    setFormError(''); setShow(true);
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      const payload = { ...form, amount: form.amount === '' ? 0 : Number(form.amount),
        donor_id: form.donor_id || null, start_date: form.start_date || null, end_date: form.end_date || null };
      if (editing) await api.put(`/finance/grants/${editing.id}`, payload);
      else await api.post('/finance/grants', payload);
      setShow(false); load(); onChange?.();
    } catch (err) { setFormError(apiError(err)); }
    finally { setSaving(false); }
  };

  const remove = async (g) => {
    if (!window.confirm(`Delete grant "${g.title}"?`)) return;
    try { await api.delete(`/finance/grants/${g.id}`); load(); onChange?.(); }
    catch (err) { alert(apiError(err)); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Grants</h3>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Add Grant</button>
      </div>
      <Alert>{error}</Alert>
      {loading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Donor</th><th>Amount</th><th>Period</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td><strong>{g.title}</strong></td>
                  <td>{donorName(g.donor_id)}</td>
                  <td>{money(g.amount, g.currency)}</td>
                  <td style={{ fontSize: 12 }}>{fmtDate(g.start_date)} → {fmtDate(g.end_date)}</td>
                  <td><StatusBadge status={g.status} /></td>
                  <td><div className="row-actions">
                    <button className="btn btn-sm btn-ghost" onClick={() => openEdit(g)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(g)}>Delete</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {show && (
        <Modal title={editing ? 'Edit Grant' : 'Add Grant'} onClose={() => setShow(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>}>
          <Alert>{formError}</Alert>
          <form onSubmit={save} className="form-grid">
            <div className="field full"><label>Title *</label><input name="title" value={form.title} onChange={onField} required /></div>
            <div className="field"><label>Donor</label>
              <select name="donor_id" value={form.donor_id} onChange={onField}>
                <option value="">—</option>
                {donors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Amount (₹)</label><input type="number" name="amount" value={form.amount} onChange={onField} /></div>
            <div className="field"><label>Start Date</label><input type="date" name="start_date" value={form.start_date} onChange={onField} /></div>
            <div className="field"><label>End Date</label><input type="date" name="end_date" value={form.end_date} onChange={onField} /></div>
            <div className="field"><label>Status</label>
              <select name="status" value={form.status} onChange={onField}>
                <option value="pledged">Pledged</option><option value="active">Active</option>
                <option value="closed">Closed</option><option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="field full"><label>Notes</label><textarea name="notes" rows="2" value={form.notes || ''} onChange={onField} /></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* -------------------------- EXPENDITURES -------------------------- */
const EXP_EMPTY = { grant_id: '', category: '', description: '', amount: '', spent_on: '' };

function Expenditures({ onChange }) {
  const [rows, setRows] = useState([]);
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(EXP_EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/finance/expenditures', { params: { limit: 50 } });
      setRows(data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/finance/grants', { params: { limit: 100 } }).then((r) => setGrants(r.data.data)).catch(() => {}); }, []);

  const grantName = (id) => grants.find((g) => g.id === id)?.title || '—';
  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      const payload = { ...form, amount: Number(form.amount), grant_id: form.grant_id || null, spent_on: form.spent_on || null };
      await api.post('/finance/expenditures', payload);
      setShow(false); setForm(EXP_EMPTY); load(); onChange?.();
    } catch (err) { setFormError(apiError(err)); }
    finally { setSaving(false); }
  };

  const remove = async (x) => {
    if (!window.confirm('Delete this expenditure?')) return;
    try { await api.delete(`/finance/expenditures/${x.id}`); load(); onChange?.(); }
    catch (err) { alert(apiError(err)); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Expenditures</h3>
        <button className="btn btn-primary btn-sm" onClick={() => { setForm(EXP_EMPTY); setFormError(''); setShow(true); }}>+ Record Expenditure</button>
      </div>
      <Alert>{error}</Alert>
      {loading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Grant</th><th>Category</th><th>Description</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <td>{fmtDate(x.spent_on)}</td>
                  <td>{grantName(x.grant_id)}</td>
                  <td>{x.category || '—'}</td>
                  <td>{x.description || '—'}</td>
                  <td>{money(x.amount)}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => remove(x)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {show && (
        <Modal title="Record Expenditure" onClose={() => setShow(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>}>
          <Alert>{formError}</Alert>
          <form onSubmit={save} className="form-grid">
            <div className="field full"><label>Grant</label>
              <select name="grant_id" value={form.grant_id} onChange={onField}>
                <option value="">—</option>
                {grants.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
            <div className="field"><label>Category</label><input name="category" value={form.category} onChange={onField} placeholder="Training, Travel…" /></div>
            <div className="field"><label>Amount (₹) *</label><input type="number" name="amount" value={form.amount} onChange={onField} required /></div>
            <div className="field"><label>Spent On</label><input type="date" name="spent_on" value={form.spent_on} onChange={onField} /></div>
            <div className="field full"><label>Description</label><textarea name="description" rows="2" value={form.description} onChange={onField} /></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------- AUDIT TRAIL ------------------------- */
function AuditTrail() {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter ? { entity_type: filter } : {};
      const { data } = await api.get('/finance/audit', { params });
      setRows(data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const actionBadge = (a) =>
    a === 'create' ? 'badge-green' : a === 'delete' ? 'badge-red' : 'badge-amber';

  const renderChanges = (c) => {
    if (!c) return '—';
    return Object.entries(c).map(([field, v]) => {
      if (v && typeof v === 'object' && 'from' in v) {
        return <div key={field} style={{ fontSize: 12 }}><strong>{field}</strong>: {String(v.from ?? '—')} → {String(v.to ?? '—')}</div>;
      }
      return <div key={field} style={{ fontSize: 12 }}><strong>{field}</strong>: {String(v)}</div>;
    });
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Audit Trail</h3>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
          <option value="">All financial records</option>
          <option value="grant">Grants only</option>
          <option value="expenditure">Expenditures only</option>
        </select>
      </div>
      <Alert>{error}</Alert>
      {loading ? <Spinner /> : rows.length === 0 ? <Empty>No audit entries yet. Changes to grants and expenditures are logged here.</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Record</th><th>Action</th><th>Changes</th><th>By</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString('en-IN')}</td>
                  <td><span className="badge badge-gray">{r.entity_type}</span></td>
                  <td><span className={`badge ${actionBadge(r.action)}`}>{r.action}</span></td>
                  <td>{renderChanges(r.changes)}</td>
                  <td>{r.actor_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

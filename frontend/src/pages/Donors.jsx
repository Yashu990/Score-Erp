import { useState, useEffect, useCallback } from 'react';
import api, { apiError } from '../api/client';
import CrudPage from '../components/CrudPage';
import Modal from '../components/Modal';
import { Spinner, Empty, Alert, StatusBadge, fmtDate } from '../components/ui';

const TYPES = [
  { value: 'corporate', label: 'Corporate' },
  { value: 'foundation', label: 'Foundation' },
  { value: 'individual', label: 'Individual' },
  { value: 'government', label: 'Government' },
];

export default function Donors() {
  const [detail, setDetail] = useState(null);

  return (
    <>
      <CrudPage
        title="Donors / CSR Partners"
        endpoint="/donors"
        singular="Donor"
        rowActions={[{ label: 'Details', className: 'btn-primary', onClick: (row) => setDetail(row) }]}
        columns={[
          { key: 'name', label: 'Name', render: (r) => <strong>{r.name}</strong> },
          { key: 'type', label: 'Type', render: (r) => <span className="badge badge-gray">{r.type}</span> },
          { key: 'contact_person', label: 'Contact' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
        ]}
        fields={[
          { name: 'name', label: 'Donor Name', required: true, full: true },
          { name: 'type', label: 'Type', type: 'select', options: TYPES, default: 'corporate' },
          { name: 'contact_person', label: 'Contact Person' },
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'phone', label: 'Phone' },
          { name: 'address', label: 'Address', type: 'textarea', full: true },
          { name: 'notes', label: 'Notes', type: 'textarea', full: true },
        ]}
      />
      {detail && <DonorDetail donor={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function DonorDetail({ donor, onClose }) {
  const [tab, setTab] = useState('comms');
  return (
    <Modal title={donor.name} onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      <div className="tabs">
        <div className={`tab ${tab === 'comms' ? 'active' : ''}`} onClick={() => setTab('comms')}>Communication Log</div>
        <div className={`tab ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>Reporting Schedule</div>
      </div>
      {tab === 'comms' ? <Communications donorId={donor.id} /> : <Reports donorId={donor.id} />}
    </Modal>
  );
}

/* ----------------------- COMMUNICATIONS --------------------------- */
const COMM_EMPTY = { type: 'note', subject: '', summary: '', contact_person: '', communicated_on: '' };

function Communications({ donorId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(COMM_EMPTY);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/donors/${donorId}/communications`);
      setRows(data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, [donorId]);
  useEffect(() => { load(); }, [load]);

  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const add = async (e) => {
    e.preventDefault();
    if (!form.summary.trim()) return;
    setAdding(true);
    try {
      await api.post(`/donors/${donorId}/communications`, form);
      setForm(COMM_EMPTY); load();
    } catch (err) { alert(apiError(err)); }
    finally { setAdding(false); }
  };
  const remove = async (c) => {
    if (!window.confirm('Delete this log entry?')) return;
    try { await api.delete(`/donors/communications/${c.id}`); load(); }
    catch (err) { alert(apiError(err)); }
  };

  return (
    <>
      <Alert>{error}</Alert>
      <form onSubmit={add} className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>Type</label>
          <select name="type" value={form.type} onChange={onField}>
            <option value="note">Note</option><option value="call">Call</option>
            <option value="email">Email</option><option value="meeting">Meeting</option>
          </select>
        </div>
        <div className="field"><label>Date</label><input type="date" name="communicated_on" value={form.communicated_on} onChange={onField} /></div>
        <div className="field full"><label>Subject</label><input name="subject" value={form.subject} onChange={onField} /></div>
        <div className="field full"><label>Summary *</label><textarea name="summary" rows="2" value={form.summary} onChange={onField} required /></div>
        <div className="field full" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" disabled={adding}>{adding ? 'Saving…' : 'Add Entry'}</button>
        </div>
      </form>

      {loading ? <Spinner /> : rows.length === 0 ? <Empty>No communication logged yet</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Subject / Summary</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDate(c.communicated_on)}</td>
                  <td><span className="badge badge-gray">{c.type}</span></td>
                  <td>
                    {c.subject && <strong>{c.subject}</strong>}
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.summary}</div>
                  </td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => remove(c)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ------------------------- REPORTS -------------------------------- */
const REP_EMPTY = { title: '', frequency: 'quarterly', due_date: '', notes: '' };

function Reports({ donorId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(REP_EMPTY);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/donors/${donorId}/reports`);
      setRows(data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, [donorId]);
  useEffect(() => { load(); }, [load]);

  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const add = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.due_date) return;
    setAdding(true);
    try {
      await api.post(`/donors/${donorId}/reports`, form);
      setForm(REP_EMPTY); load();
    } catch (err) { alert(apiError(err)); }
    finally { setAdding(false); }
  };
  const toggle = async (r) => {
    const next = r.status === 'submitted' ? 'pending' : 'submitted';
    try { await api.put(`/donors/reports/${r.id}`, { status: next }); load(); }
    catch (err) { alert(apiError(err)); }
  };
  const remove = async (r) => {
    if (!window.confirm('Delete this report schedule?')) return;
    try { await api.delete(`/donors/reports/${r.id}`); load(); }
    catch (err) { alert(apiError(err)); }
  };

  const isOverdue = (r) => r.status === 'pending' && new Date(r.due_date) < new Date(new Date().toDateString());

  return (
    <>
      <Alert>{error}</Alert>
      <form onSubmit={add} className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field full"><label>Report Title *</label><input name="title" value={form.title} onChange={onField} placeholder="e.g. Q2 Progress Report" required /></div>
        <div className="field"><label>Frequency</label>
          <select name="frequency" value={form.frequency} onChange={onField}>
            <option value="one_time">One-time</option><option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option><option value="half_yearly">Half-yearly</option>
            <option value="annual">Annual</option>
          </select>
        </div>
        <div className="field"><label>Due Date *</label><input type="date" name="due_date" value={form.due_date} onChange={onField} required /></div>
        <div className="field full" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" disabled={adding}>{adding ? 'Saving…' : 'Add Deadline'}</button>
        </div>
      </form>

      {loading ? <Spinner /> : rows.length === 0 ? <Empty>No reporting deadlines yet</Empty> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Report</th><th>Frequency</th><th>Due</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.title}</strong></td>
                  <td>{r.frequency.replace('_', ' ')}</td>
                  <td style={{ color: isOverdue(r) ? 'var(--danger)' : 'inherit', fontWeight: isOverdue(r) ? 600 : 400 }}>
                    {fmtDate(r.due_date)}{isOverdue(r) ? ' (overdue)' : ''}
                  </td>
                  <td>
                    {r.status === 'submitted'
                      ? <StatusBadge status="completed" />
                      : <span className="badge badge-amber">pending</span>}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-sm btn-ghost" onClick={() => toggle(r)}>
                        {r.status === 'submitted' ? 'Reopen' : 'Mark submitted'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

import { useState, useEffect, useCallback } from 'react';
import api, { apiError } from '../api/client';
import Modal from '../components/Modal';
import { Spinner, Empty, Alert, StatusBadge, fmtDate } from '../components/ui';

const EMPTY = { employee_id: '', title: '', village: '', project_id: '', scheduled_date: '', start_time: '', notes: '' };

export default function FieldSchedule() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filters, setFilters] = useState({ status: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => v && (params[k] = v));
      const { data } = await api.get('/hr/schedules', { params });
      setRows(data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/hr/employees', { params: { limit: 100 } }).then((r) => setEmployees(r.data.data)).catch(() => {});
    api.get('/projects', { params: { limit: 100 } }).then((r) => setProjects(r.data.data)).catch(() => {});
  }, []);

  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const openCreate = () => { setEditing(null); setForm(EMPTY); setFormError(''); setShow(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({ ...EMPTY, ...s, project_id: s.project_id || '',
      scheduled_date: s.scheduled_date?.slice(0, 10) || '', start_time: s.start_time || '' });
    setFormError(''); setShow(true);
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      const payload = { ...form, project_id: form.project_id || null, start_time: form.start_time || null };
      if (editing) await api.put(`/hr/schedules/${editing.id}`, payload);
      else await api.post('/hr/schedules', payload);
      setShow(false); load();
    } catch (err) { setFormError(apiError(err)); }
    finally { setSaving(false); }
  };

  const setStatus = async (s, status) => {
    try { await api.put(`/hr/schedules/${s.id}`, { status }); load(); }
    catch (err) { alert(apiError(err)); }
  };
  const remove = async (s) => {
    if (!window.confirm('Delete this scheduled visit?')) return;
    try { await api.delete(`/hr/schedules/${s.id}`); load(); }
    catch (err) { alert(apiError(err)); }
  };

  const onFilter = (e) => setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));
  const isOverdue = (s) => s.status === 'planned' && new Date(s.scheduled_date) < new Date(new Date().toDateString());

  return (
    <>
      <div className="page-header">
        <h1>Field Schedule</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Schedule Visit</button>
      </div>
      <p style={{ color: 'var(--text-muted)', marginTop: -8, marginBottom: 18 }}>
        Roster of field-staff visits — who goes to which village/activity and when. Upcoming &amp; overdue visits also appear in notifications.
      </p>

      <div className="card">
        <div className="filters">
          <div className="field"><label>From</label><input type="date" name="from" value={filters.from} onChange={onFilter} /></div>
          <div className="field"><label>To</label><input type="date" name="to" value={filters.to} onChange={onFilter} /></div>
          <div className="field"><label>Status</label>
            <select name="status" value={filters.status} onChange={onFilter}>
              <option value="">All</option><option value="planned">Planned</option>
              <option value="completed">Completed</option><option value="missed">Missed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <Alert>{error}</Alert>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty>No visits scheduled. Click “Schedule Visit”.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Time</th><th>Staff</th><th>Activity</th><th>Village</th><th>Project</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td style={{ whiteSpace: 'nowrap', color: isOverdue(s) ? 'var(--danger)' : 'inherit', fontWeight: isOverdue(s) ? 600 : 400 }}>
                      {fmtDate(s.scheduled_date)}{isOverdue(s) ? ' ⚠' : ''}
                    </td>
                    <td>{s.start_time ? s.start_time.slice(0, 5) : '—'}</td>
                    <td><strong>{s.staff_name}</strong></td>
                    <td>{s.title}</td>
                    <td>{s.village || '—'}</td>
                    <td>{s.project_name || '—'}</td>
                    <td><StatusBadge status={s.status === 'planned' ? 'pending' : s.status === 'completed' ? 'completed' : s.status === 'missed' ? 'delayed' : 'cancelled'} /></td>
                    <td>
                      <div className="row-actions">
                        {s.status === 'planned' && <>
                          <button className="btn btn-sm btn-primary" onClick={() => setStatus(s, 'completed')}>Done</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setStatus(s, 'missed')}>Missed</button>
                        </>}
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(s)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(s)}>×</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {show && (
        <Modal title={editing ? 'Edit Visit' : 'Schedule Field Visit'} onClose={() => setShow(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>}>
          <Alert>{formError}</Alert>
          <form onSubmit={save} className="form-grid">
            <div className="field full"><label>Staff Member *</label>
              <select name="employee_id" value={form.employee_id} onChange={onField} required>
                <option value="">Select staff…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}{e.designation ? ` · ${e.designation}` : ''}</option>)}
              </select>
            </div>
            <div className="field full"><label>Activity *</label><input name="title" value={form.title} onChange={onField} placeholder="e.g. Beneficiary survey, Training session" required /></div>
            <div className="field"><label>Village</label><input name="village" value={form.village} onChange={onField} /></div>
            <div className="field"><label>Linked Project</label>
              <select name="project_id" value={form.project_id} onChange={onField}>
                <option value="">—</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Date *</label><input type="date" name="scheduled_date" value={form.scheduled_date} onChange={onField} required /></div>
            <div className="field"><label>Time</label><input type="time" name="start_time" value={form.start_time} onChange={onField} /></div>
            <div className="field full"><label>Notes</label><textarea name="notes" rows="2" value={form.notes} onChange={onField} /></div>
          </form>
        </Modal>
      )}
    </>
  );
}

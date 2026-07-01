import { useEffect, useState, useCallback } from 'react';
import api, { apiError } from '../api/client';
import Modal from '../components/Modal';
import { Spinner, Empty, Alert, StatusBadge, money, fmtDate } from '../components/ui';

const EMPTY = { full_name: '', designation: '', department: '', employment_type: 'staff', phone: '', email: '', monthly_salary: '', date_joined: '' };
const TYPES = ['staff', 'volunteer', 'contract'];

export default function Hr() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [attEmp, setAttEmp] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/hr/employees', { params: { limit: 50 } });
      setRows(data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const openCreate = () => { setEditing(null); setForm(EMPTY); setFormError(''); setShow(true); };
  const openEdit = (emp) => {
    setEditing(emp);
    setForm({ ...EMPTY, ...emp, monthly_salary: emp.monthly_salary ?? '', date_joined: emp.date_joined?.slice(0, 10) || '' });
    setFormError(''); setShow(true);
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      const payload = { ...form, monthly_salary: form.monthly_salary === '' ? 0 : Number(form.monthly_salary),
        date_joined: form.date_joined || null, email: form.email || null };
      if (editing) await api.put(`/hr/employees/${editing.id}`, payload);
      else await api.post('/hr/employees', payload);
      setShow(false); load();
    } catch (err) { setFormError(apiError(err)); }
    finally { setSaving(false); }
  };

  const remove = async (emp) => {
    if (!window.confirm(`Delete "${emp.full_name}"?`)) return;
    try { await api.delete(`/hr/employees/${emp.id}`); load(); }
    catch (err) { alert(apiError(err)); }
  };

  return (
    <>
      <div className="page-header">
        <h1>HR & Volunteers</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Person</button>
      </div>

      <div className="card">
        <Alert>{error}</Alert>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Designation</th><th>Type</th><th>Department</th><th>Salary</th><th></th></tr></thead>
              <tbody>
                {rows.map((emp) => (
                  <tr key={emp.id}>
                    <td><strong>{emp.full_name}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emp.email || ''}</div></td>
                    <td>{emp.designation || '—'}</td>
                    <td><span className="badge badge-gray">{emp.employment_type}</span></td>
                    <td>{emp.department || '—'}</td>
                    <td>{money(emp.monthly_salary)}</td>
                    <td><div className="row-actions">
                      <button className="btn btn-sm btn-ghost" onClick={() => setAttEmp(emp)}>Attendance</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(emp)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(emp)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {show && (
        <Modal title={editing ? 'Edit Person' : 'Add Person'} onClose={() => setShow(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>}>
          <Alert>{formError}</Alert>
          <form onSubmit={save} className="form-grid">
            <div className="field full"><label>Full Name *</label><input name="full_name" value={form.full_name} onChange={onField} required /></div>
            <div className="field"><label>Designation</label><input name="designation" value={form.designation} onChange={onField} /></div>
            <div className="field"><label>Department</label><input name="department" value={form.department} onChange={onField} /></div>
            <div className="field"><label>Type</label>
              <select name="employment_type" value={form.employment_type} onChange={onField}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field"><label>Phone</label><input name="phone" value={form.phone} onChange={onField} /></div>
            <div className="field"><label>Email</label><input type="email" name="email" value={form.email} onChange={onField} /></div>
            <div className="field"><label>Monthly Salary (₹)</label><input type="number" name="monthly_salary" value={form.monthly_salary} onChange={onField} /></div>
            <div className="field"><label>Date Joined</label><input type="date" name="date_joined" value={form.date_joined} onChange={onField} /></div>
          </form>
        </Modal>
      )}

      {attEmp && <Attendance emp={attEmp} onClose={() => setAttEmp(null)} />}
    </>
  );
}

/* --------------------------- ATTENDANCE --------------------------- */
function Attendance({ emp, onClose }) {
  const [rows, setRows] = useState([]);
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('present');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/hr/employees/${emp.id}/attendance`);
      setRows(data.data);
    } catch (err) { setError(apiError(err)); }
  }, [emp.id]);
  useEffect(() => { load(); }, [load]);

  const mark = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/hr/employees/${emp.id}/attendance`, { work_date: date || undefined, status });
      setDate(''); load();
    } catch (err) { alert(apiError(err)); }
  };

  return (
    <Modal title={`Attendance — ${emp.full_name}`} onClose={onClose}
      footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      <Alert>{error}</Alert>
      <form onSubmit={mark} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 14 }}>
        <div className="field"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="present">Present</option><option value="absent">Absent</option>
            <option value="leave">Leave</option><option value="half_day">Half day</option>
          </select>
        </div>
        <button className="btn btn-primary btn-sm">Mark</button>
      </form>
      {rows.length === 0 ? <Empty>No attendance recorded</Empty> : (
        <table>
          <thead><tr><th>Date</th><th>Status</th><th>Remarks</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}><td>{fmtDate(a.work_date)}</td><td><StatusBadge status={a.status} /></td><td>{a.remarks || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

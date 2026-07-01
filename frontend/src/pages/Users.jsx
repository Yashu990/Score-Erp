import { useEffect, useState, useCallback } from 'react';
import api, { apiError } from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { Spinner, Empty, Alert, fmtDate } from '../components/ui';

const ROLES = ['admin', 'manager', 'finance', 'field_staff', 'viewer'];
const EMPTY = { full_name: '', email: '', phone: '', password: '', role: 'field_staff' };

export default function Users() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/auth/users');
      setRows(data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const save = async (e) => {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      await api.post('/auth/register', form);
      setShow(false); setForm(EMPTY); load();
    } catch (err) { setFormError(apiError(err)); }
    finally { setSaving(false); }
  };

  const toggleActive = async (u) => {
    try { await api.patch(`/auth/users/${u.id}/active`, { is_active: !u.is_active }); load(); }
    catch (err) { alert(apiError(err)); }
  };

  return (
    <>
      <div className="page-header">
        <h1>Users</h1>
        {isAdmin && <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setFormError(''); setShow(true); }}>+ Add User</button>}
      </div>

      <div className="card">
        <Alert>{error}</Alert>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th>{isAdmin && <th></th>}</tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.full_name}</strong></td>
                    <td>{u.email}</td>
                    <td><span className="badge badge-gray">{u.role}</span></td>
                    <td>{u.is_active ? <span className="badge badge-green">active</span> : <span className="badge badge-red">disabled</span>}</td>
                    <td>{u.last_login_at ? fmtDate(u.last_login_at) : '—'}</td>
                    {isAdmin && (
                      <td>
                        <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(u)}>
                          {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {show && (
        <Modal title="Add User" onClose={() => setShow(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
          </>}>
          <Alert>{formError}</Alert>
          <form onSubmit={save} className="form-grid">
            <div className="field full"><label>Full Name *</label><input name="full_name" value={form.full_name} onChange={onField} required /></div>
            <div className="field"><label>Email *</label><input type="email" name="email" value={form.email} onChange={onField} required /></div>
            <div className="field"><label>Phone</label><input name="phone" value={form.phone} onChange={onField} /></div>
            <div className="field"><label>Password *</label><input type="password" name="password" value={form.password} onChange={onField} required minLength={6} /></div>
            <div className="field"><label>Role</label>
              <select name="role" value={form.role} onChange={onField}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

import { useEffect, useState, useCallback } from 'react';
import api, { apiError } from '../api/client';
import Modal from '../components/Modal';
import ImportBeneficiaries from '../components/ImportBeneficiaries';
import VoiceEntry from '../components/VoiceEntry';
import { Spinner, Empty, Alert, Pagination, StatusBadge, money } from '../components/ui';

const EMPTY = {
  full_name: '', gender: '', date_of_birth: '', phone: '', village: '', district: '',
  education: '', occupation: '', monthly_income: '', household_size: '', household_head: '',
  skills: '', cluster_id: '', status: 'active', notes: '',
};

export default function Beneficiaries() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [clusters, setClusters] = useState([]);
  const [filters, setFilters] = useState({ search: '', village: '', skill: '', status: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 10 };
      Object.entries(filters).forEach(([k, v]) => v && (params[k] = v));
      const { data } = await api.get('/beneficiaries', { params });
      setRows(data.data);
      setPagination(data.pagination);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/clusters').then((r) => setClusters(r.data.data)).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (b) => {
    setEditing(b);
    setForm({
      ...EMPTY,
      ...b,
      date_of_birth: b.date_of_birth ? b.date_of_birth.slice(0, 10) : '',
      monthly_income: b.monthly_income ?? '',
      household_size: b.household_size ?? '',
      skills: (b.skills || []).join(', '),
      cluster_id: b.cluster_id || '',
    });
    setFormError('');
    setShowForm(true);
  };

  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        ...form,
        monthly_income: form.monthly_income === '' ? null : Number(form.monthly_income),
        household_size: form.household_size === '' ? null : Number(form.household_size),
        date_of_birth: form.date_of_birth || null,
        cluster_id: form.cluster_id || null,
        skills: form.skills
          ? form.skills.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      };
      // drop empty strings so we don't fail optional validators
      Object.keys(payload).forEach((k) => payload[k] === '' && (payload[k] = null));

      if (editing) await api.put(`/beneficiaries/${editing.id}`, payload);
      else await api.post('/beneficiaries', payload);

      setShowForm(false);
      load();
    } catch (err) {
      setFormError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b) => {
    if (!window.confirm(`Delete beneficiary "${b.full_name}"?`)) return;
    try {
      await api.delete(`/beneficiaries/${b.id}`);
      load();
    } catch (err) {
      alert(apiError(err));
    }
  };

  const onFilter = (e) => {
    setPage(1);
    setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  return (
    <>
      <div className="page-header">
        <h1>Beneficiaries</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowVoice(true)}>🎙 Voice Entry</button>
          <button className="btn btn-ghost" onClick={() => setShowImport(true)}>⬆ Import Excel/CSV</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Add Beneficiary</button>
        </div>
      </div>

      <div className="card">
        <div className="filters">
          <div className="field">
            <label>Search</label>
            <input name="search" placeholder="Name, code, phone" value={filters.search} onChange={onFilter} />
          </div>
          <div className="field">
            <label>Village</label>
            <input name="village" value={filters.village} onChange={onFilter} />
          </div>
          <div className="field">
            <label>Skill</label>
            <input name="skill" placeholder="e.g. weaving" value={filters.skill} onChange={onFilter} />
          </div>
          <div className="field">
            <label>Status</label>
            <select name="status" value={filters.status} onChange={onFilter}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="graduated">Graduated</option>
            </select>
          </div>
        </div>

        <Alert>{error}</Alert>

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty>No beneficiaries match your filters.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Village</th>
                  <th>Skills</th>
                  <th>Income</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.full_name}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.code || b.gender || ''}</div>
                    </td>
                    <td>{b.village || '—'}</td>
                    <td>
                      {(b.skills || []).length
                        ? b.skills.map((s) => <span key={s} className="chip">{s}</span>)
                        : '—'}
                    </td>
                    <td>{b.monthly_income ? money(b.monthly_income) : '—'}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(b)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(b)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPage={setPage}
          />
        )}
      </div>

      {showImport && (
        <ImportBeneficiaries
          onClose={() => setShowImport(false)}
          onDone={load}
        />
      )}

      {showVoice && (
        <VoiceEntry
          onClose={() => setShowVoice(false)}
          onDone={load}
        />
      )}

      {showForm && (
        <Modal
          title={editing ? 'Edit Beneficiary' : 'Add Beneficiary'}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <Alert>{formError}</Alert>
          <form onSubmit={save} className="form-grid">
            <div className="field full">
              <label>Full Name *</label>
              <input name="full_name" value={form.full_name} onChange={onField} required />
            </div>
            <div className="field">
              <label>Gender</label>
              <select name="gender" value={form.gender || ''} onChange={onField}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="field">
              <label>Date of Birth</label>
              <input type="date" name="date_of_birth" value={form.date_of_birth || ''} onChange={onField} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input name="phone" value={form.phone || ''} onChange={onField} />
            </div>
            <div className="field">
              <label>Village</label>
              <input name="village" value={form.village || ''} onChange={onField} />
            </div>
            <div className="field">
              <label>District</label>
              <input name="district" value={form.district || ''} onChange={onField} />
            </div>
            <div className="field">
              <label>Education</label>
              <input name="education" value={form.education || ''} onChange={onField} />
            </div>
            <div className="field">
              <label>Occupation</label>
              <input name="occupation" value={form.occupation || ''} onChange={onField} />
            </div>
            <div className="field">
              <label>Monthly Income (₹)</label>
              <input type="number" name="monthly_income" value={form.monthly_income} onChange={onField} />
            </div>
            <div className="field">
              <label>Household Size</label>
              <input type="number" name="household_size" value={form.household_size} onChange={onField} />
            </div>
            <div className="field">
              <label>Cluster</label>
              <select name="cluster_id" value={form.cluster_id || ''} onChange={onField}>
                <option value="">—</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select name="status" value={form.status} onChange={onField}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="graduated">Graduated</option>
              </select>
            </div>
            <div className="field full">
              <label>Skills (comma-separated)</label>
              <input name="skills" placeholder="stitching, weaving, pottery" value={form.skills} onChange={onField} />
            </div>
            <div className="field full">
              <label>Notes</label>
              <textarea name="notes" rows="2" value={form.notes || ''} onChange={onField} />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

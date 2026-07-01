import { useEffect, useState, useCallback } from 'react';
import api, { apiError } from '../api/client';
import Modal from './Modal';
import { Spinner, Empty, Alert, Pagination } from './ui';

/**
 * Generic list + create/edit/delete page for a simple resource.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string} props.endpoint            e.g. '/donors'
 * @param {string} props.singular            e.g. 'Donor'
 * @param {Array}  props.columns             [{ key, label, render? }]
 * @param {Array}  props.fields              [{ name, label, type?, options?, required?, full?, parse? }]
 * @param {boolean} [props.searchable=true]
 * @param {function} [props.toPayload]       transform form -> request body
 */
export default function CrudPage({
  title,
  endpoint,
  singular,
  columns,
  fields,
  searchable = true,
  toPayload,
  rowActions = [],
  headerExtra = null,
}) {
  const blank = Object.fromEntries(fields.map((f) => [f.name, f.default ?? '']));

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: 10 };
      if (search) params.search = search;
      const { data } = await api.get(endpoint, { params });
      setRows(data.data);
      setPagination(data.pagination || { page: 1, totalPages: 1, total: data.data.length });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(blank);
    setFormError('');
    setShowForm(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setForm({ ...blank, ...Object.fromEntries(fields.map((f) => [f.name, row[f.name] ?? ''])) });
    setFormError('');
    setShowForm(true);
  };
  const onField = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      let payload = { ...form };
      fields.forEach((f) => {
        if (f.parse && payload[f.name] !== '' && payload[f.name] != null) {
          payload[f.name] = f.parse(payload[f.name]);
        }
        if (payload[f.name] === '') payload[f.name] = null;
      });
      if (toPayload) payload = toPayload(payload);

      if (editing) await api.put(`${endpoint}/${editing.id}`, payload);
      else await api.post(endpoint, payload);
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete this ${singular.toLowerCase()}?`)) return;
    try {
      await api.delete(`${endpoint}/${row.id}`);
      load();
    } catch (err) {
      alert(apiError(err));
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>{title}</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Add {singular}</button>
      </div>

      <div className="card">
        {searchable && (
          <div className="filters">
            <div className="field" style={{ minWidth: 260 }}>
              <label>Search</label>
              <input
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value); }}
                placeholder={`Search ${title.toLowerCase()}`}
              />
            </div>
          </div>
        )}

        <Alert>{error}</Alert>

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => <th key={c.key}>{c.label}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {columns.map((c) => (
                      <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>
                    ))}
                    <td>
                      <div className="row-actions">
                        {rowActions.map((a) => (
                          <button key={a.label} className={`btn btn-sm ${a.className || 'btn-ghost'}`}
                            onClick={() => a.onClick(row)}>{a.label}</button>
                        ))}
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(row)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(row)}>Delete</button>
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

      {showForm && (
        <Modal
          title={`${editing ? 'Edit' : 'Add'} ${singular}`}
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
            {fields.map((f) => (
              <div className={`field ${f.full ? 'full' : ''}`} key={f.name}>
                <label>{f.label}{f.required ? ' *' : ''}</label>
                {f.type === 'select' ? (
                  <select name={f.name} value={form[f.name] ?? ''} onChange={onField} required={f.required}>
                    <option value="">—</option>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea name={f.name} rows="2" value={form[f.name] ?? ''} onChange={onField} />
                ) : (
                  <input
                    type={f.type || 'text'}
                    name={f.name}
                    value={form[f.name] ?? ''}
                    onChange={onField}
                    required={f.required}
                  />
                )}
              </div>
            ))}
          </form>
        </Modal>
      )}
    </>
  );
}

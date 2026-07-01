import { useState, useEffect, useCallback } from 'react';
import api, { apiError } from '../api/client';
import Modal from '../components/Modal';
import { Spinner, Empty, Alert, StatusBadge, money, fmtDate } from '../components/ui';
import { PayslipEditor, PayslipView } from '../components/Payslip';

export default function Payroll() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ period: '', label: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [detailId, setDetailId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/hr/payroll');
      setRows(data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      const { data } = await api.post('/hr/payroll', form);
      setShow(false); setForm({ period: '', label: '' });
      load();
      setDetailId(data.data.id);
    } catch (err) { setFormError(apiError(err)); }
    finally { setSaving(false); }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete payroll run ${r.period}?`)) return;
    try { await api.delete(`/hr/payroll/${r.id}`); load(); }
    catch (err) { alert(apiError(err)); }
  };

  return (
    <>
      <div className="page-header">
        <h1>Payroll</h1>
        <button className="btn btn-primary" onClick={() => { setForm({ period: '', label: '' }); setFormError(''); setShow(true); }}>
          + New Payroll Run
        </button>
      </div>

      <div className="card">
        <Alert>{error}</Alert>
        {loading ? <Spinner /> : rows.length === 0 ? <Empty>No payroll runs yet. Create one to generate payslips for active staff.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Period</th><th>Label</th><th>Run Date</th><th>Payslips</th><th>Total Net</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.period}</strong></td>
                    <td>{r.label || '—'}</td>
                    <td>{fmtDate(r.run_date)}</td>
                    <td>{r.paid_count}/{r.payslip_count} paid</td>
                    <td>{money(r.total_net)}</td>
                    <td><StatusBadge status={r.status === 'finalized' ? 'completed' : 'pending'} /></td>
                    <td><div className="row-actions">
                      <button className="btn btn-sm btn-primary" onClick={() => setDetailId(r.id)}>View</button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {show && (
        <Modal title="New Payroll Run" onClose={() => setShow(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={create} disabled={saving}>{saving ? 'Generating…' : 'Create & Generate'}</button>
          </>}>
          <Alert>{formError}</Alert>
          <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
            This generates a draft payslip for every active staff member using their monthly salary as basic pay.
          </p>
          <form onSubmit={create} className="form-grid">
            <div className="field">
              <label>Period (month) *</label>
              <input type="month" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Label</label>
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. June 2026 Salary" />
            </div>
          </form>
        </Modal>
      )}

      {detailId && <PayrollDetail id={detailId} onClose={() => setDetailId(null)} onChange={load} />}
    </>
  );
}

function PayrollDetail({ id, onClose, onChange }) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editSlip, setEditSlip] = useState(null);
  const [viewSlipId, setViewSlipId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/hr/payroll/${id}`);
      setRun(data.data);
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const patchSlip = async (slip, patch) => {
    try { await api.put(`/hr/payslips/${slip.id}`, patch); load(); onChange?.(); }
    catch (err) { alert(apiError(err)); }
  };
  const togglePaid = (slip) => patchSlip(slip, { status: slip.status === 'paid' ? 'pending' : 'paid' });

  const finalize = async () => {
    const next = run.status === 'finalized' ? 'draft' : 'finalized';
    try { await api.put(`/hr/payroll/${id}`, { status: next }); load(); onChange?.(); }
    catch (err) { alert(apiError(err)); }
  };

  return (
    <Modal title={run ? `Payroll — ${run.period}${run.label ? ` (${run.label})` : ''}` : 'Payroll'} onClose={onClose}
      footer={<>
        {run && <button className="btn btn-ghost" onClick={finalize}>{run.status === 'finalized' ? 'Reopen' : 'Finalize'}</button>}
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
      </>}>
      <Alert>{error}</Alert>
      {loading || !run ? <Spinner /> : (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card"><div className="stat-label">Total Net Pay</div><div className="stat-value" style={{ fontSize: 20 }}>{money(run.total_net)}</div></div>
            <div className="stat-card"><div className="stat-label">Payslips</div><div className="stat-value" style={{ fontSize: 20 }}>{run.payslips.length}</div></div>
            <div className="stat-card"><div className="stat-label">Status</div><div style={{ marginTop: 6 }}><StatusBadge status={run.status === 'finalized' ? 'completed' : 'pending'} /></div></div>
          </div>

          {run.payslips.length === 0 ? <Empty>No payslips (no active employees).</Empty> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Employee</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {run.payslips.map((p) => {
                    const ded = Number(p.pf) + Number(p.professional_tax) + Number(p.tds) + Number(p.other_deductions);
                    return (
                      <tr key={p.id}>
                        <td><strong>{p.full_name}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.designation || ''}</div></td>
                        <td>{money(p.gross_earnings)}</td>
                        <td>{money(ded)}</td>
                        <td><strong>{money(p.net_pay)}</strong></td>
                        <td>
                          {p.status === 'paid'
                            ? <span className="badge badge-green">Paid {p.paid_on ? fmtDate(p.paid_on) : ''}</span>
                            : <span className="badge badge-amber">pending</span>}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="btn btn-sm btn-ghost" onClick={() => setEditSlip(p)}>Edit salary</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setViewSlipId(p.id)}>Payslip</button>
                            <button className={`btn btn-sm ${p.status === 'paid' ? 'btn-ghost' : 'btn-primary'}`} onClick={() => togglePaid(p)}>
                              {p.status === 'paid' ? 'Unpay' : 'Mark paid'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editSlip && <PayslipEditor payslip={editSlip} onClose={() => setEditSlip(null)} onSaved={() => { load(); onChange?.(); }} />}
      {viewSlipId && <PayslipView payslipId={viewSlipId} onClose={() => setViewSlipId(null)} />}
    </Modal>
  );
}

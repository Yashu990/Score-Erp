import { useState, useEffect, useCallback } from 'react';
import api, { apiError } from '../api/client';
import Modal from './Modal';
import { Spinner, Alert, money, amountInWords, fmtMonth, fmtDate } from './ui';
import brandIcon from '../assets/score-erp-ai-logo-clean.png';

const EARNINGS = [
  { key: 'basic_salary', label: 'Basic Salary' },
  { key: 'hra', label: 'HRA (House Rent Allowance)' },
  { key: 'da', label: 'DA (Dearness Allowance)' },
  { key: 'other_allowances', label: 'Other Allowances' },
];
const DEDUCTIONS = [
  { key: 'pf', label: 'Provident Fund (PF)' },
  { key: 'professional_tax', label: 'Professional Tax' },
  { key: 'tds', label: 'TDS' },
  { key: 'other_deductions', label: 'Other Deductions' },
];

/* ------------------------- EDITOR MODAL --------------------------- */
export function PayslipEditor({ payslip, onClose, onSaved }) {
  const init = {};
  [...EARNINGS, ...DEDUCTIONS].forEach((f) => { init[f.key] = Number(payslip[f.key] ?? 0); });
  const [form, setForm] = useState(init);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, val) => setForm((f) => ({ ...f, [k]: val }));

  const gross = EARNINGS.reduce((s, f) => s + (Number(form[f.key]) || 0), 0);
  const totalDed = DEDUCTIONS.reduce((s, f) => s + (Number(form[f.key]) || 0), 0);
  const net = gross - totalDed;

  const save = async () => {
    setSaving(true); setError('');
    try {
      const payload = {};
      [...EARNINGS, ...DEDUCTIONS].forEach((f) => { payload[f.key] = Number(form[f.key]) || 0; });
      await api.put(`/hr/payslips/${payslip.id}`, payload);
      onSaved?.();
      onClose();
    } catch (err) { setError(apiError(err)); }
    finally { setSaving(false); }
  };

  return (
    <Modal title={`Edit Salary — ${payslip.full_name}`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </>}>
      <Alert>{error}</Alert>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <h4 style={{ margin: '0 0 10px', color: 'var(--primary-dark)' }}>Earnings</h4>
          {EARNINGS.map((f) => (
            <Row key={f.key} label={f.label} value={form[f.key]} onChange={(v) => set(f.key, v)} />
          ))}
          <Total label="Gross Earnings" value={gross} />
        </div>
        <div>
          <h4 style={{ margin: '0 0 10px', color: 'var(--danger)' }}>Deductions</h4>
          {DEDUCTIONS.map((f) => (
            <Row key={f.key} label={f.label} value={form[f.key]} onChange={(v) => set(f.key, v)} />
          ))}
          <Total label="Total Deductions" value={totalDed} />
        </div>
      </div>
      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--primary-light)', borderRadius: 10,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Net Pay</strong>
        <strong style={{ fontSize: 20, color: 'var(--primary-dark)' }}>{money(net)}</strong>
      </div>
    </Modal>
  );
}

function Row({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        style={{ width: 110, padding: '6px 9px', border: '1px solid var(--border)', borderRadius: 6, textAlign: 'right' }} />
    </div>
  );
}
function Total({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)',
      paddingTop: 8, marginTop: 4, fontWeight: 700 }}>
      <span>{label}</span><span>{money(value)}</span>
    </div>
  );
}

/* ------------------------ PRINTABLE PAYSLIP ----------------------- */
export function PayslipView({ payslipId, onClose }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setP((await api.get(`/hr/payslips/${payslipId}`)).data.data); }
    catch (err) { setError(apiError(err)); }
  }, [payslipId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const clear = () => document.body.classList.remove('printing-payslip');
    window.addEventListener('afterprint', clear);
    return () => { clear(); window.removeEventListener('afterprint', clear); };
  }, []);

  const download = () => {
    document.body.classList.add('printing-payslip');
    window.print();
  };

  const num = (x) => Number(x || 0);

  return (
    <Modal title={`Payslip — ${p?.full_name || ''}`} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost no-print" onClick={onClose}>Close</button>
        <button className="btn btn-primary no-print" onClick={download} disabled={!p}>🖨 Download / Print PDF</button>
      </>}>
      <Alert>{error}</Alert>
      {!p ? <Spinner /> : (
        <div className="payslip-sheet">
          <div className="payslip-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={brandIcon} alt="SCORE" style={{ width: 46, height: 46, objectFit: 'contain' }} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary-dark)' }}>SCORE</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>NGO Management System</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700 }}>Payslip</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmtMonth(p.period)}</div>
            </div>
          </div>

          <div className="payslip-emp">
            <Field k="Employee" v={p.full_name} />
            <Field k="Designation" v={p.designation || '—'} />
            <Field k="Department" v={p.department || '—'} />
            <Field k="Type" v={p.employment_type} />
            <Field k="Date Joined" v={p.date_joined ? fmtDate(p.date_joined) : '—'} />
            <Field k="Status" v={p.status === 'paid' ? `Paid ${p.paid_on ? fmtDate(p.paid_on) : ''}` : 'Pending'} />
          </div>

          <div className="payslip-cols">
            <table className="payslip-table">
              <thead><tr><th>Earnings</th><th>Amount</th></tr></thead>
              <tbody>
                <tr><td>Basic Salary</td><td>{money(p.basic_salary)}</td></tr>
                <tr><td>HRA</td><td>{money(p.hra)}</td></tr>
                <tr><td>DA</td><td>{money(p.da)}</td></tr>
                <tr><td>Other Allowances</td><td>{money(p.other_allowances)}</td></tr>
                <tr className="tot"><td>Gross Earnings</td><td>{money(p.gross_earnings)}</td></tr>
              </tbody>
            </table>
            <table className="payslip-table">
              <thead><tr><th>Deductions</th><th>Amount</th></tr></thead>
              <tbody>
                <tr><td>Provident Fund</td><td>{money(p.pf)}</td></tr>
                <tr><td>Professional Tax</td><td>{money(p.professional_tax)}</td></tr>
                <tr><td>TDS</td><td>{money(p.tds)}</td></tr>
                <tr><td>Other Deductions</td><td>{money(p.other_deductions)}</td></tr>
                <tr className="tot"><td>Total Deductions</td>
                  <td>{money(num(p.pf) + num(p.professional_tax) + num(p.tds) + num(p.other_deductions))}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="payslip-net">
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Net Pay</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary-dark)' }}>{money(p.net_pay)}</div>
            </div>
            <div style={{ textAlign: 'right', maxWidth: 260, fontSize: 12, color: 'var(--text-muted)' }}>
              Rupees {amountInWords(p.net_pay)} Only
            </div>
          </div>

          <p style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 18 }}>
            This is a system-generated payslip and does not require a signature.
          </p>
        </div>
      )}
    </Modal>
  );
}

function Field({ k, v }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k}</div>
      <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{v}</div>
    </div>
  );
}

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import api, { apiError } from '../api/client';
import Modal from './Modal';
import { Alert } from './ui';

const FIELDS = [
  'full_name', 'gender', 'village', 'district',
  'education', 'occupation', 'monthly_income', 'household_size', 'skills',
];

// Map varied spreadsheet headers to our field names
const HEADER_ALIASES = {
  name: 'full_name', fullname: 'full_name', full_name: 'full_name', beneficiary: 'full_name',
  sex: 'gender', gender: 'gender',
  village: 'village', city: 'village',
  district: 'district',
  education: 'education', qualification: 'education',
  occupation: 'occupation', job: 'occupation',
  income: 'monthly_income', monthly_income: 'monthly_income', salary: 'monthly_income',
  household: 'household_size', household_size: 'household_size', family_size: 'household_size',
  skills: 'skills', skill: 'skills',
};

function normalizeKey(k) {
  const key = String(k).trim().toLowerCase().replace(/\s+/g, '_');
  return HEADER_ALIASES[key] || (FIELDS.includes(key) ? key : null);
}

export default function ImportBeneficiaries({ onClose, onDone }) {
  const fileRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [importing, setImporting] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const mapped = raw.map((r) => {
        const out = {};
        for (const [k, v] of Object.entries(r)) {
          const field = normalizeKey(k);
          if (field) out[field] = v;
        }
        return out;
      }).filter((r) => Object.keys(r).length > 0);

      if (mapped.length === 0) {
        setError('No recognizable columns found. Expected a "Name" column at minimum.');
        setRows([]);
        return;
      }
      setRows(mapped);
    } catch {
      setError('Could not read that file. Please use .xlsx or .csv.');
      setRows([]);
    } finally {
      e.target.value = '';
    }
  };

  const doImport = async () => {
    setImporting(true);
    setError('');
    try {
      const { data } = await api.post('/beneficiaries/bulk-import', { rows });
      setResult(data.data);
      if (data.data.inserted > 0) onDone?.();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        Name: 'Sita Devi', Gender: 'female', Village: 'Rampur', District: 'Bhilwara',
        Education: '8th pass', Occupation: 'Tailor', Income: 4500, Household_Size: 5,
        Skills: 'stitching; tailoring',
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Beneficiaries');
    XLSX.writeFile(wb, 'beneficiary-import-template.xlsx');
  };

  const preview = rows.slice(0, 5);

  return (
    <Modal
      title="Import Beneficiaries"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          {!result && (
            <button className="btn btn-primary" onClick={doImport} disabled={!rows.length || importing}>
              {importing ? 'Importing…' : `Import ${rows.length} row(s)`}
            </button>
          )}
        </>
      }
    >
      <Alert>{error}</Alert>

      {result ? (
        <div>
          <Alert type="success">
            Imported {result.inserted} beneficiaries{result.skipped ? `, skipped ${result.skipped}` : ''}.
          </Alert>
          {result.errors?.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table>
                <thead><tr><th>Row</th><th>Issue</th></tr></thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i}><td>{e.row}</td><td>{e.message}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
            Upload an Excel (.xlsx) or CSV file of existing beneficiary records. Columns are
            matched automatically (Name, Gender, Village, District, Education, Occupation,
            Income, Household_Size, Skills). Skills can be separated by <code>;</code> or <code>,</code>.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFile} style={{ display: 'none' }} />
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Choose file</button>
            <button className="btn btn-ghost" onClick={downloadTemplate}>Download template</button>
            {fileName && <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-muted)' }}>{fileName}</span>}
          </div>

          {rows.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Preview — {rows.length} row(s) detected
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Name</th><th>Gender</th><th>Village</th><th>Income</th><th>Skills</th></tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i}>
                        <td>{r.full_name || <em style={{ color: 'var(--danger)' }}>missing</em>}</td>
                        <td>{r.gender || '—'}</td>
                        <td>{r.village || '—'}</td>
                        <td>{r.monthly_income || '—'}</td>
                        <td>{r.skills || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > preview.length && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  …and {rows.length - preview.length} more
                </div>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

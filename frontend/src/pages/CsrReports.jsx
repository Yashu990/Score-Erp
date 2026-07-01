import { useEffect, useState, useCallback } from 'react';
import api, { apiError } from '../api/client';
import { Spinner, Empty, Alert, StatusBadge, money, fmtDate } from '../components/ui';
import brandIcon from '../assets/score-erp-ai-logo-clean.png';

export default function CsrReports() {
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('impact');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/reports/csr');
        setDonors(data.data);
      } catch (err) {
        setError(apiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openReport = useCallback(async (donor, reportMode) => {
    setSelected(donor);
    setMode(reportMode);
    setReport(null);
    setReportLoading(true);
    try {
      const url = reportMode === 'compliance'
        ? `/reports/csr/${donor.id}/compliance`
        : `/reports/csr/${donor.id}`;
      const { data } = await api.get(url);
      setReport(data.data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setReportLoading(false);
    }
  }, []);

  if (loading) return <Spinner />;

  if (selected) {
    const back = () => { setSelected(null); setReport(null); };
    return mode === 'compliance'
      ? <ComplianceReport report={report} loading={reportLoading} onBack={back} />
      : <DonorReport donor={selected} report={report} loading={reportLoading} onBack={back} />;
  }

  return (
    <>
      <div className="page-header">
        <h1>CSR Impact Reports</h1>
      </div>
      <p style={{ color: 'var(--text-muted)', marginTop: -8, marginBottom: 18 }}>
        Auto-generated, donor-ready impact reports built from live ERP data. Select a donor to view and print/export.
      </p>

      <Alert>{error}</Alert>

      <div className="card">
        {donors.length === 0 ? (
          <Empty>No donors yet. Add donors and grants to generate reports.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Donor</th><th>Type</th><th>Grants</th><th>Committed</th>
                  <th>Utilized</th><th>Projects</th><th></th>
                </tr>
              </thead>
              <tbody>
                {donors.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.name}</strong></td>
                    <td><span className="badge badge-gray">{d.type}</span></td>
                    <td>{d.grantCount}</td>
                    <td>{money(d.totalGranted)}</td>
                    <td>{money(d.totalSpent)} <span className="badge">{d.utilizationPct}%</span></td>
                    <td>{d.projectCount}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-sm btn-primary" onClick={() => openReport(d, 'impact')}>
                          Impact
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => openReport(d, 'compliance')}>
                          Compliance
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function DonorReport({ donor, report, loading, onBack }) {
  return (
    <>
      <div className="page-header no-print">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={() => window.print()} disabled={!report}>
          🖨 Print / Save as PDF
        </button>
      </div>

      {loading ? <Spinner /> : !report ? <Empty /> : (
        <div className="card report-sheet">
          <div className="report-head">
            <div>
              <h1 style={{ margin: 0, color: 'var(--primary-dark)' }}>CSR Impact Report</h1>
              <div style={{ color: 'var(--text-muted)' }}>SCORE — NGO Management System</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13 }}>
              <div><strong>{report.donor.name}</strong></div>
              <div style={{ color: 'var(--text-muted)' }}>
                Generated {fmtDate(report.generatedAt)}
              </div>
              {report.period && (
                <div style={{ color: 'var(--text-muted)' }}>
                  Period: {fmtDate(report.period.from)} – {fmtDate(report.period.to)}
                </div>
              )}
            </div>
          </div>

          <div className="report-narrative">{report.narrative}</div>

          <div className="stat-grid" style={{ margin: '18px 0' }}>
            <Stat label="Total Committed" value={money(report.funds.totalGranted)} />
            <Stat label="Total Utilized" value={money(report.funds.totalSpent)} />
            <Stat label="Remaining" value={money(report.funds.remaining)} />
            <Stat label="Utilization" value={`${report.funds.utilizationPct}%`} />
          </div>

          <div className="stat-grid" style={{ marginBottom: 18 }}>
            <Stat label="Projects Funded" value={report.projects.count} />
            <Stat label="Villages Reached" value={report.projects.villages.length} />
            <Stat label="Est. Beneficiaries" value={report.reach.estimatedBeneficiaries} />
            <Stat label="Milestone Completion" value={`${report.projects.milestoneCompletionPct}%`} />
          </div>

          <Section title="Grants">
            {report.grants.length === 0 ? <Empty /> : (
              <table>
                <thead><tr><th>Title</th><th>Amount</th><th>Status</th><th>Period</th></tr></thead>
                <tbody>
                  {report.grants.map((g) => (
                    <tr key={g.id}>
                      <td>{g.title}</td>
                      <td>{money(g.amount)}</td>
                      <td><StatusBadge status={g.status} /></td>
                      <td style={{ fontSize: 12 }}>{fmtDate(g.start_date)} → {fmtDate(g.end_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {report.expenditureByCategory.length > 0 && (
            <Section title="Expenditure by Category">
              <table>
                <thead><tr><th>Category</th><th>Amount</th></tr></thead>
                <tbody>
                  {report.expenditureByCategory.map((c) => (
                    <tr key={c.category}><td>{c.category}</td><td>{money(c.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {report.reach.topSkills.length > 0 && (
            <Section title="Livelihood Skill Impact">
              <div>
                {report.reach.topSkills.map((s) => (
                  <span key={s.skill} className="chip">{s.skill} ({s.count})</span>
                ))}
              </div>
            </Section>
          )}

          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 18, fontStyle: 'italic' }}>
            {report.reach.note}
          </p>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: 22 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 style={{ borderBottom: '2px solid var(--primary)', paddingBottom: 6, marginBottom: 10 }}>{title}</h3>
      {children}
    </div>
  );
}

/* ---------------------- COMPLIANCE REPORT ------------------------- */
function ComplianceReport({ report, loading, onBack }) {
  return (
    <>
      <div className="page-header no-print">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={() => window.print()} disabled={!report}>
          🖨 Print / Save as PDF
        </button>
      </div>

      {loading ? <Spinner /> : !report ? <Empty /> : (
        <div className="card report-sheet">
          <div className="report-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={brandIcon} alt="SCORE" style={{ width: 46, height: 46, objectFit: 'contain' }} />
              <div>
                <h1 style={{ margin: 0, color: 'var(--primary-dark)' }}>CSR Fund Utilisation &amp; Compliance Report</h1>
                <div style={{ color: 'var(--text-muted)' }}>SCORE — NGO Management System</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13 }}>
              <div><strong>{report.donor.name}</strong></div>
              <div style={{ color: 'var(--text-muted)' }}>Generated {fmtDate(report.generatedAt)}</div>
              {report.period && (
                <div style={{ color: 'var(--text-muted)' }}>
                  Period: {fmtDate(report.period.from)} – {fmtDate(report.period.to)}
                </div>
              )}
            </div>
          </div>

          {/* Fund utilisation summary */}
          <Section title="Fund Utilisation Summary">
            <table>
              <tbody>
                <tr><td>Total Funds Received</td><td style={{ textAlign: 'right' }}><strong>{money(report.funds.totalReceived)}</strong></td></tr>
                <tr><td>Total Funds Utilised</td><td style={{ textAlign: 'right' }}>{money(report.funds.totalUtilised)}</td></tr>
                <tr><td>Unspent Balance</td><td style={{ textAlign: 'right' }}>{money(report.funds.balance)}</td></tr>
                <tr><td>Utilisation</td><td style={{ textAlign: 'right' }}><span className="badge">{report.funds.utilizationPct}%</span></td></tr>
              </tbody>
            </table>
          </Section>

          {/* Grants received */}
          <Section title="Grants Received">
            {report.grants.length === 0 ? <Empty /> : (
              <table>
                <thead><tr><th>Grant</th><th>Amount</th><th>Status</th><th>Period</th></tr></thead>
                <tbody>
                  {report.grants.map((g) => (
                    <tr key={g.id}>
                      <td>{g.title}</td>
                      <td>{money(g.amount)}</td>
                      <td><StatusBadge status={g.status} /></td>
                      <td style={{ fontSize: 12 }}>{fmtDate(g.start_date)} → {fmtDate(g.end_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Project-wise utilisation */}
          <Section title="Project-wise Fund Utilisation">
            {report.projects.length === 0 ? <Empty>No projects linked to this donor's grants.</Empty> : (
              <table>
                <thead><tr><th>Project</th><th>Village</th><th>Budget</th><th>Utilised</th><th>Beneficiaries</th><th>Status</th></tr></thead>
                <tbody>
                  {report.projects.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.village || '—'}</td>
                      <td>{money(p.budget)}</td>
                      <td>{money(p.spent)}</td>
                      <td>{p.beneficiaries}</td>
                      <td><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {report.expenditureByCategory.length > 0 && (
            <Section title="Expenditure by Category">
              <table>
                <thead><tr><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {report.expenditureByCategory.map((c) => (
                    <tr key={c.category}><td>{c.category}</td><td style={{ textAlign: 'right' }}>{money(c.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Declaration */}
          <Section title="Declaration">
            <p style={{ fontSize: 13, lineHeight: 1.7 }}>{report.declaration}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40 }}>
              <div style={{ borderTop: '1px solid var(--text)', paddingTop: 6, fontSize: 12, width: 200, textAlign: 'center' }}>
                Authorised Signatory
              </div>
              <div style={{ borderTop: '1px solid var(--text)', paddingTop: 6, fontSize: 12, width: 200, textAlign: 'center' }}>
                Date &amp; Seal
              </div>
            </div>
          </Section>
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import api, { apiError } from '../api/client';
import { Spinner, Alert, money } from '../components/ui';

const DONUT_COLORS = ['#2f80ed', '#1f7a5a', '#66c7b4', '#5b9bf0', '#8ad7c8', '#b8e8dd'];
const FUNNEL_COLORS = ['#2f80ed', '#4d93ef', '#3ea7cf', '#49bfa9', '#77d4c0'];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [dash, st] = await Promise.all([
          api.get('/reports/dashboard'),
          api.get('/beneficiaries/stats'),
        ]);
        setData(dash.data.data);
        setStats(st.data.data);
      } catch (err) {
        setError(apiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;

  const f = data.finance;
  const activePct = data.beneficiaries
    ? Math.round(((data.funnel.find((x) => x.stage === 'Active')?.value || 0) / data.beneficiaries) * 100)
    : 0;

  const topSkills = (stats.bySkill || []).slice(0, 6);
  const topVillages = (stats.byVillage || []).slice(0, 5);
  const skillTotal = topSkills.reduce((s, x) => s + x.count, 0) || 1;
  // actual number of skilled beneficiaries (people), for the donut centre — matches the funnel
  const skilledPeople = data.funnel.find((x) => x.stage === 'Skilled')?.value ?? skillTotal;

  return (
    <>
      {/* KPI ROW */}
      <div className="kpi-row">
        <Kpi
          label="Total Grants"
          value={money(f.total_grants)}
          sub="Committed CSR funds"
          badge={`${f.utilization_pct}% used`}
        />
        <Kpi
          label="Funds Utilized"
          value={money(f.total_spent)}
          sub={`${money(f.total_remaining)} remaining`}
          badge={`${f.utilization_pct}%`}
        />
        <Kpi
          label="Beneficiaries"
          value={data.beneficiaries}
          sub={`${activePct}% active`}
          badge={`${activePct}%`}
        />
        <Kpi
          label="Active Projects"
          value={data.active_projects}
          sub={`${data.donors} donors · ${data.active_employees} staff`}
          badge="live"
          blue
        />
      </div>

      {/* DONUT + FUNNEL */}
      <div className="dash-2col">
        <div className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title">🧩 Beneficiaries by Skill</div>
            <span className="dash-pill">Top {topSkills.length}</span>
          </div>
          <Donut items={topSkills} total={skillTotal} centerValue={skilledPeople} colorFn={(i) => DONUT_COLORS[i % DONUT_COLORS.length]} />
        </div>

        <div className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title">▽ Beneficiary Engagement Funnel</div>
            <span className="dash-pill">Live</span>
          </div>
          <div className="funnel">
            {data.funnel.map((s, i) => {
              const maxH = 150;
              const h = Math.max(26, Math.round((s.pct / 100) * maxH));
              return (
                <div className="funnel-stage" key={s.stage}>
                  <div className="fs-label">{s.stage}</div>
                  <div className="fs-value">{s.value}</div>
                  <div
                    className="funnel-bar"
                    style={{
                      height: h,
                      background: `linear-gradient(180deg, ${FUNNEL_COLORS[i]}, ${FUNNEL_COLORS[i]}cc)`,
                    }}
                  >
                    {s.pct}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* TOP 5 LISTS */}
      <div className="dash-2col" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title">🏘 Top Villages</div>
            <span className="dash-pill">By beneficiaries</span>
          </div>
          <RankList
            rows={topVillages.map((v) => ({ name: v.village, value: v.count }))}
            max={Math.max(1, ...topVillages.map((v) => v.count))}
            unit=""
          />
        </div>

        <div className="dash-card">
          <div className="dash-card-head">
            <div className="dash-card-title">🧵 Top Skills</div>
            <span className="dash-pill">By beneficiaries</span>
          </div>
          <RankList
            rows={topSkills.slice(0, 5).map((s) => ({ name: s.skill, value: s.count }))}
            max={Math.max(1, ...topSkills.map((s) => s.count))}
            unit=""
          />
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, badge, blue }) {
  return (
    <div className="kpi-card">
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        <span className="kpi-dots">⋮</span>
      </div>
      <div className="kpi-divider" />
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">
        <span className="kpi-sub">{sub}</span>
        <span className={`kpi-badge ${blue ? 'blue' : ''}`}>↑ {badge}</span>
      </div>
    </div>
  );
}

function Donut({ items, total, centerValue, colorFn }) {
  if (!items.length) return <div className="empty">No skill data yet</div>;

  // Build conic-gradient stops
  let acc = 0;
  const stops = items
    .map((it, i) => {
      const start = (acc / total) * 360;
      acc += it.count;
      const end = (acc / total) * 360;
      return `${colorFn(i)} ${start}deg ${end}deg`;
    })
    .join(', ');

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${stops})` }}>
        <div className="donut-center">
          <span className="num">{centerValue ?? total}</span>
          <span className="cap">skilled</span>
        </div>
      </div>
      <div className="donut-legend">
        {items.map((it, i) => (
          <div className="legend-item" key={it.skill}>
            <span className="legend-dot" style={{ background: colorFn(i) }} />
            <span style={{ textTransform: 'capitalize' }}>{it.skill}</span>
            <span className="lv">{it.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankList({ rows, max, unit }) {
  if (!rows.length) return <div className="empty">No data yet</div>;
  return (
    <div className="rank-list">
      {rows.map((r, i) => (
        <div className="rank-row" key={r.name || i}>
          <span className="rank-idx">{i + 1}</span>
          <span className="rank-name" style={{ textTransform: 'capitalize' }}>{r.name || 'Unknown'}</span>
          <div className="rank-bar-wrap">
            <div className="rank-bar" style={{ width: `${Math.max(28, (r.value / max) * 100)}%` }}>
              {unit}{r.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


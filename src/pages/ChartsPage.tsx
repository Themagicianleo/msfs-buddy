import { useState } from 'react';
import { Icon } from '../components/Icon';
import type { FlightPlan } from '../lib/simbrief';
import { usePersistent, type Settings } from '../lib/storage';

// ChartFox (https://chartfox.org) is free and needs a (free) account. Its site
// does not allow being embedded in other pages, so charts open in their own
// tab or in a tablet-sized pop-out window you can keep next to the sim.

const chartfoxUrl = (icao: string) => `https://chartfox.org/${icao.toUpperCase()}`;

function openPopout(icao: string) {
  const w = Math.min(1100, screen.availWidth);
  const h = Math.min(900, screen.availHeight);
  window.open(chartfoxUrl(icao), `chartfox-${icao}`, `popup=yes,width=${w},height=${h},left=${screen.availWidth - w},top=0`);
}

interface ChartAirport {
  icao: string;
  name: string;
  role: string;
  hints: string[];
}

function procedures(plan: FlightPlan) {
  const fixes = plan.navlog.filter((f) => f.isSidStar && f.via);
  const sid = fixes.find((f) => f.stage === 'CLB')?.via ?? '';
  const star = [...fixes].reverse().find((f) => f.stage === 'DSC')?.via ?? '';
  return { sid, star };
}

export function ChartsPage({ plan }: { plan: FlightPlan | null; settings: Settings }) {
  const [recent, setRecent] = usePersistent<string[]>('charts.recent', []);
  const [input, setInput] = useState('');

  const airports: ChartAirport[] = [];
  if (plan) {
    const { sid, star } = procedures(plan);
    airports.push({
      icao: plan.origin.icao,
      name: plan.origin.name,
      role: 'DEP',
      hints: [plan.origin.runway && `RWY ${plan.origin.runway}`, sid && `SID ${sid}`, 'Ground / parking chart'].filter(Boolean) as string[],
    });
    airports.push({
      icao: plan.destination.icao,
      name: plan.destination.name,
      role: 'ARR',
      hints: [star && `STAR ${star}`, plan.destination.runway && `Approach RWY ${plan.destination.runway}`, 'Ground / parking chart'].filter(Boolean) as string[],
    });
    plan.alternates.forEach((a) =>
      airports.push({ icao: a.icao, name: a.name, role: 'ALTN', hints: [a.runway && `Approach RWY ${a.runway}`].filter(Boolean) as string[] }),
    );
  }

  const open = (icao: string, popout: boolean) => {
    const id = icao.toUpperCase();
    setRecent([id, ...recent.filter((r) => r !== id)].slice(0, 8));
    if (popout) openPopout(id);
    else window.open(chartfoxUrl(id), '_blank', 'noopener');
  };

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const id = input.trim().toUpperCase();
    if (/^[A-Z0-9]{3,4}$/.test(id)) open(id, false);
    setInput('');
  };

  return (
    <div className="page">
      <div className="page-toolbar">
        <h2>Charts</h2>
        <span className="pill">ChartFox</span>
        <form className="search push-right" onSubmit={search}>
          <Icon name="search" size={18} />
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Any airport ICAO" maxLength={4} />
          <button className="btn btn-small" type="submit">Open</button>
        </form>
      </div>

      {!plan && <div className="empty">Load a flight plan to get quick links for your departure, arrival and alternate — or search any airport above.</div>}

      <div className="grid grid-3">
        {airports.map((a) => (
          <section key={a.role + a.icao} className="panel chart-card">
            <div className="chart-head">
              <span className={`role role-${a.role.toLowerCase()}`}>{a.role}</span>
              <span className="wx-icao">{a.icao}</span>
            </div>
            <div className="muted">{a.name}</div>
            {a.hints.length > 0 && (
              <ul className="hints">
                {a.hints.map((h) => <li key={h}>{h}</li>)}
              </ul>
            )}
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => open(a.icao, false)}>
                Open charts <Icon name="external" size={16} />
              </button>
              <button className="btn" onClick={() => open(a.icao, true)}>Pop-out window</button>
            </div>
          </section>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="recent">
          <span className="muted small">Recent:</span>
          {recent.map((r) => (
            <button key={r} className="btn btn-small" onClick={() => open(r, false)}>{r}</button>
          ))}
        </div>
      )}

      <p className="muted small note">
        Charts are provided by ChartFox and open on chartfox.org (sign in with your free ChartFox account the first time).
        ChartFox doesn't allow its viewer to be embedded inside other sites, so use the pop-out window to keep charts beside the sim
        or on a second screen. Not for real-world navigation.
      </p>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { FlightPlan } from '../lib/simbrief';
import type { Settings } from '../lib/storage';
import type { LoadState } from '../App';
import { Icon } from './Icon';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Navigation bar above each page: large title, flight, clocks and refresh. */
export function TopBar({ title, plan, state, settings, onRefresh }: {
  title: string;
  plan: FlightPlan | null;
  state: LoadState;
  settings: Settings;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const utc = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  const local = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !settings.clock24 });

  return (
    <header className="navbar">
      <div className="navbar-title">
        <h1>{title}</h1>
        {plan && (
          <div className="navbar-subtitle">
            {plan.callsign || plan.flightNumber} · {plan.origin.icao} – {plan.destination.icao} · {plan.aircraft.icao}
          </div>
        )}
      </div>
      <div className="navbar-trailing">
        {state.status === 'error' && <span className="badge badge-red" title={state.message}>SimBrief error</span>}
        <div className="clock">
          <div className="clock-utc">{utc}</div>
          <div className="clock-caption">UTC{settings.showLocalTime && ` · Local ${local}`}</div>
        </div>
        <button className="circle-btn" onClick={onRefresh} title="Fetch latest SimBrief OFP" disabled={state.status === 'loading'}>
          <span className={state.status === 'loading' ? 'spin' : ''}><Icon name="refresh" size={19} /></span>
        </button>
      </div>
    </header>
  );
}

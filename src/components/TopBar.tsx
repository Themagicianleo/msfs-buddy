import { useEffect, useState } from 'react';
import type { FlightPlan } from '../lib/simbrief';
import type { Settings } from '../lib/storage';
import type { LoadState } from '../App';
import { Icon } from './Icon';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function TopBar({ plan, state, settings, onRefresh }: {
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
    <header className="topbar">
      <div className="topbar-left">
        <span className="brand">EFB</span>
        {plan ? (
          <span className="topbar-flight">
            <b>{plan.callsign || plan.flightNumber}</b>
            <span className="muted">
              {plan.origin.icao} → {plan.destination.icao}
            </span>
            <span className="muted">{plan.aircraft.icao} {plan.aircraft.reg}</span>
          </span>
        ) : (
          <span className="muted">No flight loaded</span>
        )}
      </div>
      <div className="topbar-clock">
        <span className="clock-utc">{utc}<small>Z</small></span>
        {settings.showLocalTime && <span className="clock-local">LCL {local}</span>}
      </div>
      <div className="topbar-right">
        {state.status === 'error' && <span className="pill pill-red" title={state.message}>SimBrief error</span>}
        {state.status === 'loading' && <span className="pill">Loading…</span>}
        {plan?.airac && <span className="pill">AIRAC {plan.airac}</span>}
        <button className="icon-btn" onClick={onRefresh} title="Fetch latest SimBrief OFP" disabled={state.status === 'loading'}>
          <span className={state.status === 'loading' ? 'spin' : ''}><Icon name="refresh" size={20} /></span>
        </button>
      </div>
    </header>
  );
}

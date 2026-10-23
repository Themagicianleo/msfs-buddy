import { useEffect, useState } from 'react';
import type { FlightPlan } from '../lib/simbrief';
import type { Settings } from '../lib/storage';
import type { LoadState } from '../App';
import { Icon } from './Icon';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/**
 * iOS-style navigation bar: a transparent bar pinned to the top with glass
 * controls, and a large title that scrolls away. Once scrolled, the title
 * reappears inline and the bar gains a soft scroll-edge blur.
 */
export function TopBar({ title, scrolled, plan, state, settings, onRefresh }: {
  title: string;
  scrolled: boolean;
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
    <>
      <header className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="navbar-inline-title">{title}</div>
        <div className="navbar-trailing">
          {state.status === 'error' && <span className="badge badge-red" title={state.message}>SimBrief error</span>}
          <div className="glass toolbar-group">
            <div className="clock">
              <span className="clock-utc">{utc}</span>
              <span className="clock-caption">UTC{settings.showLocalTime && ` · ${local}`}</span>
            </div>
            <span className="toolbar-divider" />
            <button className="toolbar-btn" onClick={onRefresh} title="Fetch latest SimBrief OFP" disabled={state.status === 'loading'}>
              <span className={state.status === 'loading' ? 'spin' : ''}><Icon name="refresh" size={19} /></span>
            </button>
          </div>
        </div>
      </header>
      <div className="large-title">
        <h1>{title}</h1>
        {plan && (
          <div className="navbar-subtitle">
            {plan.callsign || plan.flightNumber} · {plan.origin.icao} – {plan.destination.icao} · {plan.aircraft.icao}
          </div>
        )}
      </div>
    </>
  );
}

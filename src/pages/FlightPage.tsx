import type { LoadState } from '../App';
import type { Page } from '../components/nav';
import { CatBadge, CopyButton, Field, Panel } from '../components/ui';
import { Icon } from '../components/Icon';
import { RouteMap } from '../components/RouteMap';
import { fmtAltitude, fmtDuration, fmtNum, fmtZulu } from '../lib/format';
import { parseMetar } from '../lib/metar';
import { openAtcCode, openAtcLink } from '../lib/openatc';
import { simbriefDispatchUrl, type Airport, type FlightPlan } from '../lib/simbrief';
import type { Settings } from '../lib/storage';

function AirportBlock({ a, time, timeLabel, end }: { a: Airport; time: number | null; timeLabel: string; end?: boolean }) {
  const m = a.metar ? parseMetar(a.metar) : null;
  return (
    <div className={`apt-block ${end ? 'end' : ''}`}>
      <div className="apt-icao">{a.icao}</div>
      <div className="apt-name">{a.name}</div>
      <div className="apt-meta">
        <span>Runway {a.runway || '—'}</span>
        {m && <CatBadge cat={m.category} />}
      </div>
      <div className="apt-time">
        <span className="muted">{timeLabel}</span> {fmtZulu(time)}
      </div>
    </div>
  );
}

function hoursMinutes(sec: number | null) {
  if (sec === null) return '—';
  const m = Math.round(sec / 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function FlightPage({ plan, settings, theme, state, onRefresh, onDemo, onGoto }: {
  plan: FlightPlan | null;
  settings: Settings;
  theme: 'light' | 'dark';
  state: LoadState;
  onRefresh: () => void;
  onDemo: () => void;
  onGoto: (p: Page) => void;
}) {
  if (!plan) {
    return (
      <div className="welcome">
        <h1>Welcome aboard</h1>
        <p className="muted">
          This EFB pulls your latest flight from SimBrief and shows the OFP, navlog, route map, live METAR/TAF and ChartFox
          charts for your airports.
        </p>
        {state.status === 'error' && <div className="alert">{state.message}</div>}
        <div className="btn-row">
          {settings.simbriefUser ? (
            <button className="btn btn-primary" onClick={onRefresh} disabled={state.status === 'loading'}>
              {state.status === 'loading' ? 'Loading…' : `Import OFP for ${settings.simbriefUser}`}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => onGoto('settings')}>Set SimBrief username</button>
          )}
          <button className="btn" onClick={onDemo}>Try a demo flight</button>
          <a className="btn" href={simbriefDispatchUrl()} target="_blank" rel="noreferrer">Plan on SimBrief</a>
        </div>
      </div>
    );
  }

  const t = plan.times;
  const u = plan.units.toUpperCase();
  const altn = plan.alternates[0];
  const transAlt = plan.origin.transAlt ?? 18000;
  const narrow = window.matchMedia('(max-width: 760px)').matches;

  return (
    <div className="page">
      {/* Route map behind a floating glass boarding pass, like a place card in Maps. */}
      <div className="hero">
        <RouteMap plan={plan} theme={theme} interactive={false} padding={narrow ? [30, 40, 430, 40] : [40, 60, 300, 60]} className="hero-map" />
      <div className="glass boarding">
        <div className="boarding-top">
          <span className="boarding-flight">{plan.callsign || plan.flightNumber}</span>
          <span className="muted">{[plan.aircraft.name || plan.aircraft.icao, plan.aircraft.reg].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="boarding-route">
          <AirportBlock a={plan.origin} time={t.schedOut} timeLabel="Departs" />
          <div className="boarding-mid">
            <div className="boarding-line">
              <span />
              <span className="boarding-plane"><Icon name="flight" size={22} /></span>
              <span />
            </div>
            <div className="boarding-duration">{hoursMinutes(t.ete)}</div>
          </div>
          <AirportBlock a={plan.destination} time={t.schedIn} timeLabel="Arrives" end />
        </div>
        <div className="boarding-meta">
          <Field label="Distance" value={fmtNum(plan.routeDistance)} unit="nm" />
          <Field label="Cruise" value={fmtAltitude(plan.cruiseAlt, transAlt)} />
          <Field label="Block" value={fmtDuration(t.block)} />
          <Field label="Alternate" value={altn?.icao || '—'} />
        </div>
      </div>
      </div>

      <div className="grid grid-3">
        <Panel title="Times (UTC)">
          <div className="fields fields-2">
            <Field label="Out (block)" value={fmtZulu(t.estOut)} />
            <Field label="Off (takeoff)" value={fmtZulu(t.estOff)} />
            <Field label="On (landing)" value={fmtZulu(t.estOn)} />
            <Field label="In (block)" value={fmtZulu(t.estIn)} />
            <Field label="Flight time" value={fmtDuration(t.ete)} accent />
            <Field label="Block time" value={fmtDuration(t.block)} />
          </div>
        </Panel>

        <Panel title="Fuel" right={<button className="link" onClick={() => onGoto('loadsheet')}>Details ›</button>}>
          <div className="fields fields-2">
            <Field label="Block fuel" value={fmtNum(plan.fuel.planRamp)} unit={u} accent />
            <Field label="Trip" value={fmtNum(plan.fuel.trip)} unit={u} />
            <Field label="Takeoff fuel" value={fmtNum(plan.fuel.planTakeoff)} unit={u} />
            <Field label="Landing fuel" value={fmtNum(plan.fuel.planLanding)} unit={u} />
            <Field label="Min T/O fuel" value={fmtNum(plan.fuel.minTakeoff)} unit={u} />
            <Field label="Reserve" value={fmtNum(plan.fuel.reserve)} unit={u} />
          </div>
        </Panel>

        <Panel title="Weights" right={<button className="link" onClick={() => onGoto('loadsheet')}>Details ›</button>}>
          <div className="fields fields-2">
            <Field label="ZFW" value={fmtNum(plan.weights.zfw)} unit={u} accent />
            <Field label="TOW" value={fmtNum(plan.weights.tow)} unit={u} />
            <Field label="LW" value={fmtNum(plan.weights.ldw)} unit={u} />
            <Field label="Payload" value={fmtNum(plan.weights.payload)} unit={u} />
            <Field label="Passengers" value={fmtNum(plan.weights.paxCount ?? plan.passengers)} />
            <Field label="Cargo" value={fmtNum(plan.weights.cargo)} unit={u} />
          </div>
        </Panel>
      </div>

      <div className="grid grid-2">
        <Panel title="Flight">
          <div className="fields fields-3">
            <Field label="Aircraft" value={`${plan.aircraft.icao}`} />
            <Field label="Registration" value={plan.aircraft.reg || '—'} />
            <Field label="SELCAL" value={plan.aircraft.selcal || '—'} />
            <Field label="Cost index" value={plan.costIndex || '—'} accent />
            <Field label="Initial alt" value={fmtAltitude(plan.cruiseAlt, transAlt)} />
            <Field label="Avg wind" value={plan.avgWind || '—'} />
            <Field label="Wind comp" value={plan.avgWindComp === null ? '—' : `${plan.avgWindComp < 0 ? 'HD' : 'TL'} ${Math.abs(plan.avgWindComp)}`} />
            <Field label="Alternate" value={altn?.icao || '—'} />
            <Field label="Air distance" value={fmtNum(plan.airDistance)} unit="NM" />
          </div>
        </Panel>
        <Panel title="Route" right={<button className="link" onClick={() => onGoto('map')}>Map ›</button>}>
          <div className="route-box mono">
            <b>{plan.origin.icao}/{plan.origin.runway}</b> {plan.route} <b>{plan.destination.icao}/{plan.destination.runway}</b>
          </div>
          {plan.remarks.length > 0 && <div className="muted small">{plan.remarks.join(' · ')}</div>}
        </Panel>
      </div>

      <div className="quick-row">
        <button className="btn" onClick={() => onGoto('weather')}>Weather</button>
        <button className="btn" onClick={() => onGoto('charts')}>Charts (ChartFox)</button>
        <button className="btn" onClick={() => onGoto('ofp')}>Full OFP</button>
        {openAtcLink(settings.openAtcUrl, plan) ? (
          <a className="btn" href={openAtcLink(settings.openAtcUrl, plan)!} target="_blank" rel="noreferrer">Open in OpenATC</a>
        ) : (
          <CopyButton text={openAtcCode(plan)} label="Copy for OpenATC" />
        )}
        {plan.pdfUrl && <a className="btn" href={plan.pdfUrl} target="_blank" rel="noreferrer">OFP PDF</a>}
        <a className="btn" href={simbriefDispatchUrl(plan)} target="_blank" rel="noreferrer">New flight on SimBrief</a>
        <span className="muted small push-right">
          OFP generated {plan.generatedAt ? new Date(plan.generatedAt * 1000).toUTCString().replace(' GMT', 'Z') : '—'}
        </span>
      </div>
    </div>
  );
}

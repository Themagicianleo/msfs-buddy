import type { LoadState } from '../App';
import type { Page } from '../components/nav';
import { CatBadge, CopyButton, Field, Panel, WeightBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { RouteMap } from '../components/RouteMap';
import { TerrainSection } from '../components/TerrainSection';
import { fmtAltitude, fmtDuration, fmtNum, fmtZulu, nmToKm } from '../lib/format';

/** Unit text for a distance shown in nm: "nm · 617 km". */
const kmUnit = (nm: number | null) => (nm === null ? 'nm' : `nm · ${fmtNum(nmToKm(nm))} km`);
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

function StatTile({ label, value, unit, sub, accent, warn }: { label: string; value: string; unit?: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`stat-tile ${accent ? 'accent' : ''} ${warn ? 'warn' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}{unit && <small> {unit}</small>}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** OUT → OFF → ON → IN, with taxi and airborne times between them. */
function Timeline({ t }: { t: FlightPlan['times'] }) {
  const span = (a: number | null, b: number | null) => (a && b ? fmtDuration(b - a) : null);
  const points: [string, string, number | null][] = [
    ['OUT', 'Off blocks', t.estOut],
    ['OFF', 'Takeoff', t.estOff],
    ['ON', 'Landing', t.estOn],
    ['IN', 'On blocks', t.estIn],
  ];
  const legs = [
    ['Taxi', span(t.estOut, t.estOff)],
    ['Airborne', span(t.estOff, t.estOn) ?? fmtDuration(t.ete)],
    ['Taxi', span(t.estOn, t.estIn)],
  ];
  return (
    <div className="timeline">
      {points.map(([code, label, time], i) => (
        <div key={code} className="timeline-step">
          <div className={`timeline-dot ${i === 1 || i === 2 ? 'air' : ''}`} />
          <div className="timeline-code">{code}</div>
          <div className="timeline-time">{fmtZulu(time)}</div>
          <div className="timeline-label">{label}</div>
          {i < 3 && <div className={`timeline-leg ${i === 1 ? 'air' : ''}`}><span>{legs[i][0]} {legs[i][1] ?? ''}</span></div>}
        </div>
      ))}
    </div>
  );
}

const FUEL_PARTS: [keyof FlightPlan['fuel'], string, string][] = [
  ['trip', 'Trip', 'var(--blue)'],
  ['contingency', 'Contingency', '#5ac8fa'],
  ['alternate', 'Alternate', 'var(--orange)'],
  ['reserve', 'Final reserve', 'var(--purple)'],
  ['extra', 'Extra', 'var(--green)'],
  ['taxi', 'Taxi', 'var(--faint)'],
];

/** How the block fuel is made up, as one stacked bar with a legend. */
function FuelBar({ plan }: { plan: FlightPlan }) {
  const parts = FUEL_PARTS.map(([k, label, color]) => ({ label, color, v: plan.fuel[k] ?? 0 })).filter((p) => p.v > 0);
  const total = parts.reduce((a, p) => a + p.v, 0) || 1;
  const u = plan.units.toUpperCase();
  return (
    <div className="fuel-bar">
      <div className="fuel-track">
        {parts.map((p) => <div key={p.label} style={{ width: `${(p.v / total) * 100}%`, background: p.color }} title={`${p.label} ${fmtNum(p.v)} ${u}`} />)}
      </div>
      <div className="fuel-legend">
        {parts.map((p) => (
          <div key={p.label}><i style={{ background: p.color }} />{p.label}<b>{fmtNum(p.v)}</b></div>
        ))}
        <div className="fuel-total">Block fuel<b>{fmtNum(plan.fuel.planRamp)} {u}</b></div>
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
          <Field label="Distance" value={fmtNum(plan.routeDistance)} unit={kmUnit(plan.routeDistance)} />
          <Field label="Cruise" value={fmtAltitude(plan.cruiseAlt, transAlt)} />
          <Field label="Block" value={fmtDuration(t.block)} />
          <Field label="Alternate" value={altn?.icao || '—'} />
        </div>
      </div>
      </div>

      {/* The numbers checked first, as big glass tiles. */}
      <div className="stat-tiles">
        <StatTile label="Block fuel" value={fmtNum(plan.fuel.planRamp)} unit={u} sub={`Trip ${fmtNum(plan.fuel.trip)} ${u}`} accent />
        <StatTile label="Flight time" value={fmtDuration(t.ete)} sub={`Block ${fmtDuration(t.block)}`} />
        <StatTile label="Passengers" value={fmtNum(plan.weights.paxCount ?? plan.passengers)} sub={`Payload ${fmtNum(plan.weights.payload)} ${u}`} />
        <StatTile
          label="Takeoff weight"
          value={fmtNum(plan.weights.tow)}
          unit={u}
          sub={plan.weights.tow !== null && plan.weights.maxTow ? `${Math.round((plan.weights.tow / plan.weights.maxTow) * 100)}% of max` : ''}
          warn={plan.weights.tow !== null && plan.weights.maxTow !== null && plan.weights.tow > plan.weights.maxTow}
        />
      </div>

      <Panel title="Times (UTC)">
        <Timeline t={t} />
      </Panel>

      <div className="grid grid-2">
        <Panel title="Fuel" right={<button className="link" onClick={() => onGoto('loadsheet')}>Details ›</button>}>
          <FuelBar plan={plan} />
          <div className="fields fields-3">
            <Field label="Takeoff fuel" value={fmtNum(plan.fuel.planTakeoff)} unit={u} />
            <Field label="Landing fuel" value={fmtNum(plan.fuel.planLanding)} unit={u} />
            <Field label="Min T/O fuel" value={fmtNum(plan.fuel.minTakeoff)} unit={u} />
          </div>
        </Panel>

        <Panel title="Weights" right={<button className="link" onClick={() => onGoto('loadsheet')}>Details ›</button>}>
          <WeightBar label="Zero fuel weight" value={plan.weights.zfw} max={plan.weights.maxZfw} unit={u} />
          <WeightBar label="Takeoff weight" value={plan.weights.tow} max={plan.weights.maxTow} unit={u} />
          <WeightBar label="Landing weight" value={plan.weights.ldw} max={plan.weights.maxLdw} unit={u} />
          <div className="fields fields-3">
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
            <Field label="Air distance" value={fmtNum(plan.airDistance)} unit={kmUnit(plan.airDistance)} />
          </div>
        </Panel>
        <Panel title="Route" right={<button className="link" onClick={() => onGoto('map')}>Map ›</button>}>
          <div className="route-box mono">
            <b>{plan.origin.icao}/{plan.origin.runway}</b> {plan.route} <b>{plan.destination.icao}/{plan.destination.runway}</b>
          </div>
          {plan.remarks.length > 0 && <div className="muted small">{plan.remarks.join(' · ')}</div>}
        </Panel>
      </div>

      <TerrainSection plan={plan} />

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

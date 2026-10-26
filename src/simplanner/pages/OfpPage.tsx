import { useState } from 'react';
import { CopyButton, EstimateBanner, Kv, Section, Warnings } from '../components/ui';
import { buildLnmpln, buildPln, type ExportFlight } from '../lib/exports';
import { encodeShare, download } from '../lib/store';
import { makeSharedFlight, makeSnapshot } from '../lib/snapshot';
import { fmtHm, fmtWeight } from '../lib/units';
import { useApp } from '../state';
import type { Airport } from '../lib/airports';
import type { RoutePoint } from '../lib/route';
import { BriefingPage, WeatherSection } from './BriefingPage';

export function exportFlight(dep: Airport, arr: Airport, points: RoutePoint[], cruiseFl: number): ExportFlight {
  const ap = (a: Airport): ExportFlight['dep'] => ({ ident: a.icao, name: a.name, lat: a.lat, lon: a.lon, type: 'airport', source: a.source, via: '', elevationFt: a.elevationFt });
  return { dep: ap(dep), arr: ap(arr), enroute: points.slice(1, -1), cruiseAltFt: cruiseFl * 100, title: `${dep.icao} to ${arr.icao}` };
}

const TABS = [
  ['summary', 'Summary'],
  ['navlog', 'Navlog'],
  ['fuel', 'Fuel & weights'],
  ['weather', 'Weather'],
  ['fmc', 'FMC'],
  ['print', 'Print briefing'],
] as const;
type Tab = (typeof TABS)[number][0];

/** The generated flight, like SimBrief's OFP. */
export function OfpPage() {
  const app = useApp();
  const { inputs, derived } = app;
  const { profile, plan, route, dep, arr, altn, units: u } = derived;
  const [tab, setTab] = useState<Tab>('summary');

  if (!dep || !arr) {
    return (
      <Section title="No flight yet">
        <p>Fill in the flight on the Dispatch page and press <b>Generate flight</b>.</p>
        <a className="btn btn-primary" href="#dispatch">Go to Dispatch</a>
      </Section>
    );
  }

  const fullRoute = [inputs.dep, route.fmcRoute, inputs.arr].filter(Boolean).join(' ');

  return (
    <div>
      <div className="ofp-head">
        <div className="ofp-od">
          <div>
            <div className="ofp-icao">{dep.icao}</div>
            <div className="muted">{dep.name}</div>
            <div>RWY <b>{inputs.depRwy || '—'}</b></div>
          </div>
          <div className="ofp-mid">
            <div className="muted">{inputs.flightNo || 'Flight'} · {profile.name}{inputs.variant ? ` (${inputs.variant})` : ''}</div>
            <div className="ofp-line">✈</div>
            <div>{fmtWeight(plan.distanceNm)} nm · {fmtHm(plan.tripTimeMin)} · FL{inputs.cruiseFl}</div>
          </div>
          <div className="right">
            <div className="ofp-icao">{arr.icao}</div>
            <div className="muted">{arr.name}</div>
            <div>RWY <b>{inputs.arrRwy || '—'}</b></div>
          </div>
        </div>
        <div className="row">
          <a className="btn" href="#dispatch">Edit flight</a>
          <span className="muted">Alternate <b>{altn ? `${altn.icao} ${altn.name}` : inputs.altn || 'none'}</b></span>
        </div>
      </div>

      <EstimateBanner />
      {!profile.verified && <div className="banner banner-warn">{profile.name}: aircraft values are PLACEHOLDERS. Check them on the Aircraft page.</div>}
      {plan.exceeded.length > 0 && (
        <div className="banner banner-danger">
          {plan.exceeded.map((l) => <div key={l.name}>LIMIT EXCEEDED: {l.name} {fmtWeight(l.value)} {l.unit} &gt; {fmtWeight(l.limit)} {l.unit} (over by {fmtWeight(-l.margin)})</div>)}
        </div>
      )}

      <div className="tabs-bar no-print">
        {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>

      {tab === 'summary' && (
        <>
          <div className="tiles">
            <Tile k="Block fuel" v={fmtWeight(plan.fuel.block)} u={u} bad={!limitOk('Block fuel')} />
            <Tile k="Trip fuel" v={fmtWeight(plan.fuel.trip)} u={u} />
            <Tile k="ZFW" v={fmtWeight(plan.weights.zfw)} u={u} bad={!limitOk('Zero fuel weight')} />
            <Tile k="TOW" v={fmtWeight(plan.weights.tow)} u={u} bad={!limitOk('Takeoff weight')} />
            <Tile k="LW" v={fmtWeight(plan.weights.lw)} u={u} bad={!limitOk('Landing weight')} />
            <Tile k="Pax / cargo" v={`${inputs.paxCount}`} u={`/ ${fmtWeight(inputs.cargo)} ${u}`} />
          </div>
          <Section title="Route" actions={<CopyButton text={fullRoute} label="Copy route" />}>
            <p className="route-text">{fullRoute}</p>
            {inputs.routeNote && <p className="muted" style={{ marginBottom: 0 }}>{inputs.routeNote}</p>}
            {inputs.runwayNotes && <p className="muted" style={{ marginBottom: 0 }}>Runways: {inputs.runwayNotes}</p>}
          </Section>
          <Section title="Take it to the sim">
            <div className="row">
              <button className="btn" onClick={() => download(`${dep.icao}${arr.icao}.pln`, buildPln(exportFlight(dep, arr, route.points, inputs.cruiseFl)), 'application/xml')}>MSFS .pln</button>
              <button className="btn" onClick={() => download(`${dep.icao}${arr.icao}.lnmpln`, buildLnmpln(exportFlight(dep, arr, route.points, inputs.cruiseFl)), 'application/xml')}>Little Navmap</button>
              <CopyButton text={`${location.origin}${location.pathname}#import=${encodeShare(makeSharedFlight(inputs, route, app.store.airports, app.store.waypoints, [dep, arr, altn]))}`} label="Copy share link" />
              <CopyButton text={new URL(`kiosk.html#d=${encodeShare(makeSnapshot(inputs, plan, route, profile.name, derived.fmcText))}`, location.href).toString()} label="Copy kiosk link" />
              <button className="btn" onClick={() => setTab('print')}>Print briefing</button>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              Share link opens this flight in SimPlanner on another device. Kiosk link is a big-text, read-only briefing for a phone, tablet or a sim EFB browser (experimental).
            </p>
          </Section>
          <Section title="Warnings">
            <Warnings items={[...plan.warnings, ...route.warnings]} />
            {!plan.warnings.length && !route.warnings.length && <p className="ok">No warnings.</p>}
          </Section>
        </>
      )}

      {tab === 'navlog' && (
        <Section title="Navlog">
          <LegsTable />
        </Section>
      )}

      {tab === 'fuel' && (
        <div className="plan-layout">
          <Section title={`Fuel (${u})`}>
            <Kv
              rows={[
                ['Taxi', fmtWeight(plan.fuel.taxi)],
                [`Trip (${fmtHm(plan.tripTimeMin)})`, fmtWeight(plan.fuel.trip)],
                [`Contingency (${inputs.contingencyPct}%)`, fmtWeight(plan.fuel.contingency)],
                [`Alternate ${altn ? altn.icao + ' (' + fmtWeight(plan.alternateDistanceNm) + ' nm)' : ''}`, fmtWeight(plan.fuel.alternate)],
                [`Final reserve (${inputs.reserveMin} min)`, fmtWeight(plan.fuel.reserve)],
                ['Extra', fmtWeight(plan.fuel.extra)],
                ['BLOCK FUEL', <b key="b">{fmtWeight(plan.fuel.block)}</b>],
                ['Takeoff fuel', fmtWeight(plan.fuel.takeoff)],
                ['Landing fuel', fmtWeight(plan.fuel.landing)],
              ]}
            />
          </Section>
          <Section title={`Weights (${u})`}>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Item</th><th className="num">Planned</th><th className="num">Limit</th><th className="num">Margin</th></tr></thead>
                <tbody>
                  {plan.limits.map((l) => (
                    <tr key={l.name} className={l.ok ? '' : 'bad'}>
                      <td>{l.ok ? '' : '✖ '}{l.name}</td>
                      <td className="num">{fmtWeight(l.value)} {l.unit}</td>
                      <td className="num">{fmtWeight(l.limit)}</td>
                      <td className="num">{fmtWeight(l.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Kv rows={[['OEW (profile)', fmtWeight(plan.weights.oew)], ['Payload', fmtWeight(plan.weights.payload)], ['Ramp weight', fmtWeight(plan.weights.ramp)]]} />
          </Section>
          <Section title="How these numbers were worked out">
            <ol className="formulas">{plan.formulas.map((f, i) => <li key={i}>{f}</li>)}</ol>
            <p className="muted">Tune the inputs to these formulas in the aircraft profile (Aircraft page).</p>
          </Section>
        </div>
      )}

      {tab === 'weather' && <WeatherSection />}

      {tab === 'fmc' && (
        <Section title={`${profile.name}: what to key in`} actions={<CopyButton text={derived.fmcText} label="Copy sheet" />}>
          <div className="banner banner-warn">Every page name and button marked [UNVERIFIED] has not been checked against the aircraft manual. Edit the template on the Aircraft page once you've confirmed it.</div>
          <pre className="sheet">{derived.fmcText}</pre>
        </Section>
      )}

      {tab === 'print' && <BriefingPage />}
    </div>
  );

  function limitOk(name: string) {
    return plan.limits.find((l) => l.name === name)?.ok ?? true;
  }
}

function Tile({ k, v, u, bad }: { k: string; v: string; u?: string; bad?: boolean }) {
  return (
    <div className={`tile ${bad ? 'bad' : ''}`}>
      <div className="k">{k}</div>
      <div className="v">{v}{u && <span className="u">{u}</span>}</div>
    </div>
  );
}

export function LegsTable() {
  const { route } = useApp().derived;
  if (!route.legs.length) return <p className="muted">No legs yet.</p>;
  let cum = 0;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>To</th>
            <th>Type</th>
            <th>Via</th>
            <th className="num">Course °T</th>
            <th className="num">Leg nm</th>
            <th className="num">Total nm</th>
          </tr>
        </thead>
        <tbody>
          {route.legs.map((l, i) => {
            cum += l.distanceNm;
            return (
              <tr key={i}>
                <td className="mono">{l.to.ident}<div className="muted small-text">{l.to.name}</div></td>
                <td>{l.to.type.toUpperCase()}</td>
                <td className="mono">{l.via}</td>
                <td className="num">{String(Math.round(l.courseTrue) % 360).padStart(3, '0')}</td>
                <td className="num">{Math.round(l.distanceNm)}</td>
                <td className="num">{Math.round(cum)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">Courses are TRUE great-circle initial courses (no magnetic variation applied).</p>
    </div>
  );
}

import { CopyButton, Field, Kv, NumberInput, Section, TextInput, Warnings, EstimateBanner } from '../components/ui';
import { buildLnmpln, buildPln, type ExportFlight } from '../lib/exports';
import { encodeShare, download, type SavedFlight } from '../lib/store';
import { makeSharedFlight, makeSnapshot } from '../lib/snapshot';
import { fmtHm, fmtWeight } from '../lib/units';
import { useApp } from '../state';
import type { Airport } from '../lib/airports';
import type { RoutePoint } from '../lib/route';

function AirportStatus({ code, airport }: { code: string; airport: Airport | null }) {
  if (!code) return null;
  if (!airport) return <span className="danger">Not found. <a href="#airports">Add it under Airports</a>.</span>;
  const rwys = airport.runways.map((r) => r.ident).join(' ');
  return (
    <span>
      {airport.name}
      {airport.source === 'custom' && <b> (my airport)</b>}
      {rwys && <span className="muted"> · RWY {rwys}</span>}
    </span>
  );
}

export function exportFlight(dep: Airport, arr: Airport, points: RoutePoint[], cruiseFl: number): ExportFlight {
  const ap = (a: Airport): ExportFlight['dep'] => ({ ident: a.icao, name: a.name, lat: a.lat, lon: a.lon, type: 'airport', source: a.source, via: '', elevationFt: a.elevationFt });
  return { dep: ap(dep), arr: ap(arr), enroute: points.slice(1, -1), cruiseAltFt: cruiseFl * 100, title: `${dep.icao} to ${arr.icao}` };
}

export function PlanPage() {
  const app = useApp();
  const { inputs, setInputs, derived, profiles } = app;
  const { profile, plan, route, dep, arr, altn, units } = derived;
  const set = <K extends keyof typeof inputs>(k: K, v: (typeof inputs)[K]) => setInputs({ ...inputs, [k]: v });
  const u = units;
  const canExport = !!dep && !!arr;

  const save = () => {
    const flight: SavedFlight = { id: Date.now().toString(36), savedAt: new Date().toISOString(), inputs };
    app.update('flights', [flight, ...app.store.flights]);
    alert('Flight saved. Find it under Flights.');
  };

  const shareUrl = () => {
    const shared = makeSharedFlight(inputs, route, app.store.airports, app.store.waypoints, [dep, arr, altn]);
    return `${location.origin}${location.pathname}#import=${encodeShare(shared)}`;
  };
  const kioskUrl = () => {
    const snap = makeSnapshot(inputs, plan, route, profile.name, derived.fmcText);
    return new URL(`kiosk.html#d=${encodeShare(snap)}`, location.href).toString();
  };

  const tile = (k: string, v: string, unit?: string, bad?: boolean) => (
    <div className={`tile ${bad ? 'bad' : ''}`}>
      <div className="k">{k}</div>
      <div className="v">
        {v}
        {unit && <span className="u">{unit}</span>}
      </div>
    </div>
  );
  const limit = (name: string) => plan.limits.find((l) => l.name === name)!;

  return (
    <div className="plan-layout">
      <div>
        <Section title="Flight">
          <div className="form-grid">
            <Field label="Aircraft" wide>
              <select className="input" value={inputs.profileId} onChange={(e) => app.changeProfile(e.target.value)}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.verified ? '  (placeholder values)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            {profile.variants && (
              <Field label="Variant / engines">
                <select className="input" value={inputs.variant ?? ''} onChange={(e) => set('variant', e.target.value || undefined)}>
                  {Object.keys(profile.variants).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Weight units" hint={`Profile uses ${profile.units}`}>
              <select className="input" value={inputs.units ?? ''} onChange={(e) => app.changeUnits((e.target.value || undefined) as 'kg' | 'lb' | undefined)}>
                <option value="">Profile ({profile.units})</option>
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </Field>
            <Field label="Flight number">
              <TextInput value={inputs.flightNo} onChange={(v) => set('flightNo', v)} upper maxLength={10} />
            </Field>
            <Field label="Departure" hint={<AirportStatus code={inputs.dep} airport={dep} />}>
              <TextInput value={inputs.dep} onChange={(v) => set('dep', v.trim())} upper maxLength={4} placeholder="ZUDC" />
            </Field>
            <Field label="Dep runway">
              <TextInput value={inputs.depRwy} onChange={(v) => set('depRwy', v.trim())} upper maxLength={4} />
            </Field>
            <Field label="Arrival" hint={<AirportStatus code={inputs.arr} airport={arr} />}>
              <TextInput value={inputs.arr} onChange={(v) => set('arr', v.trim())} upper maxLength={4} placeholder="ZUNZ" />
            </Field>
            <Field label="Arr runway">
              <TextInput value={inputs.arrRwy} onChange={(v) => set('arrRwy', v.trim())} upper maxLength={4} />
            </Field>
            <Field label="Alternate" hint={<AirportStatus code={inputs.altn} airport={altn} />}>
              <TextInput value={inputs.altn} onChange={(v) => set('altn', v.trim())} upper maxLength={4} />
            </Field>
            <Field label="Cruise level (FL)">
              <NumberInput value={inputs.cruiseFl} onChange={(v) => set('cruiseFl', Math.round(v))} min={10} max={450} />
            </Field>
            <Field label="Route" wide hint="Waypoints, airways, SID/STAR names, DCT, or coordinates like 4530N11630E. Departure and arrival airports are optional here.">
              <textarea className="input" value={inputs.route} onChange={(e) => set('route', e.target.value.toUpperCase())} spellCheck={false} placeholder="SID WPT1 W5 WPT2 STAR" />
            </Field>
          </div>
          <div className="chips">
            {route.tokens.map((t, i) => (
              <span key={i} className={`chip ${t.kind}`} title={t.note ?? t.fix?.source ?? t.kind}>
                {t.raw}
              </span>
            ))}
          </div>
          {route.tokens.length > 0 && (
            <div className="legend">Colours: blue airport · green waypoint · purple airway · pink SID/STAR · red not found (hover for details)</div>
          )}
        </Section>

        <Section title={`Load and fuel inputs (${u})`}>
          <div className="form-grid">
            <Field label="Passengers" hint={`Max ${profile.capacity.maxPax}`}>
              <NumberInput value={inputs.paxCount} onChange={(v) => set('paxCount', Math.round(v))} min={0} />
            </Field>
            <Field label={`Avg pax weight (${u})`} hint="Including bags">
              <NumberInput value={inputs.paxWeight} onChange={(v) => set('paxWeight', v)} min={0} />
            </Field>
            <Field label={`Cargo (${u})`}>
              <NumberInput value={inputs.cargo} onChange={(v) => set('cargo', v)} min={0} />
            </Field>
            <Field label="Contingency %">
              <NumberInput value={inputs.contingencyPct} onChange={(v) => set('contingencyPct', v)} min={0} max={50} step={0.5} />
            </Field>
            <Field label="Final reserve (min)">
              <NumberInput value={inputs.reserveMin} onChange={(v) => set('reserveMin', v)} min={0} max={240} />
            </Field>
            <Field label={`Taxi fuel (${u})`}>
              <NumberInput value={inputs.taxiFuel} onChange={(v) => set('taxiFuel', v)} min={0} />
            </Field>
            <Field label={`Extra fuel (${u})`} hint="Discretionary, e.g. for SID/STAR">
              <NumberInput value={inputs.extraFuel} onChange={(v) => set('extraFuel', v)} min={0} />
            </Field>
            <Field label="Avg wind (kt)" hint="+ tailwind, − headwind">
              <NumberInput value={inputs.windKt} onChange={(v) => set('windKt', v)} min={-250} max={250} />
            </Field>
            <Field label="Cost index">
              <NumberInput value={inputs.costIndex} onChange={(v) => set('costIndex', Math.round(v))} min={0} max={9999} />
            </Field>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-small" onClick={() => app.changeProfile(inputs.profileId)}>Reset numbers to aircraft defaults</button>
          </div>
        </Section>
      </div>

      <div>
        <EstimateBanner />
        {!profile.verified && <div className="banner banner-warn">{profile.name}: {profile.placeholderNotice}</div>}
        {plan.exceeded.length > 0 && (
          <div className="banner banner-danger">
            {plan.exceeded.map((l) => (
              <div key={l.name}>
                LIMIT EXCEEDED: {l.name} {fmtWeight(l.value)} {l.unit} &gt; {fmtWeight(l.limit)} {l.unit} (over by {fmtWeight(-l.margin)})
              </div>
            ))}
          </div>
        )}

        <div className="tiles">
          {tile('Distance', fmtWeight(plan.distanceNm), 'nm')}
          {tile('Trip time', fmtHm(plan.tripTimeMin))}
          {tile('Block fuel', fmtWeight(plan.fuel.block), u, !limit('Block fuel').ok)}
          {tile('ZFW', fmtWeight(plan.weights.zfw), u, !limit('Zero fuel weight').ok)}
          {tile('TOW', fmtWeight(plan.weights.tow), u, !limit('Takeoff weight').ok)}
          {tile('LW', fmtWeight(plan.weights.lw), u, !limit('Landing weight').ok)}
        </div>

        <Section
          title="Outputs"
          actions={
            <>
              <button className="btn btn-primary" onClick={save}>Save flight</button>
              <a className="btn" href="#briefing">Briefing</a>
              <a className="btn" href="#fmc">FMC sheet</a>
            </>
          }
        >
          <div className="row">
            <CopyButton text={[inputs.dep, route.fmcRoute, inputs.arr].filter(Boolean).join(' ')} label="Copy route" />
            <button className="btn" disabled={!canExport} onClick={() => download(`${dep!.icao}${arr!.icao}.pln`, buildPln(exportFlight(dep!, arr!, route.points, inputs.cruiseFl)), 'application/xml')}>
              MSFS .pln
            </button>
            <button className="btn" disabled={!canExport} onClick={() => download(`${dep!.icao}${arr!.icao}.lnmpln`, buildLnmpln(exportFlight(dep!, arr!, route.points, inputs.cruiseFl)), 'application/xml')}>
              Little Navmap
            </button>
            <CopyButton text={shareUrl()} label="Copy share link" />
            <CopyButton text={kioskUrl()} label="Copy kiosk link" />
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            Share link: opens this flight in SimPlanner on another device. Kiosk link: a big-text, read-only briefing for a phone,
            tablet or sim EFB browser (experimental).
          </p>
        </Section>

        <Section title="Fuel">
          <Kv
            rows={[
              ['Taxi', fmtWeight(plan.fuel.taxi, u)],
              [`Trip (${fmtHm(plan.tripTimeMin)})`, fmtWeight(plan.fuel.trip, u)],
              [`Contingency (${inputs.contingencyPct}%)`, fmtWeight(plan.fuel.contingency, u)],
              [`Alternate ${altn ? altn.icao + ' (' + fmtWeight(plan.alternateDistanceNm) + ' nm)' : ''}`, fmtWeight(plan.fuel.alternate, u)],
              [`Final reserve (${inputs.reserveMin} min)`, fmtWeight(plan.fuel.reserve, u)],
              ['Extra', fmtWeight(plan.fuel.extra, u)],
              ['BLOCK FUEL', <b key="b">{fmtWeight(plan.fuel.block, u)}</b>],
              ['Takeoff fuel', fmtWeight(plan.fuel.takeoff, u)],
              ['Landing fuel (estimated)', fmtWeight(plan.fuel.landing, u)],
            ]}
          />
        </Section>

        <Section title="Weights and limits">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Planned</th>
                  <th className="num">Limit</th>
                  <th className="num">Margin</th>
                </tr>
              </thead>
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
          <Kv rows={[['OEW (profile)', fmtWeight(plan.weights.oew, u)], ['Payload', fmtWeight(plan.weights.payload, u)], ['Ramp weight', fmtWeight(plan.weights.ramp, u)]]} />
        </Section>

        <Section title="Warnings">
          <Warnings items={[...plan.warnings, ...route.warnings]} />
          {!plan.warnings.length && !route.warnings.length && <p className="ok">No warnings.</p>}
        </Section>

        <Section title="Route legs">
          <LegsTable />
        </Section>

        <Section title="How these numbers were worked out">
          <details>
            <summary>Show formulas ({plan.formulas.length} steps)</summary>
            <ol className="formulas">
              {plan.formulas.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ol>
            <p className="muted">Tune the inputs to these formulas in the aircraft profile (Aircraft page).</p>
          </details>
        </Section>
      </div>
    </div>
  );
}

export function LegsTable() {
  const { route } = useApp().derived;
  if (!route.legs.length) return <p className="muted">Enter departure, arrival and a route to see legs.</p>;
  let cum = 0;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>To</th>
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
                <td className="mono">{l.to.ident}</td>
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

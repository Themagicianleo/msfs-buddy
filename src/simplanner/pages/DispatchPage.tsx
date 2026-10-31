import { useEffect, useState } from 'react';
import { AirportPicker } from '../components/AirportPicker';
import { Field, NumberInput, TextInput } from '../components/ui';
import { generateFlight } from '../generate';
import { findPublishedRoutes } from '../lib/caac';
import { makeDepTime, suggestDeparture } from '../lib/times';
import type { SavedFlight } from '../lib/store';
import { useApp } from '../state';

/** SimBrief-style dispatch: fill in the flight, press Generate. */
export function DispatchPage() {
  const app = useApp();
  const { inputs, setInputs, derived, profiles } = app;
  const { profile, dep, arr, units: u } = derived;
  const set = <K extends keyof typeof inputs>(k: K, v: (typeof inputs)[K]) => setInputs({ ...inputs, [k]: v });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const generate = async () => {
    setBusy(true);
    setErrors([]);
    const res = await generateFlight(inputs, profile, app.index, { library: app.routeLibrary, airways: app.airways });
    setBusy(false);
    if (res.errors.length) {
      setErrors(res.errors);
      return;
    }
    setInputs(res.inputs);
    const flight: SavedFlight = { id: Date.now().toString(36), savedAt: new Date().toISOString(), inputs: res.inputs };
    app.update('flights', [flight, ...app.store.flights].slice(0, 100));
    location.hash = '#ofp';
  };

  const loadFactor = (pct: number) => set('paxCount', Math.round((profile.capacity.maxPax * pct) / 100));
  const published = findPublishedRoutes(app.routeLibrary, inputs.dep, inputs.arr);
  const rwyOptions = (a: typeof dep) => (a?.runways ?? []).map((r) => r.ident);

  return (
    <div className="dispatch">
      {app.datasetError && <div className="banner banner-warn">{app.datasetError}</div>}
      {!app.datasetLoading && !app.dataset && !app.datasetError && (
        <div className="banner banner-warn">Airport data isn't available yet. You can still use airports you add under Airports.</div>
      )}

      <section className="section">
        <div className="section-head"><h2>1 · Aircraft</h2></div>
        <div className="form-grid">
          <Field label="Aircraft" wide>
            <select className="input" value={inputs.profileId} onChange={(e) => app.changeProfile(e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.verified ? '' : '  (placeholder values)'}</option>)}
            </select>
          </Field>
          {profile.variants && (
            <Field label="Engines">
              <select className="input" value={inputs.variant ?? ''} onChange={(e) => set('variant', e.target.value || undefined)}>
                {Object.keys(profile.variants).map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
          )}
          <Field label="Flight number">
            <TextInput value={inputs.flightNo} onChange={(v) => set('flightNo', v.trim())} upper maxLength={10} placeholder="CES5401" />
          </Field>
          <Field label="Units">
            <select className="input" value={inputs.units ?? ''} onChange={(e) => app.changeUnits((e.target.value || undefined) as 'kg' | 'lb' | undefined)}>
              <option value="">{profile.units} (aircraft)</option>
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>2 · Where</h2></div>
        <div className="od">
          <AirportPicker label="From" value={inputs.dep} onChange={(v) => set('dep', v)} placeholder="ZUDC" />
          <div className="od-arrow">→</div>
          <AirportPicker label="To" value={inputs.arr} onChange={(v) => set('arr', v)} placeholder="ZUNZ" />
        </div>
        <DepartureTime value={inputs.depTime} onChange={(v) => set('depTime', v)} />

        <div className="options">
          <div className="option">
            <span className="field-label">Route</span>
            <div className="segmented">
              {([['airways', 'Airways'], ['navaids', 'VOR to VOR'], ['direct', 'Direct'], ['manual', 'My own']] as const).map(([id, label]) => (
                <button key={id} type="button" className={inputs.routeMode === id ? 'on' : ''} onClick={() => set('routeMode', id)}>{label}</button>
              ))}
            </div>
            {(inputs.routeMode === 'airways' || inputs.routeMode === 'navaids') && published.length > 0 && (
              <Field label="CAAC published route" hint="From the route lists you imported under Settings">
                <select className="input" value={inputs.publishedRoute === 'off' ? 'off' : published.some((p) => p.code === inputs.publishedRoute) ? inputs.publishedRoute : published[0].code} onChange={(e) => set('publishedRoute', e.target.value)}>
                  {published.map((p) => <option key={p.code} value={p.code}>{p.code}: {p.route.length > 60 ? `${p.route.slice(0, 60)}…` : p.route}</option>)}
                  <option value="off">Don&apos;t use; build VOR to VOR</option>
                </select>
              </Field>
            )}
            {inputs.routeMode === 'manual' ? (
              <textarea className="input" value={inputs.route} onChange={(e) => set('route', e.target.value.toUpperCase())} spellCheck={false} placeholder="SID WPT1 W5 WPT2 STAR" />
            ) : (
              <span className="field-hint">
                {(inputs.routeMode === 'airways' || inputs.routeMode === 'navaids') && published.length > 0 && inputs.publishedRoute !== 'off'
                  ? 'Uses the CAAC published route above (airways and fixes as filed). You can edit it afterwards with "My own".'
                  : inputs.routeMode === 'airways'
                    ? app.airways
                      ? `Shortest route along the airways in your ${app.airways.data.dataSource || 'simulator'} navdata, like SimBrief. Not ATC-validated; you can edit it afterwards with "My own".`
                      : <>No airway data yet: import it under <a href="#settings">Settings → Airways</a>. Until then this builds a VOR-to-VOR route.</>
                    : inputs.routeMode === 'navaids'
                      ? 'Built from VOR/NDB beacons near the direct track. Not an ATC airway route. You can edit it afterwards with "My own".'
                      : 'Straight great-circle line (DCT).'}
              </span>
            )}
          </div>

          <div className="option">
            <label className="check"><input type="checkbox" checked={inputs.autoAlternate} onChange={(e) => set('autoAlternate', e.target.checked)} /> Pick the alternate for me</label>
            {!inputs.autoAlternate && <AirportPicker label="Alternate" value={inputs.altn} onChange={(v) => set('altn', v)} />}
            {inputs.autoAlternate && <span className="field-hint">Nearest airport to the arrival with a runway of at least {(profile.defaults.minRunwayFt ?? 6500).toLocaleString('en-US')} ft.</span>}
          </div>

          <div className="option">
            <label className="check"><input type="checkbox" checked={inputs.autoRunways} onChange={(e) => set('autoRunways', e.target.checked)} /> Pick runways from the live wind</label>
            {!inputs.autoRunways && (
              <div className="form-grid">
                <Field label="Departure runway">
                  <select className="input" value={inputs.depRwy} onChange={(e) => set('depRwy', e.target.value)}>
                    <option value="">—</option>
                    {rwyOptions(dep).map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Arrival runway">
                  <select className="input" value={inputs.arrRwy} onChange={(e) => set('arrRwy', e.target.value)}>
                    <option value="">—</option>
                    {rwyOptions(arr).map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>
              </div>
            )}
          </div>

          <div className="option">
            <label className="check"><input type="checkbox" checked={inputs.autoCruise} onChange={(e) => set('autoCruise', e.target.checked)} /> Pick the cruise level for me</label>
            {!inputs.autoCruise && (
              <Field label="Cruise level (FL)">
                <NumberInput value={inputs.cruiseFl} onChange={(v) => set('cruiseFl', Math.round(v))} min={10} max={450} />
              </Field>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>3 · Load</h2></div>
        <div className="segmented" style={{ marginBottom: 12 }}>
          <button type="button" className={inputs.loadMode === 'random' ? 'on' : ''} onClick={() => set('loadMode', 'random')}>Random (like SimBrief)</button>
          <button type="button" className={inputs.loadMode === 'manual' ? 'on' : ''} onClick={() => set('loadMode', 'manual')}>I&apos;ll set it</button>
        </div>
        {inputs.loadMode === 'random' ? (
          <p className="field-hint" style={{ marginTop: 0 }}>
            Each Generate picks a realistic load: usually 75–95% of the {profile.capacity.maxPax} seats (sometimes lighter) plus some cargo,
            then takes cargo and passengers off if the flight would exceed MZFW, MTOW or MLW. Re-roll it on the OFP.
          </p>
        ) : (
          <div className="form-grid">
            <Field label="Passengers" hint={`of ${profile.capacity.maxPax} seats`}>
              <NumberInput value={inputs.paxCount} onChange={(v) => set('paxCount', Math.round(v))} min={0} />
            </Field>
            <Field label="Quick fill">
              <div className="row">
                {[50, 75, 90, 100].map((p) => <button key={p} type="button" className="btn btn-small" onClick={() => loadFactor(p)}>{p}%</button>)}
              </div>
            </Field>
            <Field label={`Cargo (${u})`}>
              <NumberInput value={inputs.cargo} onChange={(v) => set('cargo', v)} min={0} />
            </Field>
          </div>
        )}
        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label={`Weight per passenger (${u})`} hint="Including bags">
            <NumberInput value={inputs.paxWeight} onChange={(v) => set('paxWeight', v)} min={0} />
          </Field>
        </div>

        <details className="advanced">
          <summary>Fuel policy and other settings</summary>
          <div className="form-grid">
            <Field label="Contingency %"><NumberInput value={inputs.contingencyPct} onChange={(v) => set('contingencyPct', v)} min={0} max={50} step={0.5} /></Field>
            <Field label="Final reserve (min)"><NumberInput value={inputs.reserveMin} onChange={(v) => set('reserveMin', v)} min={0} max={240} /></Field>
            <Field label={`Taxi fuel (${u})`}><NumberInput value={inputs.taxiFuel} onChange={(v) => set('taxiFuel', v)} min={0} /></Field>
            <Field label={`Extra fuel (${u})`}><NumberInput value={inputs.extraFuel} onChange={(v) => set('extraFuel', v)} min={0} /></Field>
            <Field label="Avg wind (kt)" hint="+ tail, − head"><NumberInput value={inputs.windKt} onChange={(v) => set('windKt', v)} min={-250} max={250} /></Field>
            <Field label="Cost index"><NumberInput value={inputs.costIndex} onChange={(v) => set('costIndex', Math.round(v))} min={0} max={9999} /></Field>
          </div>
          <button type="button" className="btn btn-small" onClick={() => app.changeProfile(inputs.profileId)}>Reset to aircraft defaults</button>
        </details>
      </section>

      {errors.length > 0 && <div className="banner banner-danger">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
      <div className="generate-bar">
        <button className="btn btn-primary btn-big" onClick={generate} disabled={busy}>
          {busy ? 'Generating…' : 'Generate flight'}
        </button>
      </div>
    </div>
  );
}

/** Optional off-blocks time in UTC; gives OUT/OFF/ON/IN times on the OFP and in the EFB. */
function DepartureTime({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const [date, setDate] = useState(value?.slice(0, 10) ?? '');
  const [time, setTime] = useState(value?.slice(11, 16) ?? '');
  useEffect(() => {
    setDate(value?.slice(0, 10) ?? '');
    setTime(value?.slice(11, 16) ?? '');
  }, [value]);
  const update = (d: string, t: string) => {
    setDate(d);
    setTime(t);
    if (!t.trim()) onChange(undefined);
    else {
      const iso = makeDepTime(d, t);
      if (iso) onChange(iso);
    }
  };
  const invalid = !!time.trim() && !makeDepTime(date, time);
  return (
    <div className="form-grid" style={{ marginTop: 16 }}>
      <Field label="Departure date (UTC)">
        <input className="input" type="date" value={date} onChange={(e) => update(e.target.value, time)} />
      </Field>
      <Field label="Off blocks (UTC)" hint={invalid ? 'Enter a time like 09:30, and a date' : 'Optional. Gives block times on the OFP and in the EFB.'}>
        <input className="input mono" inputMode="numeric" placeholder="09:30" value={time} onChange={(e) => update(date, e.target.value)} />
      </Field>
      <Field label=" ">
        <div className="row">
          <button type="button" className="btn btn-small" onClick={() => { const s = suggestDeparture(); update(s.date, s.time); }}>In 30 min</button>
          {value && <button type="button" className="btn btn-small" onClick={() => update('', '')}>Clear</button>}
        </div>
      </Field>
    </div>
  );
}

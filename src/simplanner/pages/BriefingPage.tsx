import { useCallback, useEffect, useState } from 'react';
import { CopyButton, EstimateBanner, Kv, Section, Warnings } from '../components/ui';
import { formatTaf } from '../../lib/metar';
import { fmtHm, fmtWeight } from '../lib/units';
import { age, getWeather, type WeatherResult } from '../lib/weather';
import { useApp } from '../state';
import { LegsTable } from './OfpPage';
import type { Airport } from '../lib/airports';

function RunwayList({ a }: { a: Airport | null }) {
  if (!a) return <span className="danger">airport not found</span>;
  if (!a.runways.length) return <span className="muted">no runway data</span>;
  return (
    <span>
      {a.runways.map((r) => `${r.ident} ${r.lengthFt ? Math.round(r.lengthFt).toLocaleString('en-US') + ' ft' : ''}`).join(' · ')}
    </span>
  );
}

/** METAR/TAF for departure, arrival and alternate, fetched when shown. */
export function WeatherSection() {
  const { inputs } = useApp();
  const [wx, setWx] = useState<WeatherResult | null>(null);
  const [loading, setLoading] = useState(false);
  const ids = [inputs.dep, inputs.arr, inputs.altn].filter(Boolean);
  const key = ids.join(',');

  const refresh = useCallback(async () => {
    setLoading(true);
    setWx(await getWeather(key.split(',').filter(Boolean)));
    setLoading(false);
  }, [key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Section title="Weather" actions={<button className="btn btn-small no-print" onClick={refresh} disabled={loading}>{loading ? 'Fetching…' : 'Refresh'}</button>}>
      {wx?.message && <div className="banner banner-warn">{wx.message}</div>}
      {ids.map((id) => {
        const s = wx?.stations[id.toUpperCase()];
        return (
          <div key={id} style={{ marginBottom: 10 }}>
            <b>{id.toUpperCase()}</b>
            {s ? <span className="muted"> · fetched {age(s.fetchedAt)} from {s.source}</span> : null}
            <div className="metar">{s?.metar || (loading ? 'Loading…' : 'No METAR available.')}</div>
            {s?.taf && <div className="metar">{formatTaf(s.taf)}</div>}
          </div>
        );
      })}
    </Section>
  );
}

export function BriefingPage() {
  const { inputs, derived } = useApp();
  const { plan, route, profile, dep, arr, altn, units: u } = derived;

  const fullRoute = [inputs.dep, route.fmcRoute, inputs.arr].filter(Boolean).join(' ');
  const title = `${inputs.flightNo ? inputs.flightNo + ' · ' : ''}${inputs.dep || '????'} → ${inputs.arr || '????'}`;

  return (
    <div className="briefing">
      <div className="row no-print" style={{ marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={() => window.print()}>Print / save as PDF</button>
        <CopyButton text={fullRoute} label="Copy route" />
      </div>

      <Section title={title}>
        <p style={{ margin: '0 0 10px' }}>
          {profile.name}
          {inputs.variant ? ` (${inputs.variant})` : ''} · FL{inputs.cruiseFl} · CI {inputs.costIndex} · prepared {new Date().toUTCString().replace('GMT', 'UTC')}
        </p>
        <EstimateBanner />
        {!profile.verified && <div className="banner banner-warn">Aircraft profile values are PLACEHOLDERS and have not been verified.</div>}
        {plan.exceeded.length > 0 && (
          <div className="banner banner-danger">
            {plan.exceeded.map((l) => <div key={l.name}>LIMIT EXCEEDED: {l.name} over by {fmtWeight(-l.margin)} {l.unit}</div>)}
          </div>
        )}
        <Kv
          rows={[
            ['Departure', `${inputs.dep} ${dep?.name ?? ''} · RWY ${inputs.depRwy || '—'}`],
            ['Arrival', `${inputs.arr} ${arr?.name ?? ''} · RWY ${inputs.arrRwy || '—'}`],
            ['Alternate', inputs.altn ? `${inputs.altn} ${altn?.name ?? ''}` : 'none'],
            ['Distance (route, great circle)', `${fmtWeight(plan.distanceNm)} nm`],
            ['Estimated trip time', fmtHm(plan.tripTimeMin)],
          ]}
        />
      </Section>

      <Section title="Route">
        <p className="mono" style={{ fontSize: 19, margin: 0, wordBreak: 'break-word' }}>{fullRoute || '—'}</p>
      </Section>

      <div className="plan-layout">
        <Section title={`Fuel (${u})`}>
          <Kv
            rows={[
              ['Taxi', fmtWeight(plan.fuel.taxi)],
              ['Trip', fmtWeight(plan.fuel.trip)],
              [`Contingency ${inputs.contingencyPct}%`, fmtWeight(plan.fuel.contingency)],
              ['Alternate', fmtWeight(plan.fuel.alternate)],
              [`Final reserve ${inputs.reserveMin} min`, fmtWeight(plan.fuel.reserve)],
              ['Extra', fmtWeight(plan.fuel.extra)],
              ['BLOCK', <b key="b">{fmtWeight(plan.fuel.block)}</b>],
              ['Takeoff fuel', fmtWeight(plan.fuel.takeoff)],
              ['Landing fuel', fmtWeight(plan.fuel.landing)],
            ]}
          />
        </Section>
        <Section title={`Weights (${u})`}>
          <Kv
            rows={[
              ['Passengers', `${inputs.paxCount} × ${fmtWeight(inputs.paxWeight)}`],
              ['Cargo', fmtWeight(inputs.cargo)],
              ['Payload', fmtWeight(plan.weights.payload)],
              ...plan.limits
                .filter((l) => l.unit !== 'pax' && l.name !== 'Cargo' && l.name !== 'Block fuel')
                .map((l) => [`${l.name} (max ${fmtWeight(l.limit)})`, <span key={l.name} className={l.ok ? '' : 'danger'}>{fmtWeight(l.value)}{l.ok ? '' : ' ✖'}</span>] as [string, JSX.Element]),
            ]}
          />
        </Section>
      </div>

      <WeatherSection />

      <Section title="Runways (from airport data)">
        <Kv rows={[[inputs.dep || 'Departure', <RunwayList key="d" a={dep} />], [inputs.arr || 'Arrival', <RunwayList key="a" a={arr} />]]} />
        <p className="muted" style={{ marginBottom: 0 }}>OurAirports headings are true, not magnetic. Lengths are total runway length, not available distances.</p>
      </Section>

      <Section title="Legs">
        <LegsTable />
      </Section>

      <Section title="Warnings">
        <Warnings items={[...plan.warnings, ...route.warnings]} />
      </Section>

      <Section title="FMC cheat sheet">
        <pre className="sheet">{derived.fmcText}</pre>
      </Section>

      <Section title="Takeoff reference notes (from profile)">
        <p style={{ margin: 0 }}>{profile.vspeedNotes}</p>
      </Section>

      <Section title="Formulas used">
        <ol className="formulas">
          {plan.formulas.map((f, i) => <li key={i}>{f}</li>)}
        </ol>
      </Section>
      <p className="print-only">{'SimPlanner briefing. Simulation use only. Fuel and weights are estimates, verify with the aircraft’s own performance tools.'}</p>
    </div>
  );
}

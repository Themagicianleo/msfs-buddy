import { Field, NoPlan, Panel } from '../components/ui';
import { fmtNum } from '../lib/format';
import type { FlightPlan, TlrSection } from '../lib/simbrief';
import { usePersistent, type Settings } from '../lib/storage';

interface TakeoffCard {
  rwy: string;
  flaps: string;
  flex: string;
  v1: string;
  vr: string;
  v2: string;
  trim: string;
  transAlt: string;
}

const EMPTY_CARD: TakeoffCard = { rwy: '', flaps: '', flex: '', v1: '', vr: '', v2: '', trim: '', transAlt: '' };

function TlrTable({ section, landing, units }: { section: TlrSection; landing: boolean; units: string }) {
  const planned = section.runways.find((r) => r.ident === section.plannedRunway);
  const rows = planned ? [planned, ...section.runways.filter((r) => r !== planned)] : section.runways;
  return (
    <>
      <div className="fields fields-6">
        <Field label="Airport" value={section.airport || '—'} />
        <Field label="Planned RWY" value={section.plannedRunway || '—'} accent />
        <Field label="Wind" value={section.wind || '—'} />
        <Field label="OAT" value={section.temperature ? `${section.temperature}°C` : '—'} />
        <Field label="QNH" value={section.altimeter || '—'} />
        <Field label="Surface" value={section.surface || '—'} />
      </div>
      <div className="table-wrap">
        <table className="navlog">
          <thead>
            <tr>
              <th>RWY</th>
              <th>Length ft</th>
              <th>Flaps</th>
              {landing ? <th>VREF</th> : <><th>Thrust</th><th>FLEX</th><th>V1</th><th>VR</th><th>V2</th></>}
              <th>HD / XW</th>
              <th>{landing ? 'Dist req ft' : 'Max wt'} </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ident} className={r === planned ? 'row-apt' : ''}>
                <td><b>{r.ident}</b></td>
                <td>{fmtNum(r.length)}</td>
                <td>{r.flaps || '—'}</td>
                {landing ? (
                  <td className="accent">{r.vref ?? '—'}</td>
                ) : (
                  <>
                    <td>{r.thrust || '—'}</td>
                    <td>{r.flexTemp ?? '—'}</td>
                    <td className="accent">{r.v1 ?? '—'}</td>
                    <td className="accent">{r.vr ?? '—'}</td>
                    <td className="accent">{r.v2 ?? '—'}</td>
                  </>
                )}
                <td>{r.headwind ?? '—'} / {r.crosswind === null ? '—' : Math.abs(r.crosswind)}</td>
                <td>{landing ? fmtNum(r.distanceRequired) : `${fmtNum(r.maxWeight)} ${units}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function PerfPage({ plan }: { plan: FlightPlan | null; settings: Settings }) {
  const [card, setCard] = usePersistent<TakeoffCard>('perf.card', EMPTY_CARD);
  if (!plan) return <NoPlan what="performance" />;
  const u = plan.units.toUpperCase();

  const fillFromTlr = () => {
    const t = plan.takeoff;
    const r = t?.runways.find((x) => x.ident === t.plannedRunway) ?? t?.runways[0];
    setCard({
      ...card,
      rwy: r?.ident ?? plan.origin.runway,
      flaps: r?.flaps ?? card.flaps,
      flex: r?.flexTemp?.toString() ?? card.flex,
      v1: r?.v1?.toString() ?? card.v1,
      vr: r?.vr?.toString() ?? card.vr,
      v2: r?.v2?.toString() ?? card.v2,
      transAlt: plan.origin.transAlt?.toString() ?? card.transAlt,
    });
  };

  const set = (k: keyof TakeoffCard) => (e: React.ChangeEvent<HTMLInputElement>) => setCard({ ...card, [k]: e.target.value.toUpperCase() });

  return (
    <div className="page">
      <Panel
        title="Takeoff card"
        right={
          <div className="btn-row">
            <button className="btn btn-small" onClick={fillFromTlr}>Fill from OFP</button>
            <button className="btn btn-small" onClick={() => setCard(EMPTY_CARD)}>Clear</button>
          </div>
        }
      >
        <div className="to-card">
          {(['rwy', 'flaps', 'flex', 'v1', 'vr', 'v2', 'trim', 'transAlt'] as const).map((k) => (
            <label key={k} className="to-field">
              <span>{{ rwy: 'RWY', flaps: 'FLAPS', flex: 'FLEX TEMP', v1: 'V1', vr: 'VR', v2: 'V2', trim: 'THS / TRIM', transAlt: 'TRANS ALT' }[k]}</span>
              <input value={card[k]} onChange={set(k)} maxLength={10} />
            </label>
          ))}
        </div>
        <div className="fields fields-4">
          <Field label="TOW" value={fmtNum(plan.weights.tow)} unit={u} />
          <Field label="ZFW" value={fmtNum(plan.weights.zfw)} unit={u} />
          <Field label="T/O fuel" value={fmtNum(plan.fuel.planTakeoff)} unit={u} />
          <Field label="Cost index" value={plan.costIndex || '—'} />
        </div>
      </Panel>

      {plan.takeoff ? (
        <Panel title="Takeoff performance (SimBrief TLR)">
          <TlrTable section={plan.takeoff} landing={false} units={u} />
        </Panel>
      ) : null}
      {plan.landing ? (
        <Panel title="Landing performance (SimBrief TLR)">
          <TlrTable section={plan.landing} landing units={u} />
        </Panel>
      ) : null}
      {!plan.takeoff && !plan.landing && (
        <div className="empty">
          <p>No takeoff/landing performance in this OFP.</p>
          <p className="muted">
            In SimBrief, enable <b>Takeoff / Landing Performance</b> in the dispatch options (supported for the A320 family) and
            regenerate the flight. Always cross-check with your aircraft's own EFB/MCDU.
          </p>
        </div>
      )}
    </div>
  );
}

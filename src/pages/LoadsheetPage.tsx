import { Field, NoPlan, Panel } from '../components/ui';
import { fmtNum } from '../lib/format';
import type { FlightPlan } from '../lib/simbrief';
import type { Settings } from '../lib/storage';

function WeightBar({ label, value, max, unit }: { label: string; value: number | null; max: number | null; unit: string }) {
  const pct = value && max ? Math.min(100, (value / max) * 100) : 0;
  const over = value !== null && max !== null && value > max;
  return (
    <div className="wbar">
      <div className="wbar-top">
        <span>{label}</span>
        <span>
          <b className={over ? 'warn' : ''}>{fmtNum(value)}</b>
          <span className="muted"> / {fmtNum(max)} {unit}</span>
        </span>
      </div>
      <div className="wbar-track">
        <div className={`wbar-fill ${over ? 'over' : pct > 95 ? 'near' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="muted small">{max && value !== null ? `${fmtNum(max - value)} ${unit} margin` : ''}</div>
    </div>
  );
}

export function LoadsheetPage({ plan }: { plan: FlightPlan | null; settings: Settings }) {
  if (!plan) return <NoPlan what="the loadsheet" />;
  const u = plan.units.toUpperCase();
  const f = plan.fuel;
  const w = plan.weights;

  const fuelRows: [string, number | null][] = [
    ['Trip', f.trip],
    ['Contingency', f.contingency],
    ['Alternate', f.alternate],
    ['Final reserve', f.reserve],
    ['Extra', f.extra],
    ['Taxi', f.taxi],
  ];

  return (
    <div className="page">
      <div className="grid grid-2">
        <Panel title="Weights">
          <WeightBar label="Zero fuel weight" value={w.zfw} max={w.maxZfw} unit={u} />
          <WeightBar label="Takeoff weight" value={w.tow} max={w.maxTow} unit={u} />
          <WeightBar label="Landing weight" value={w.ldw} max={w.maxLdw} unit={u} />
          <div className="fields fields-3">
            <Field label="DOW / OEW" value={fmtNum(w.oew)} unit={u} />
            <Field label="Payload" value={fmtNum(w.payload)} unit={u} />
            <Field label="Ramp weight" value={fmtNum(w.ramp)} unit={u} />
          </div>
        </Panel>

        <Panel title="Fuel plan">
          <table className="kv">
            <tbody>
              {fuelRows.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{fmtNum(v)} <small>{u}</small></td>
                </tr>
              ))}
              <tr className="total">
                <td>Block fuel</td>
                <td>{fmtNum(f.planRamp)} <small>{u}</small></td>
              </tr>
              <tr>
                <td>Takeoff fuel</td>
                <td>{fmtNum(f.planTakeoff)} <small>{u}</small></td>
              </tr>
              <tr>
                <td>Min takeoff fuel</td>
                <td>{fmtNum(f.minTakeoff)} <small>{u}</small></td>
              </tr>
              <tr>
                <td>Landing fuel</td>
                <td>{fmtNum(f.planLanding)} <small>{u}</small></td>
              </tr>
              <tr>
                <td>Avg fuel flow</td>
                <td>{fmtNum(f.avgFlow)} <small>{u}/h</small></td>
              </tr>
            </tbody>
          </table>
          {f.maxTanks && f.planRamp ? (
            <WeightBar label="Tank capacity" value={f.planRamp} max={f.maxTanks} unit={u} />
          ) : null}
        </Panel>
      </div>

      <Panel title="Load">
        <div className="fields fields-4">
          <Field label="Passengers" value={fmtNum(w.paxCount ?? plan.passengers)} accent />
          <Field label="Pax weight (each)" value={fmtNum(w.paxWeight)} unit={u} />
          <Field label="Bags" value={fmtNum(w.bagCount)} />
          <Field label="Cargo" value={fmtNum(w.cargo)} unit={u} />
        </div>
        <p className="muted small">Enter these figures in your aircraft's EFB / payload manager to match the SimBrief plan.</p>
      </Panel>
    </div>
  );
}

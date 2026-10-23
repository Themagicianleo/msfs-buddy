import { Panel } from '../components/ui';
import type { FlightPlan } from '../lib/simbrief';
import { usePersistent, type Settings } from '../lib/storage';

interface Clearance {
  clearedTo: string;
  sid: string;
  runway: string;
  initialAlt: string;
  squawk: string;
  departureFreq: string;
  atis: string;
  qnh: string;
}

const EMPTY: Clearance = { clearedTo: '', sid: '', runway: '', initialAlt: '', squawk: '', departureFreq: '', atis: '', qnh: '' };

const LABELS: Record<keyof Clearance, string> = {
  clearedTo: 'Cleared to',
  sid: 'SID',
  runway: 'Runway',
  initialAlt: 'Initial climb',
  squawk: 'Squawk',
  departureFreq: 'Departure freq',
  atis: 'ATIS info',
  qnh: 'QNH',
};

export function NotesPage({ plan }: { plan: FlightPlan | null; settings: Settings }) {
  const [clr, setClr] = usePersistent<Clearance>('notes.clearance', EMPTY);
  const [notes, setNotes] = usePersistent<string>('notes.text', '');

  const prefill = () => {
    if (!plan) return;
    const sid = plan.navlog.find((f) => f.isSidStar && f.stage === 'CLB')?.via ?? '';
    setClr({ ...clr, clearedTo: plan.destination.icao, sid, runway: plan.origin.runway });
  };

  return (
    <div className="page">
      <Panel
        title="ATC clearance"
        right={
          <div className="btn-row">
            {plan && <button className="btn btn-small" onClick={prefill}>Prefill from OFP</button>}
            <button className="btn btn-small" onClick={() => setClr(EMPTY)}>Clear</button>
          </div>
        }
      >
        <div className="to-card">
          {(Object.keys(LABELS) as (keyof Clearance)[]).map((k) => (
            <label key={k} className="to-field">
              <span>{LABELS[k]}</span>
              <input value={clr[k]} onChange={(e) => setClr({ ...clr, [k]: e.target.value.toUpperCase() })} />
            </label>
          ))}
        </div>
      </Panel>
      <Panel title="Scratchpad" right={<button className="btn btn-small" onClick={() => setNotes('')}>Clear</button>}>
        <textarea
          className="scratchpad mono"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Taxi route, frequencies, reminders…"
        />
      </Panel>
    </div>
  );
}

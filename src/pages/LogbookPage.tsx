import { useRef, useState } from 'react';
import { Field, Panel } from '../components/ui';
import { fmtNum, fmtZulu } from '../lib/format';
import {
  NETWORKS,
  airMinutes,
  blockMinutes,
  download,
  emptyEntry,
  entryFromPlan,
  fmtMinutes,
  mergeEntries,
  parseBackup,
  sortEntries,
  stats,
  toBackup,
  toCsv,
  utcNow,
  type LogEntry,
} from '../lib/logbook';
import type { FlightPlan } from '../lib/simbrief';
import { usePersistent, type Settings } from '../lib/storage';

type TimeKey = 'out' | 'off' | 'on' | 'in';

const TIMES: { key: TimeKey; label: string; hint: string; planned: (p: FlightPlan) => number | null }[] = [
  { key: 'out', label: 'OUT', hint: 'Off blocks', planned: (p) => p.times.estOut },
  { key: 'off', label: 'OFF', hint: 'Takeoff', planned: (p) => p.times.estOff },
  { key: 'on', label: 'ON', hint: 'Landing', planned: (p) => p.times.estOn },
  { key: 'in', label: 'IN', hint: 'On blocks', planned: (p) => p.times.estIn },
];

export function LogbookPage({ plan }: { plan: FlightPlan | null; settings: Settings }) {
  const [entries, setEntries] = usePersistent<LogEntry[]>('logbook.entries', []);
  // The flight being logged or edited. Persisted so stamped times survive a reload mid-flight.
  const [draft, setDraft] = usePersistent<LogEntry | null>('logbook.draft', null);
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const sorted = sortEntries(entries);
  const totals = stats(entries);
  const editing = draft ? entries.some((e) => e.id === draft.id) : false;
  const planLogged = !!plan && entries.some((e) => e.ofpId && e.ofpId === plan.id);

  const saveDraft = () => {
    if (!draft) return;
    if (!draft.dep.trim() || !draft.arr.trim()) {
      setMessage('Enter at least the departure and arrival airports.');
      return;
    }
    setEntries(editing ? entries.map((e) => (e.id === draft.id ? draft : e)) : [...entries, draft]);
    setDraft(null);
    setMessage(editing ? 'Entry updated.' : 'Flight saved to your logbook.');
  };

  const remove = (e: LogEntry) => {
    if (confirm(`Delete ${e.callsign || 'flight'} ${e.dep}–${e.arr} on ${e.date}?`)) {
      setEntries(entries.filter((x) => x.id !== e.id));
      if (draft?.id === e.id) setDraft(null);
    }
  };

  const restore = async (file: File) => {
    try {
      const incoming = parseBackup(await file.text());
      setEntries(mergeEntries(entries, incoming));
      setMessage(`Restored ${incoming.length} flight${incoming.length === 1 ? '' : 's'} from backup.`);
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const today = utcNow().date;

  return (
    <div className="page">
      <div className="page-toolbar">
        <h2>Logbook</h2>
        {!draft && (
          <>
            {plan && (
              <button className="btn btn-primary" onClick={() => setDraft(entryFromPlan(plan))}>
                {planLogged ? 'Log this flight again' : `Log ${plan.origin.icao} → ${plan.destination.icao}`}
              </button>
            )}
            <button className="btn" onClick={() => setDraft(emptyEntry())}>Add flight manually</button>
          </>
        )}
        <div className="btn-row push-right">
          <button className="btn btn-small" disabled={!entries.length} onClick={() => download(`logbook-${today}.csv`, toCsv(entries), 'text/csv')}>
            Export CSV
          </button>
          <button className="btn btn-small" disabled={!entries.length} onClick={() => download(`logbook-backup-${today}.json`, toBackup(entries), 'application/json')}>
            Back up
          </button>
          <button className="btn btn-small" onClick={() => fileInput.current?.click()}>Restore</button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restore(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {message && (
        <div className="alert alert-info" onClick={() => setMessage('')}>
          {message}
        </div>
      )}

      {draft && (
        <Editor
          draft={draft}
          editing={editing}
          plan={plan && plan.id === draft.ofpId ? plan : null}
          onChange={setDraft}
          onSave={saveDraft}
          onCancel={() => setDraft(null)}
        />
      )}

      <div className="grid grid-stats">
        <Panel><Field label="Flights" value={totals.flights} accent /></Panel>
        <Panel><Field label="Block time" value={fmtMinutes(totals.blockMinutes)} unit="h" /></Panel>
        <Panel><Field label="Air time" value={fmtMinutes(totals.airMinutes)} unit="h" /></Panel>
        <Panel><Field label="Distance" value={fmtNum(totals.distance)} unit="NM" /></Panel>
        <Panel><Field label="Avg landing" value={totals.avgLandingRate === null ? '—' : `-${totals.avgLandingRate}`} unit="fpm" /></Panel>
        <Panel><Field label="Most flown" value={totals.topAircraft || '—'} /></Panel>
      </div>

      {sorted.length ? (
        <div className="table-wrap">
          <table className="navlog logbook">
            <thead>
              <tr>
                <th>Date</th>
                <th>Flight</th>
                <th>Aircraft</th>
                <th>Route</th>
                <th>Out</th>
                <th>In</th>
                <th>Block</th>
                <th>Air</th>
                <th>Landing</th>
                <th>Network</th>
                <th>Remarks</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td><b>{e.callsign || '—'}</b></td>
                  <td>
                    {e.aircraft || '—'}
                    {e.reg && <small className="muted"> {e.reg}</small>}
                  </td>
                  <td><b className="accent">{e.dep}</b> → <b className="accent">{e.arr}</b></td>
                  <td>{e.out || '—'}</td>
                  <td>{e.in || '—'}</td>
                  <td>{fmtMinutes(blockMinutes(e))}</td>
                  <td>{fmtMinutes(airMinutes(e))}</td>
                  <td className={landingClass(e.landingRate)}>{e.landingRate === null ? '—' : `-${e.landingRate} fpm`}</td>
                  <td className="muted">{e.network}</td>
                  <td className="remarks" title={e.remarks}>{e.remarks}</td>
                  <td className="row-actions">
                    <button className="btn btn-small" onClick={() => setDraft(e)}>Edit</button>
                    <button className="btn btn-small" onClick={() => remove(e)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !draft && (
          <div className="empty">
            <p>No flights logged yet.</p>
            <p className="muted">
              {plan ? `Press "Log ${plan.origin.icao} → ${plan.destination.icao}" before you push back, then stamp your times as you fly.` : 'Load a SimBrief flight or add one manually.'}
            </p>
          </div>
        )
      )}

      <p className="muted small note">
        Your logbook is stored in this browser only. Use <b>Back up</b> now and then to save a copy, and <b>Restore</b> to
        load it on another device or after clearing your browser data.
      </p>
    </div>
  );
}

function landingClass(rate: number | null) {
  if (rate === null) return 'muted';
  if (rate <= 200) return 'ok';
  if (rate <= 400) return '';
  return 'warn';
}

function Editor({ draft, editing, plan, onChange, onSave, onCancel }: {
  draft: LogEntry;
  editing: boolean;
  plan: FlightPlan | null;
  onChange: (e: LogEntry) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof LogEntry>(k: K, v: LogEntry[K]) => onChange({ ...draft, [k]: v });
  const text = (k: 'callsign' | 'aircraft' | 'reg' | 'dep' | 'arr', max = 10) => (
    <input value={draft[k]} maxLength={max} onChange={(e) => set(k, e.target.value.toUpperCase())} />
  );
  const number = (k: 'distance' | 'fuelUsed' | 'landingRate', placeholder?: string) => (
    <input
      inputMode="numeric"
      value={draft[k] ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d]/g, '');
        set(k, v === '' ? null : Number(v));
      }}
    />
  );
  const stamp = (k: TimeKey) => {
    const now = utcNow();
    // Stamping OUT on a fresh flight also fixes the date.
    onChange({ ...draft, [k]: now.time, ...(k === 'out' && !draft.out ? { date: now.date } : {}) });
  };

  const block = blockMinutes(draft);
  const air = airMinutes(draft);
  const nextTime = TIMES.find((t) => !draft[t.key]);

  return (
    <Panel
      title={editing ? 'Edit flight' : 'Current flight'}
      right={<span className="muted small">{draft.dep || '----'} → {draft.arr || '----'}</span>}
    >
      <div className="oooi">
        {TIMES.map((t) => (
          <div key={t.key} className={`oooi-cell ${draft[t.key] ? 'done' : ''}`}>
            <div className="oooi-label">
              <b>{t.label}</b> <span className="muted">{t.hint}</span>
            </div>
            <input
              className="oooi-time"
              value={draft[t.key]}
              placeholder="HH:MM"
              maxLength={5}
              onChange={(e) => set(t.key, e.target.value.replace(/[^\d:]/g, ''))}
            />
            <button className={`btn btn-small ${nextTime?.key === t.key ? 'btn-primary' : ''}`} onClick={() => stamp(t.key)}>
              Now
            </button>
            {plan && <div className="muted small">Plan {fmtZulu(t.planned(plan))}</div>}
          </div>
        ))}
      </div>
      <div className="fields fields-4">
        <Field label="Block time" value={fmtMinutes(block)} accent />
        <Field label="Air time" value={fmtMinutes(air)} />
        <Field label="Planned block" value={plan ? fmtMinutes(plan.times.block === null ? null : Math.round(plan.times.block / 60)) : '—'} />
        <Field label="Planned trip fuel" value={plan ? fmtNum(plan.fuel.trip) : '—'} unit={plan ? plan.units.toUpperCase() : undefined} />
      </div>

      <div className="log-form">
        <label className="to-field"><span>DATE (UTC)</span><input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} /></label>
        <label className="to-field"><span>CALLSIGN</span>{text('callsign')}</label>
        <label className="to-field"><span>AIRCRAFT</span>{text('aircraft', 4)}</label>
        <label className="to-field"><span>REGISTRATION</span>{text('reg')}</label>
        <label className="to-field"><span>FROM</span>{text('dep', 4)}</label>
        <label className="to-field"><span>TO</span>{text('arr', 4)}</label>
        <label className="to-field"><span>DISTANCE NM</span>{number('distance')}</label>
        <label className="to-field">
          <span>FUEL USED {draft.fuelUnit.toUpperCase()}</span>
          {number('fuelUsed', plan?.fuel.trip ? `plan ${plan.fuel.trip}` : undefined)}
        </label>
        <label className="to-field"><span>LANDING RATE FPM</span>{number('landingRate', 'e.g. 150')}</label>
        <label className="to-field">
          <span>NETWORK</span>
          <select value={draft.network} onChange={(e) => set('network', e.target.value)}>
            {NETWORKS.map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <label className="to-field log-remarks">
          <span>REMARKS</span>
          <input value={draft.remarks} placeholder="Weather, ATC, go-arounds…" onChange={(e) => set('remarks', e.target.value)} />
        </label>
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" onClick={onSave}>{editing ? 'Save changes' : 'Save to logbook'}</button>
        <button className="btn" onClick={onCancel}>{editing ? 'Cancel' : 'Discard'}</button>
        <span className="muted small">Times are UTC. Press “Now” at each stage, or type them in.</span>
      </div>
    </Panel>
  );
}

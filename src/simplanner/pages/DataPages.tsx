import { useEffect, useRef, useState } from 'react';
import { Field, NumberInput, Section, TextInput } from '../components/ui';
import type { Airport, Runway } from '../lib/airports';
import { DEFAULT_TEMPLATES, PLACEHOLDERS } from '../lib/fmc';
import { parseWaypointCsv, type CustomWaypoint } from '../lib/navdata';
import { DEFAULT_PROFILES, validateProfile, type AircraftProfile } from '../lib/profiles';
import { download, makeBackup, mergeBackup } from '../lib/store';
import { useApp } from '../state';

// ---------------- Airports ----------------

const blankAirport = (): Airport => ({ icao: '', name: '', lat: 0, lon: 0, elevationFt: 0, runways: [], source: 'custom' });

export function AirportsPage() {
  const app = useApp();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Airport | null>(null);
  const results = app.index.search(q);
  const ds = app.dataset;

  const saveAirport = (a: Airport) => {
    const icao = a.icao.trim().toUpperCase();
    const others = app.store.airports.filter((x) => x.icao.toUpperCase() !== icao);
    app.update('airports', [...others, { ...a, icao, source: 'custom' as const }].sort((x, y) => x.icao.localeCompare(y.icao)));
    setEditing(null);
  };

  return (
    <div>
      <Section title="Airport data">
        <p style={{ marginTop: 0 }}>
          {app.datasetLoading && !ds
            ? 'Loading…'
            : ds
              ? `${ds.airports.length.toLocaleString('en-US')} airports and ${(ds.navaids?.length ?? 0).toLocaleString('en-US')} VOR/NDB navaids (${ds.source}).`
              : 'Not available yet.'}
        </p>
        {app.datasetError && <div className="banner banner-warn">{app.datasetError}</div>}
        <p className="muted" style={{ marginBottom: 0 }}>
          Comes with the website: a monthly GitHub Action copies the free OurAirports data (public domain) into this site&apos;s GitHub
          repository. It is not navdata: no airways or procedures, and runway headings are true. Add or correct airports below; yours always win.
        </p>
      </Section>

      {editing && <AirportEditor airport={editing} onSave={saveAirport} onCancel={() => setEditing(null)} />}

      <Section title="My airports" actions={<button className="btn btn-primary" onClick={() => setEditing(blankAirport())}>Add airport</button>}>
        {!app.store.airports.length && <p className="muted">None yet. Add airports that are missing or wrong in OurAirports; yours always take priority.</p>}
        {app.store.airports.map((a) => (
          <div key={a.icao} className="list-item">
            <div>
              <b className="mono">{a.icao}</b> {a.name}
              <div className="muted">
                {a.lat.toFixed(4)}, {a.lon.toFixed(4)} · {a.elevationFt ?? '—'} ft · RWY {a.runways.map((r) => r.ident).join(' ') || '—'}
              </div>
            </div>
            <div className="row">
              <button className="btn btn-small" onClick={() => setEditing(a)}>Edit</button>
              <button className="btn btn-small btn-danger" onClick={() => confirm(`Delete ${a.icao}?`) && app.update('airports', app.store.airports.filter((x) => x !== a))}>Delete</button>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Search">
        <TextInput value={q} onChange={setQ} placeholder="ICAO, name or city" upper />
        {results.map((a) => (
          <div key={a.icao + a.source} className="list-item">
            <div>
              <b className="mono">{a.icao}</b> {a.name} {a.source === 'custom' && <b>(mine)</b>}
              <div className="muted">
                {[a.city, a.country].filter(Boolean).join(', ')} · {a.lat.toFixed(4)}, {a.lon.toFixed(4)} · {a.elevationFt ?? '—'} ft
              </div>
              <div className="muted">
                {a.runways.map((r) => `${r.ident} ${r.lengthFt ? r.lengthFt.toLocaleString('en-US') + ' ft' : ''} ${r.headingDeg !== null ? Math.round(r.headingDeg) + '°' : ''}`).join(' · ') || 'No runways'}
              </div>
            </div>
            {a.source !== 'custom' && <button className="btn btn-small" onClick={() => setEditing({ ...a, source: 'custom' })}>Copy to my airports</button>}
          </div>
        ))}
      </Section>
    </div>
  );
}

function AirportEditor({ airport, onSave, onCancel }: { airport: Airport; onSave: (a: Airport) => void; onCancel: () => void }) {
  const [a, setA] = useState<Airport>(airport);
  const set = <K extends keyof Airport>(k: K, v: Airport[K]) => setA({ ...a, [k]: v });
  const setRwy = (i: number, r: Partial<Runway>) => set('runways', a.runways.map((x, j) => (j === i ? { ...x, ...r } : x)));
  const valid = /^[A-Z0-9]{3,4}$/.test(a.icao.trim().toUpperCase()) && Math.abs(a.lat) <= 90 && Math.abs(a.lon) <= 180;
  return (
    <Section title={airport.icao ? `Edit ${airport.icao}` : 'Add airport'}>
      <div className="form-grid">
        <Field label="ICAO"><TextInput value={a.icao} onChange={(v) => set('icao', v)} upper maxLength={4} /></Field>
        <Field label="Name"><TextInput value={a.name} onChange={(v) => set('name', v)} /></Field>
        <Field label="Latitude" hint="Decimal, south negative"><NumberInput value={a.lat} onChange={(v) => set('lat', v)} min={-90} max={90} /></Field>
        <Field label="Longitude" hint="Decimal, west negative"><NumberInput value={a.lon} onChange={(v) => set('lon', v)} min={-180} max={180} /></Field>
        <Field label="Elevation (ft)"><NumberInput value={a.elevationFt ?? 0} onChange={(v) => set('elevationFt', v)} /></Field>
      </div>
      <h3 style={{ margin: '16px 0 8px' }}>Runways (one line per runway end)</h3>
      {a.runways.map((r, i) => (
        <div key={i} className="form-grid" style={{ marginBottom: 8 }}>
          <Field label="Ident"><TextInput value={r.ident} onChange={(v) => setRwy(i, { ident: v })} upper maxLength={4} /></Field>
          <Field label="Length (ft)"><NumberInput value={r.lengthFt ?? 0} onChange={(v) => setRwy(i, { lengthFt: v })} min={0} /></Field>
          <Field label="Heading (°)" hint="Note true or magnetic in the name"><NumberInput value={r.headingDeg ?? 0} onChange={(v) => setRwy(i, { headingDeg: v })} min={0} max={360} /></Field>
          <Field label=" "><button className="btn btn-danger" onClick={() => set('runways', a.runways.filter((_, j) => j !== i))}>Remove</button></Field>
        </div>
      ))}
      <div className="row">
        <button className="btn" onClick={() => set('runways', [...a.runways, { ident: '', lengthFt: null, headingDeg: null }])}>Add runway</button>
        <span className="grow" />
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!valid} onClick={() => onSave(a)}>Save airport</button>
      </div>
    </Section>
  );
}

// ---------------- Waypoints ----------------

export function WaypointsPage() {
  const app = useApp();
  const [draft, setDraft] = useState<CustomWaypoint>({ ident: '', lat: 0, lon: 0, name: '' });
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState('');
  const list = app.store.waypoints;
  const valid = /^[A-Z0-9]{1,12}$/.test(draft.ident) && Math.abs(draft.lat) <= 90 && Math.abs(draft.lon) <= 180;

  const add = () => {
    app.update('waypoints', [...list, { ...draft, ident: draft.ident.toUpperCase(), name: draft.name || undefined }]);
    setDraft({ ident: '', lat: 0, lon: 0, name: '' });
  };

  return (
    <div>
      <Section title="Add a waypoint">
        <div className="form-grid">
          <Field label="Ident"><TextInput value={draft.ident} onChange={(v) => setDraft({ ...draft, ident: v.trim() })} upper maxLength={12} /></Field>
          <Field label="Latitude" hint="Decimal, south negative"><NumberInput value={draft.lat} onChange={(v) => setDraft({ ...draft, lat: v })} min={-90} max={90} /></Field>
          <Field label="Longitude" hint="Decimal, west negative"><NumberInput value={draft.lon} onChange={(v) => setDraft({ ...draft, lon: v })} min={-180} max={180} /></Field>
          <Field label="Note"><TextInput value={draft.name ?? ''} onChange={(v) => setDraft({ ...draft, name: v })} /></Field>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" disabled={!valid} onClick={add}>Add waypoint</button>
          <span className="muted">The same ident can exist more than once; the route uses the nearest.</span>
        </div>
      </Section>

      <Section title={`My waypoints (${list.length})`} actions={list.length ? <button className="btn btn-small" onClick={() => download('waypoints.csv', ['ident,lat,lon,name', ...list.map((w) => `${w.ident},${w.lat},${w.lon},${(w.name ?? '').replace(/,/g, ' ')}`)].join('\n'), 'text/csv')}>Export CSV</button> : undefined}>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Ident</th><th className="num">Lat</th><th className="num">Lon</th><th>Note</th><th /></tr></thead>
            <tbody>
              {list.map((w, i) => (
                <tr key={i}>
                  <td className="mono">{w.ident}</td>
                  <td className="num">{w.lat.toFixed(5)}</td>
                  <td className="num">{w.lon.toFixed(5)}</td>
                  <td>{w.name}</td>
                  <td><button className="btn btn-small btn-danger" onClick={() => app.update('waypoints', list.filter((_, j) => j !== i))}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Import many (CSV)">
        <p className="muted" style={{ marginTop: 0 }}>One per line: <code>IDENT,LAT,LON,NOTE</code> in decimal degrees. This is how to plug in waypoint data from your own legally obtained sources.</p>
        <textarea className="input" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'WPT1,39.5,118.0,example\nWPT2,37.0,126.0'} />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={() => {
            const { waypoints, errors } = parseWaypointCsv(csv);
            app.update('waypoints', [...list, ...waypoints]);
            setMsg(`Added ${waypoints.length}.${errors.length ? ` Skipped ${errors.length} unreadable line(s): ${errors.slice(0, 3).join('; ')}` : ''}`);
            if (!errors.length) setCsv('');
          }}>Import</button>
          {msg && <span>{msg}</span>}
        </div>
      </Section>
    </div>
  );
}

// ---------------- Aircraft profiles and FMC templates ----------------

export function AircraftPage() {
  const app = useApp();
  const [id, setId] = useState(app.inputs.profileId);
  const profile = app.profiles.find((p) => p.id === id) ?? app.profiles[0];
  const [text, setText] = useState(JSON.stringify(profile, null, 2));
  const isDefault = DEFAULT_PROFILES.some((p) => p.id === profile.id);
  const edited = !!app.store.profiles[profile.id];
  useEffect(() => setText(JSON.stringify(profile, null, 2)), [profile]);

  let parsed: unknown = null;
  let errors: string[] = [];
  try {
    parsed = JSON.parse(text);
    errors = validateProfile(parsed);
  } catch (e) {
    errors = [`Not valid JSON: ${(e as Error).message}`];
  }
  const p = parsed as AircraftProfile;
  const idClash = !errors.length && p.id !== profile.id && app.profiles.some((x) => x.id === p.id);
  if (idClash) errors.push(`Another profile already uses the id "${p.id}".`);

  const save = () => {
    const next = { ...app.store.profiles };
    if (p.id !== profile.id && !isDefault) delete next[profile.id];
    next[p.id] = p;
    app.update('profiles', next);
    setId(p.id);
  };

  const [tplId, setTplId] = useState(profile.fmcTemplate);
  const [tplText, setTplText] = useState(app.templates[tplId] ?? '');
  useEffect(() => setTplText(app.templates[tplId] ?? ''), [tplId, app.templates]);
  const tplIds = [...new Set([...Object.keys(DEFAULT_TEMPLATES), ...Object.keys(app.store.templates)])].sort();

  return (
    <div>
      <Section title="Aircraft profile">
        <div className="row" style={{ marginBottom: 12 }}>
          <select className="input" style={{ maxWidth: 420 }} value={profile.id} onChange={(e) => setId(e.target.value)}>
            {app.profiles.map((x) => <option key={x.id} value={x.id}>{x.name}{x.verified ? '' : ' (placeholder values)'}</option>)}
          </select>
          <button className="btn" onClick={() => {
            const copy = { ...profile, id: `${profile.id}-copy-${Date.now().toString(36).slice(-4)}`, name: `${profile.name} (copy)` };
            app.update('profiles', { ...app.store.profiles, [copy.id]: copy });
            setId(copy.id);
          }}>Duplicate</button>
        </div>
        {!profile.verified && <div className="banner banner-warn">{profile.placeholderNotice}</div>}
        <p className="muted" style={{ marginTop: 0 }}>
          Weights in <b>{profile.units}</b>. Burn figures are per hour. Set <code>"verified": true</code> once you have checked every number
          against the aircraft&apos;s manual or in-sim performance tool. <code>variants</code> overrides the performance block for engine options.
        </p>
        <textarea className="input code" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        {errors.length > 0 && <ul className="warnings">{errors.map((e) => <li key={e} className="danger">{e}</li>)}</ul>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" disabled={errors.length > 0} onClick={save}>Save profile</button>
          {isDefault && edited && <button className="btn" onClick={() => { const next = { ...app.store.profiles }; delete next[profile.id]; app.update('profiles', next); }}>Reset to shipped placeholder</button>}
          {!isDefault && <button className="btn btn-danger" onClick={() => { if (!confirm(`Delete ${profile.name}?`)) return; const next = { ...app.store.profiles }; delete next[profile.id]; app.update('profiles', next); setId(DEFAULT_PROFILES[0].id); }}>Delete profile</button>}
          <button className="btn" onClick={() => download(`${profile.id}.json`, JSON.stringify(profile, null, 2), 'application/json')}>Download JSON</button>
        </div>
      </Section>

      <Section title="FMC cheat-sheet template">
        <div className="row" style={{ marginBottom: 12 }}>
          <select className="input" style={{ maxWidth: 320 }} value={tplId} onChange={(e) => setTplId(e.target.value)}>
            {tplIds.map((t) => <option key={t}>{t}</option>)}
          </select>
          <span className="muted">Used by: {app.profiles.filter((x) => x.fmcTemplate === tplId).map((x) => x.name).join(', ') || 'no profile'}</span>
        </div>
        <textarea className="input code" value={tplText} onChange={(e) => setTplText(e.target.value)} spellCheck={false} />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={() => app.update('templates', { ...app.store.templates, [tplId]: tplText })}>Save template</button>
          {app.store.templates[tplId] !== undefined && DEFAULT_TEMPLATES[tplId] && (
            <button className="btn" onClick={() => { const next = { ...app.store.templates }; delete next[tplId]; app.update('templates', next); }}>Reset to shipped template</button>
          )}
          <button className="btn" onClick={() => download(`${tplId}.txt`, tplText, 'text/plain')}>Download .txt</button>
        </div>
        <details>
          <summary>Placeholders you can use</summary>
          <table className="data">
            <tbody>{Object.entries(PLACEHOLDERS).map(([k, v]) => <tr key={k}><td className="mono">{`{${k}}`}</td><td>{v}</td></tr>)}</tbody>
          </table>
        </details>
      </Section>
    </div>
  );
}

// ---------------- Saved flights ----------------

export function FlightsPage() {
  const app = useApp();
  const flights = app.store.flights;
  if (!flights.length) return <Section title="Saved flights"><p className="muted">No flights yet. Each flight you generate on the Dispatch page is saved here.</p></Section>;
  return (
    <Section title="Saved flights">
      {flights.map((f) => {
        const p = app.profiles.find((x) => x.id === f.inputs.profileId);
        return (
          <div key={f.id} className="list-item">
            <div>
              <b className="mono">{f.inputs.dep} → {f.inputs.arr}</b> {f.inputs.flightNo}
              <div className="muted">{p?.name ?? f.inputs.profileId} · FL{f.inputs.cruiseFl} · saved {new Date(f.savedAt).toLocaleString()}</div>
              <div className="mono muted" style={{ wordBreak: 'break-word' }}>{f.inputs.route}</div>
            </div>
            <div className="row">
              <button className="btn btn-primary btn-small" onClick={() => { app.setInputs(f.inputs); location.hash = '#ofp'; }}>Open</button>
              <button className="btn btn-small" onClick={() => { app.setInputs(f.inputs); location.hash = '#dispatch'; }}>Edit</button>
              <button className="btn btn-small btn-danger" onClick={() => confirm('Delete this flight?') && app.update('flights', flights.filter((x) => x.id !== f.id))}>Delete</button>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

// ---------------- Settings / backup ----------------

export function SettingsPage() {
  const app = useApp();
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const s = app.store;
  return (
    <div>
      <Section title="Backup">
        <p style={{ marginTop: 0 }}>
          Everything you create is stored only in this browser on this device: {s.flights.length} flights, {s.airports.length} airports,{' '}
          {s.waypoints.length} waypoints, {Object.keys(s.profiles).length} edited profiles, {Object.keys(s.templates).length} edited templates.
          Clearing browser data deletes it, so download a backup now and then.
        </p>
        <div className="row">
          <button className="btn btn-primary" onClick={() => download(`simplanner-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(makeBackup(s), null, 2), 'application/json')}>Download backup</button>
          <button className="btn" onClick={() => file.current?.click()}>Restore from backup…</button>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const { next, summary } = mergeBackup(s, await f.text());
              app.replaceStore(next);
              setMsg(`Restored: ${summary}. Items with the same name were replaced.`);
            } catch (err) {
              setMsg((err as Error).message);
            }
          }} />
        </div>
        {msg && <p className="banner banner-info" style={{ marginTop: 12 }}>{msg}</p>}
        <p className="muted">Airport data comes with the website, so it isn't in the backup.</p>
      </Section>

      <Section title="Using it on other devices">
        <p style={{ marginTop: 0 }}>
          SimPlanner is a website, so any phone, tablet or PC can open it, but each device keeps its own data. To move one flight, use
          “Copy share link” on the OFP page and open the link on the other device; it brings the custom airports and waypoints that flight
          uses. To move everything, use the backup file.
        </p>
        <p>
          The <b>kiosk link</b> is a read-only, big-text briefing that needs no saved data. Whether it opens in a sim aircraft&apos;s EFB browser
          is <b>untested</b>: treat it as an experiment.
        </p>
      </Section>

      <Section title="About the numbers">
        <ul>
          <li>Aircraft profiles ship with PLACEHOLDER values. Check every number and set <code>verified</code> to true.</li>
          <li>FMC page names and button labels are UNVERIFIED until you confirm them and edit the template.</li>
          <li>Fuel and weights are estimates from a simple model (formulas shown on the Plan page). Not certified data. Simulation only.</li>
          <li>No navdata is included. Airways are flown direct between fixes; SIDs and STARs are not modelled.</li>
        </ul>
      </Section>
    </div>
  );
}

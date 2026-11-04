import { useEffect, useState } from 'react';
import { Panel, Tabs } from './ui';
import { fmtNum, nmToKm } from '../lib/format';
import type { Airport, FlightPlan } from '../lib/simbrief';
import {
  APPROACH_NM, BEARING_STEP, RADIUS_NM, RING_STEP_NM, cacheTerrain, cachedTerrain, compass, glidePathFt, loadTerrain, mToFt, summarize,
  type GeoFeature, type TerrainData, type TerrainPoint,
} from '../lib/terrain';

type Which = 'destination' | 'origin' | 'alternate';

const ft = (v: number) => `${fmtNum(v)} ft`;
const ftM = (v: number) => `${fmtNum(v)} ft · ${fmtNum(v / 3.28084)} m`;
const where = (p: { distNm: number; brg: number }) =>
  `${fmtNum(p.distNm, p.distNm < 10 ? 1 : 0)} nm / ${fmtNum(nmToKm(p.distNm))} km ${compass(p.brg)} (${String(Math.round(p.brg)).padStart(3, '0')}°)`;

/** Colour bands by height above the field. */
const BANDS: { above: number; color: string; label: string }[] = [
  { above: -Infinity, color: '#30b158', label: 'At or below field' },
  { above: 0, color: '#9ed36a', label: 'Up to 1,000 ft above' },
  { above: 1000, color: '#ffd60a', label: '1,000–2,000 ft' },
  { above: 2000, color: '#ff9f0a', label: '2,000–4,000 ft' },
  { above: 4000, color: '#ff453a', label: '4,000–7,000 ft' },
  { above: 7000, color: '#a01d2f', label: 'More than 7,000 ft above' },
];
const bandColor = (aboveFt: number) => [...BANDS].reverse().find((b) => aboveFt > b.above)?.color ?? BANDS[0].color;

/** Terrain and geography around the arrival (or departure / alternate), shown on the Flight page. */
export function TerrainSection({ plan }: { plan: FlightPlan }) {
  const [which, setWhich] = useState<Which>('destination');
  const [data, setData] = useState<TerrainData | null>(null);
  const [status, setStatus] = useState<{ loading: boolean; error: string }>({ loading: false, error: '' });
  const [reload, setReload] = useState(0);

  const apt: Airport | undefined = which === 'origin' ? plan.origin : which === 'alternate' ? plan.alternates[0] : plan.destination;
  const key = apt ? `${apt.icao}/${apt.runway}/${apt.lat}/${apt.lon}` : '';

  useEffect(() => {
    if (!apt || apt.lat === null || apt.lon === null) return;
    const cached = reload ? null : cachedTerrain(apt.icao, apt.runway);
    if (cached) {
      setData(cached);
      setStatus({ loading: false, error: '' });
      return;
    }
    let cancelled = false;
    setData(null);
    setStatus({ loading: true, error: '' });
    loadTerrain({ icao: apt.icao, lat: apt.lat, lon: apt.lon, elevation: apt.elevation, runway: apt.runway })
      .then((d) => {
        if (cancelled) return;
        cacheTerrain(d);
        setData(d);
        setStatus({ loading: false, error: '' });
      })
      .catch((e: Error) => !cancelled && setStatus({ loading: false, error: `${e.message} Check your internet connection and try again.` }));
    return () => {
      cancelled = true;
    };
    // Reload only when the airport or runway changes, or on request.
  }, [key, reload]);

  const tabs: { id: Which; label: string }[] = [
    { id: 'destination', label: `Arrival ${plan.destination.icao}` },
    { id: 'origin', label: `Departure ${plan.origin.icao}` },
    ...(plan.alternates[0] ? [{ id: 'alternate' as const, label: `Alternate ${plan.alternates[0].icao}` }] : []),
  ];
  const s = data && summarize(data);

  return (
    <section className="terrain" id="terrain">
      <div className="terrain-head">
        <h2>Terrain and geography</h2>
        <Tabs tabs={tabs} value={which} onChange={setWhich} />
        <button className="btn btn-small" disabled={status.loading} onClick={() => setReload((n) => n + 1)}>{status.loading ? 'Loading…' : 'Reload'}</button>
      </div>

      {apt && (apt.lat === null || apt.lon === null) && <div className="alert">The flight plan has no position for {apt.icao}, so its terrain can&apos;t be looked up.</div>}
      {status.error && <div className="alert">{status.error}</div>}
      {status.loading && <div className="empty"><p>Looking up terrain around {apt?.icao}…</p><p className="muted">About 400 ground heights and the named peaks nearby.</p></div>}

      {data && s && (
        <>
          <div className="grid terrain-summary">
            <Panel title="Field elevation">
              <div className="field-value">{ft(data.fieldElevFt)}</div>
              <div className="muted small">{fmtNum(data.fieldElevFt / 3.28084)} m · {data.icao}{data.runway ? ` runway ${data.runway}` : ''}</div>
            </Panel>
            <HighPanel title="Highest within 10 nm" p={s.within10} field={data.fieldElevFt} />
            <HighPanel title={`Highest within ${RADIUS_NM} nm`} p={s.within25} field={data.fieldElevFt} />
          </div>

          <div className="grid grid-2">
            <Panel title={`Terrain around ${data.icao}`} right={<span className="muted small">{RADIUS_NM} nm / {fmtNum(nmToKm(RADIUS_NM))} km, north up</span>}>
              <TerrainRose d={data} peaks={s.peaks.slice(0, 6)} />
              <div className="terrain-legend">
                {BANDS.map((b) => <span key={b.label}><i style={{ background: b.color }} />{b.label}</span>)}
              </div>
            </Panel>
            <Panel title="Highest terrain by quadrant" right={<span className="muted small">within {RADIUS_NM} nm</span>}>
              <table className="kv">
                <tbody>
                  {s.quadrants.map((q) => (
                    <tr key={q.name}>
                      <td>{q.name}<br /><small>{q.highest.distNm > 0 ? `${where(q.highest)}${q.highest.name ? ` · ${q.highest.name}` : ''}` : 'Nothing higher than the field'}</small></td>
                      <td>{ft(q.highest.elevFt)}<br /><small>+1,000 ft: {ft(q.plus1000)}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="muted small">
                “+1,000 ft” is the highest sampled ground plus 1,000 ft, rounded up. It is <b>not</b> the chart MSA: no obstacles, and the ground is
                only sampled every {BEARING_STEP}° and {RING_STEP_NM} nm. Use the MSA on your approach chart.
              </div>
            </Panel>
          </div>

          {data.runwayHdg !== null && data.approach.length > 0 && (
            <Panel title={`Final approach, runway ${data.runway}`} right={s.approach && (
              <span className={`small ${s.approach.minClearanceFt < 500 ? 'warn' : 'muted'}`}>
                Least ground clearance on a 3° path (3–{APPROACH_NM} nm): {ft(Math.round(s.approach.minClearanceFt))} at {s.approach.atNm} nm
              </span>
            )}>
              <ApproachProfile d={data} />
              <div className="muted small">
                Ground along the extended centreline from {APPROACH_NM} nm out, against a 3° glide path from the field elevation. Approximate: the
                course comes from the runway number (magnetic, drawn as true) and starts at the airport reference point, not the threshold.
              </div>
            </Panel>
          )}

          <div className="grid grid-2">
            <Panel title="Peaks above the field" right={<span className="muted small">within {RADIUS_NM} nm</span>}>
              {s.peaks.length ? <FeatureTable rows={s.peaks.slice(0, 12)} showEle field={data.fieldElevFt} /> : <div className="muted small">{data.featuresError ? 'Not available right now (see below).' : 'None mapped in OpenStreetMap.'}</div>}
            </Panel>
            <Panel title="Passes, lakes and towns">
              {(['pass', 'water', 'town'] as const).map((k) => {
                const rows = data.features.filter((f) => f.kind === k).sort((a, b) => a.distNm - b.distNm).slice(0, 6);
                return rows.length ? (
                  <div key={k}>
                    <div className="field-label">{{ pass: 'Mountain passes', water: 'Lakes and reservoirs', town: 'Towns and cities' }[k]}</div>
                    <FeatureTable rows={rows} showEle={k === 'pass'} field={data.fieldElevFt} />
                  </div>
                ) : null;
              })}
              {!data.features.some((f) => f.kind !== 'peak' && f.kind !== 'volcano') && <div className="muted small">{data.featuresError ? 'Not available right now (see below).' : 'None mapped nearby.'}</div>}
            </Panel>
          </div>

          {data.featuresError && <div className="alert">Peaks and places couldn&apos;t be loaded: {data.featuresError} The terrain above is complete; press Reload to try again.</div>}

          <p className="note">
            For situational awareness in the sim, not for navigation. Ground heights: Copernicus DEM (90 m) via Open-Meteo, sampled every{' '}
            {BEARING_STEP}° and {RING_STEP_NM} nm, so narrow peaks between samples can be missed; obstacles such as masts and buildings are not included.
            Peaks, passes, lakes and towns: © OpenStreetMap contributors (ODbL), heights as mapped. Looked up {new Date(data.fetchedAt).toUTCString().replace(' GMT', 'Z')} and kept
            in this browser for 30 days.
          </p>
        </>
      )}
    </section>
  );
}

function HighPanel({ title, p, field }: { title: string; p: TerrainPoint; field: number }) {
  const above = p.elevFt - field;
  return (
    <Panel title={title}>
      <div className="field-value">{ft(p.elevFt)} <small className={above > 2000 ? 'warn' : ''}>{above > 0 ? `+${fmtNum(above)} ft above field` : 'at or below field'}</small></div>
      <div className="muted small">{fmtNum(p.elevFt / 3.28084)} m{p.distNm > 0 ? ` · ${where(p)}` : ''}{p.name ? ` · ${p.name}` : ''}</div>
    </Panel>
  );
}

function FeatureTable({ rows, showEle, field }: { rows: GeoFeature[]; showEle: boolean; field: number }) {
  return (
    <table className="kv">
      <tbody>
        {rows.map((f, i) => (
          <tr key={`${f.name}-${i}`}>
            <td>{f.name}<br /><small>{where(f)}</small></td>
            <td>
              {showEle && f.eleM !== null ? (
                <>{ftM(mToFt(f.eleM))}<br /><small>{mToFt(f.eleM) > field ? `+${fmtNum(mToFt(f.eleM) - field)} ft above field` : ''}</small></>
              ) : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Top-down terrain map: one coloured cell per sample, north up, with range rings, runway, approach and peaks. */
function TerrainRose({ d, peaks }: { d: TerrainData; peaks: GeoFeature[] }) {
  const R = 150; // px for 25 nm
  const k = R / RADIUS_NM;
  const xy = (nm: number, brg: number) => [nm * k * Math.sin((brg * Math.PI) / 180), -nm * k * Math.cos((brg * Math.PI) / 180)] as const;
  const cell = (ri: number, bi: number) => {
    const r0 = ri * RING_STEP_NM;
    const r1 = r0 + RING_STEP_NM;
    const a0 = bi * BEARING_STEP - BEARING_STEP / 2;
    const a1 = a0 + BEARING_STEP;
    const [x1, y1] = xy(r0, a0);
    const [x2, y2] = xy(r1, a0);
    const [x3, y3] = xy(r1, a1);
    const [x4, y4] = xy(r0, a1);
    return `M${x1},${y1}L${x2},${y2}A${r1 * k},${r1 * k} 0 0 1 ${x3},${y3}L${x4},${y4}A${r0 * k},${r0 * k} 0 0 0 ${x1},${y1}Z`;
  };
  const rwy = d.runwayHdg;
  return (
    <svg className="terrain-rose" viewBox="-175 -175 350 350" role="img" aria-label={`Terrain within ${RADIUS_NM} nm of ${d.icao}`}>
      {d.grid.map((row, ri) => row.map((h, bi) => <path key={`${ri}-${bi}`} d={cell(ri, bi)} fill={bandColor(h - d.fieldElevFt)} />))}
      {[5, 10, 15, 20, 25].map((nm) => (
        <g key={nm}>
          <circle r={nm * k} className="ring" />
          <text x={3} y={-nm * k + 11} className="ring-label">{nm}</text>
        </g>
      ))}
      {(['N', 'E', 'S', 'W'] as const).map((c, i) => {
        const [x, y] = xy(RADIUS_NM + 2.4, i * 90);
        return <text key={c} x={x} y={y + 4} className="compass-label" textAnchor="middle">{c}</text>;
      })}
      {rwy !== null && (
        <>
          <line x1={xy(APPROACH_NM, (rwy + 180) % 360)[0]} y1={xy(APPROACH_NM, (rwy + 180) % 360)[1]} x2={0} y2={0} className="approach-line" />
          <line x1={xy(1.2, (rwy + 180) % 360)[0]} y1={xy(1.2, (rwy + 180) % 360)[1]} x2={xy(1.2, rwy)[0]} y2={xy(1.2, rwy)[1]} className="runway-line" />
        </>
      )}
      <circle r={3.5} className="airport-dot" />
      {peaks.map((p, i) => {
        const [x, y] = xy(Math.min(p.distNm, RADIUS_NM), p.brg);
        return (
          <g key={i}>
            <path d={`M${x},${y - 6}L${x + 5},${y + 3}L${x - 5},${y + 3}Z`} className="peak-mark" />
            <text x={x + 7} y={y + 3} className="peak-label">{fmtNum(mToFt(p.eleM!))}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Side view of the final approach: ground vs a 3° glide path. */
function ApproachProfile({ d }: { d: TerrainData }) {
  const W = 640;
  const H = 210;
  const pad = { l: 58, r: 12, t: 12, b: 26 };
  const n = d.approach.length - 1;
  const gp = (nm: number) => d.fieldElevFt + glidePathFt(nm);
  const lo = Math.min(...d.approach, d.fieldElevFt) - 300;
  const hi = Math.max(...d.approach, gp(n)) + 500;
  const x = (nm: number) => pad.l + ((n - nm) / n) * (W - pad.l - pad.r); // far left, field right
  const y = (alt: number) => pad.t + (1 - (alt - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ground = `M${x(n)},${y(lo)} ` + d.approach.map((a, nm) => `L${x(nm)},${y(a)}`).reverse().join(' ') + ` L${x(0)},${y(lo)} Z`;
  const step = Math.max(500, Math.ceil((hi - lo) / 4 / 500) * 500);
  const ticks: number[] = [];
  for (let a = Math.ceil(lo / step) * step; a <= hi; a += step) ticks.push(a);
  return (
    <svg className="approach-profile" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Approach terrain profile">
      {ticks.map((a) => (
        <g key={a}>
          <line x1={pad.l} x2={W - pad.r} y1={y(a)} y2={y(a)} className="grid-line" />
          <text x={pad.l - 6} y={y(a) + 4} textAnchor="end" className="axis-label">{fmtNum(a)}</text>
        </g>
      ))}
      {[0, 5, 10, 15].filter((nm) => nm <= n).map((nm) => (
        <text key={nm} x={x(nm)} y={H - 8} textAnchor="middle" className="axis-label">{nm === 0 ? `${d.icao}` : `${nm} nm`}</text>
      ))}
      <path d={ground} className="ground" />
      <line x1={x(n)} y1={y(gp(n))} x2={x(0)} y2={y(d.fieldElevFt)} className="glide-path" />
      <text x={x(n) + 4} y={y(gp(n)) - 6} className="axis-label">3° path</text>
    </svg>
  );
}

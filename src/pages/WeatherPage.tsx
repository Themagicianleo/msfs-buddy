import { useCallback, useEffect, useMemo, useState } from 'react';
import { CatBadge, Field } from '../components/ui';
import { Icon } from '../components/Icon';
import { ago } from '../lib/format';
import { describeWeather, fetchWeather, formatTaf, parseMetar, runwayHeading, windComponents, type WeatherReports } from '../lib/metar';
import type { FlightPlan } from '../lib/simbrief';
import { usePersistent, type Settings } from '../lib/storage';

interface Station {
  icao: string;
  role: string;
  name: string;
  runway: string;
  ofpMetar: string;
  ofpTaf: string;
}

const COVER: Record<string, string> = { FEW: 'Few', SCT: 'Scattered', BKN: 'Broken', OVC: 'Overcast', VV: 'Vertical vis' };

export function WeatherPage({ plan, settings }: { plan: FlightPlan | null; settings: Settings }) {
  const [extra, setExtra] = usePersistent<string[]>('wx.extra', []);
  const [input, setInput] = useState('');
  const [reports, setReports] = useState<WeatherReports | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const stations = useMemo<Station[]>(() => {
    const list: Station[] = [];
    if (plan) {
      const add = (role: string, a: FlightPlan['origin']) =>
        a.icao && list.push({ icao: a.icao, role, name: a.name, runway: a.runway, ofpMetar: a.metar, ofpTaf: a.taf });
      add('DEP', plan.origin);
      add('ARR', plan.destination);
      plan.alternates.forEach((a) => add('ALTN', a));
    }
    for (const icao of extra) {
      if (!list.some((s) => s.icao === icao)) list.push({ icao, role: '', name: '', runway: '', ofpMetar: '', ofpTaf: '' });
    }
    return list;
  }, [plan, extra]);

  const ids = stations.map((s) => s.icao).join(',');

  const refresh = useCallback(async () => {
    if (!ids) return;
    setLoading(true);
    setError('');
    try {
      const r = await fetchWeather(ids.split(','));
      setReports(r);
      setFetchedAt(new Date());
      if (!Object.keys(r.metar).length) setError('Live weather unavailable — showing reports from the OFP where possible.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ids]);

  useEffect(() => {
    void refresh();
    if (!settings.autoRefreshWx) return;
    const t = setInterval(() => void refresh(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [refresh, settings.autoRefreshWx]);

  const addStation = (e: React.FormEvent) => {
    e.preventDefault();
    const icao = input.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(icao) && !extra.includes(icao)) setExtra([...extra, icao]);
    setInput('');
  };

  return (
    <div className="page">
      <div className="page-toolbar">
        <form className="search" onSubmit={addStation}>
          <Icon name="search" size={18} />
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add airport" maxLength={4} />
          <button className="btn btn-small" type="submit">Add</button>
        </form>
        <span className="muted small push-right">
          {reports?.source && `Source: ${reports.source} · `}
          {fetchedAt && `Updated ${ago(fetchedAt)}`}
        </span>
        <button className="btn btn-small" onClick={refresh} disabled={loading}>
          {loading ? 'Updating…' : 'Refresh'}
        </button>
      </div>
      {error && <div className="alert">{error}</div>}
      {!stations.length && <div className="empty">Load a flight plan or add an airport ICAO above to see its METAR and TAF.</div>}

      <div className="wx-list">
        {stations.map((st) => (
          <StationCard
            key={st.icao}
            station={st}
            metar={reports?.metar[st.icao]}
            taf={reports?.taf[st.icao]}
            onRemove={st.role ? undefined : () => setExtra(extra.filter((x) => x !== st.icao))}
          />
        ))}
      </div>
    </div>
  );
}

function StationCard({ station, metar, taf, onRemove }: { station: Station; metar?: string; taf?: string; onRemove?: () => void }) {
  const rawMetar = metar || station.ofpMetar;
  const rawTaf = taf || station.ofpTaf;
  const fromOfp = !metar && !!station.ofpMetar;
  const m = rawMetar ? parseMetar(rawMetar) : null;
  const [rwy, setRwy] = useState(station.runway);

  const hdg = runwayHeading(rwy);
  const comps = m?.wind && m.wind.dir !== null && hdg !== null ? windComponents(m.wind.dir, m.wind.gust ?? m.wind.speed, hdg) : null;
  const spreadLow = m && m.temp !== null && m.dewpoint !== null && m.temp - m.dewpoint <= 2;

  return (
    <section className="card wx-card">
      <div className="wx-head">
        {station.role && <span className={`role role-${station.role.toLowerCase()}`}>{station.role}</span>}
        <span className="wx-icao">{station.icao}</span>
        <span className="muted wx-name">{station.name}</span>
        {m && <CatBadge cat={m.category} />}
        {m?.time && <span className="muted small">{ago(m.time)}</span>}
        {fromOfp && <span className="badge">From OFP</span>}
        <span className="push-right" />
        <a className="btn btn-small" href={`https://chartfox.org/${station.icao}`} target="_blank" rel="noreferrer">Charts</a>
        {onRemove && <button className="btn btn-small" onClick={onRemove}>Remove</button>}
      </div>

      {m ? (
        <>
          <div className="raw mono">{m.raw}</div>
          <div className="fields fields-6">
            <Field
              label="Wind"
              accent
              value={
                !m.wind
                  ? '—'
                  : m.wind.speed === 0
                    ? 'Calm'
                    : `${m.wind.variable ? 'VRB' : String(m.wind.dir).padStart(3, '0') + '°'} ${m.wind.speed}${m.wind.gust ? 'G' + m.wind.gust : ''} ${m.wind.unit}`
              }
            />
            <Field label="Visibility" value={m.visibility?.text ?? '—'} />
            <Field label="Ceiling" value={m.cavok ? 'CAVOK' : m.ceiling !== null ? `${m.ceiling.toLocaleString()} ft` : 'None'} />
            <Field label="Temp / Dew" value={m.temp !== null ? `${m.temp}° / ${m.dewpoint ?? '—'}°` : '—'} />
            <Field label="QNH" accent value={m.qnh ? `${m.qnh.hpa} hPa` : '—'} unit={m.qnh ? `${m.qnh.inhg.toFixed(2)} inHg` : undefined} />
            <Field
              label={`RWY ${rwy || '—'} wind`}
              value={
                <span className="rwy-wind">
                  {comps ? (
                    <>
                      <span className={comps.headwind < 0 ? 'warn' : ''}>{comps.headwind < 0 ? 'TL' : 'HD'} {Math.abs(comps.headwind)}</span>
                      <span className={Math.abs(comps.crosswind) > 20 ? 'warn' : ''}>XW {Math.abs(comps.crosswind)}{comps.crosswind > 0 ? 'R' : comps.crosswind < 0 ? 'L' : ''}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </span>
              }
            />
          </div>
          <div className="wx-details">
            {m.wind?.from !== undefined && <span>Wind varying {m.wind.from}°–{m.wind.to}°</span>}
            {m.weather.length > 0 && <span>Weather: <b>{m.weather.map(describeWeather).join(', ')}</b></span>}
            {m.clouds.length > 0 && (
              <span>Clouds: {m.clouds.map((c) => `${COVER[c.cover] ?? c.cover} ${c.base !== null ? c.base.toLocaleString() + ' ft' : ''}${c.type ? ' ' + c.type : ''}`).join(', ')}</span>
            )}
            {m.rvr.length > 0 && <span>RVR: {m.rvr.join(' ')}</span>}
            {m.trend && <span>Trend: {m.trend}</span>}
            {spreadLow && <span className="warn">Temp/dew spread ≤ 2° — fog/low cloud possible</span>}
            <label className="rwy-input">
              Runway
              <input value={rwy} onChange={(e) => setRwy(e.target.value.toUpperCase())} maxLength={4} placeholder="27L" />
            </label>
          </div>
        </>
      ) : (
        <div className="muted">No METAR available for {station.icao}.</div>
      )}

      {rawTaf && (
        <details className="taf" open>
          <summary>TAF</summary>
          <pre className="raw mono pre">{formatTaf(rawTaf)}</pre>
        </details>
      )}
    </section>
  );
}

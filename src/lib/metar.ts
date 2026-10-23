// METAR / TAF fetching and a small METAR decoder.
//
// Live reports come from aviationweather.gov, with VATSIM's METAR service as a
// fallback. MSFS live weather is driven by the same real-world reports.

import { apiUrl } from './http';

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNK';

export interface CloudLayer {
  cover: string; // FEW, SCT, BKN, OVC, VV
  base: number | null; // ft AGL
  type: string; // CB, TCU or ''
}

export interface DecodedMetar {
  raw: string;
  station: string;
  time: Date | null;
  auto: boolean;
  wind: { dir: number | null; variable: boolean; speed: number; gust: number | null; unit: 'KT' | 'MPS'; from?: number; to?: number } | null;
  visibility: { meters: number | null; text: string } | null;
  cavok: boolean;
  weather: string[];
  clouds: CloudLayer[];
  ceiling: number | null;
  temp: number | null;
  dewpoint: number | null;
  qnh: { hpa: number; inhg: number } | null;
  rvr: string[];
  trend: string;
  remarks: string;
  category: FlightCategory;
}

const WX_DESCRIPTIONS: Record<string, string> = {
  MI: 'shallow', BC: 'patches', PR: 'partial', DR: 'drifting', BL: 'blowing', SH: 'showers', TS: 'thunderstorm', FZ: 'freezing',
  DZ: 'drizzle', RA: 'rain', SN: 'snow', SG: 'snow grains', IC: 'ice crystals', PL: 'ice pellets', GR: 'hail', GS: 'small hail',
  UP: 'unknown precip', BR: 'mist', FG: 'fog', FU: 'smoke', VA: 'volcanic ash', DU: 'dust', SA: 'sand', HZ: 'haze', PY: 'spray',
  PO: 'dust whirls', SQ: 'squalls', FC: 'funnel cloud', SS: 'sandstorm', DS: 'duststorm',
};

const WX_RE = /^(\+|-|VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?((DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+)$/;

export function describeWeather(code: string): string {
  const m = code.match(WX_RE);
  if (!m) return code;
  const parts: string[] = [];
  if (m[1] === '+') parts.push('heavy');
  if (m[1] === '-') parts.push('light');
  if (m[2]) parts.push(WX_DESCRIPTIONS[m[2]]);
  const phen = m[3].match(/.{2}/g) ?? [];
  parts.push(phen.map((p) => WX_DESCRIPTIONS[p] ?? p).join(' and '));
  if (m[1] === 'VC') parts.push('in vicinity');
  return parts.join(' ');
}

function parseFraction(s: string): number {
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return a / b;
  }
  return Number(s);
}

export function flightCategory(visMeters: number | null, ceiling: number | null): FlightCategory {
  if (visMeters === null && ceiling === null) return 'UNK';
  const sm = visMeters === null ? Infinity : visMeters / 1609.34;
  const ceil = ceiling ?? Infinity;
  if (ceil < 500 || sm < 1) return 'LIFR';
  if (ceil < 1000 || sm < 3) return 'IFR';
  if (ceil <= 3000 || sm <= 5) return 'MVFR';
  return 'VFR';
}

export function parseMetar(raw: string, now: Date = new Date()): DecodedMetar {
  const out: DecodedMetar = {
    raw: raw.trim(),
    station: '',
    time: null,
    auto: false,
    wind: null,
    visibility: null,
    cavok: false,
    weather: [],
    clouds: [],
    ceiling: null,
    temp: null,
    dewpoint: null,
    qnh: null,
    rvr: [],
    trend: '',
    remarks: '',
    category: 'UNK',
  };

  let body = out.raw.replace(/=$/, '');
  const rmk = body.search(/\sRMK\s/);
  if (rmk >= 0) {
    out.remarks = body.slice(rmk + 5).trim();
    body = body.slice(0, rmk);
  }
  const trend = body.search(/\s(NOSIG|TEMPO|BECMG)(\s|$)/);
  if (trend >= 0) {
    out.trend = body.slice(trend + 1).trim();
    body = body.slice(0, trend);
  }

  const tokens = body.split(/\s+/).filter(Boolean);
  let i = 0;
  if (tokens[i] === 'METAR' || tokens[i] === 'SPECI') i++;
  if (tokens[i] && /^[A-Z][A-Z0-9]{3}$/.test(tokens[i])) out.station = tokens[i++];

  for (; i < tokens.length; i++) {
    const t = tokens[i];
    let m: RegExpMatchArray | null;

    if (!out.time && (m = t.match(/^(\d{2})(\d{2})(\d{2})Z$/))) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), +m[1], +m[2], +m[3]));
      // Reports from the end of last month.
      if (d.getTime() - now.getTime() > 2 * 86400e3) d.setUTCMonth(d.getUTCMonth() - 1);
      out.time = d;
    } else if (t === 'AUTO' || t === 'COR') {
      out.auto ||= t === 'AUTO';
    } else if ((m = t.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/))) {
      out.wind = {
        dir: m[1] === 'VRB' ? null : +m[1],
        variable: m[1] === 'VRB',
        speed: +m[2],
        gust: m[3] ? +m[3] : null,
        unit: m[4] as 'KT' | 'MPS',
      };
    } else if (out.wind && (m = t.match(/^(\d{3})V(\d{3})$/))) {
      out.wind.from = +m[1];
      out.wind.to = +m[2];
    } else if (t === 'CAVOK') {
      out.cavok = true;
      out.visibility = { meters: 10000, text: '10 km or more' };
    } else if (!out.visibility && (m = t.match(/^(\d{4})(NDV|[NSEW]{0,2})$/))) {
      const meters = +m[1];
      out.visibility = { meters, text: meters >= 9999 ? '10 km or more' : meters >= 5000 ? `${meters / 1000} km` : `${meters} m` };
    } else if (!out.visibility && (m = t.match(/^(P|M)?(\d+(?:\/\d+)?)SM$/))) {
      let sm = parseFraction(m[2]);
      // Whole + fraction split across two tokens, e.g. "1 1/2SM".
      const prev = tokens[i - 1];
      if (/^\d$/.test(prev ?? '')) sm += Number(prev);
      out.visibility = { meters: Math.round(sm * 1609.34), text: `${m[1] === 'P' ? 'more than ' : m[1] === 'M' ? 'less than ' : ''}${+sm.toFixed(2)} SM` };
    } else if (/^\d$/.test(t) && /^\d\/\dSM$/.test(tokens[i + 1] ?? '')) {
      // Whole-mile part of a split visibility; handled with the next token.
    } else if (/^R\d{2}[LCR]?\//.test(t)) {
      out.rvr.push(t);
    } else if (WX_RE.test(t)) {
      out.weather.push(t);
    } else if ((m = t.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU|\/\/\/)?$/))) {
      out.clouds.push({ cover: m[1], base: m[2] === '///' ? null : +m[2] * 100, type: m[3] && m[3] !== '///' ? m[3] : '' });
    } else if (/^(NSC|NCD|SKC|CLR)$/.test(t)) {
      // No significant cloud.
    } else if ((m = t.match(/^(M?\d{2})\/(M?\d{2})?$/))) {
      const conv = (v: string) => (v.startsWith('M') ? -Number(v.slice(1)) : Number(v));
      out.temp = conv(m[1]);
      out.dewpoint = m[2] ? conv(m[2]) : null;
    } else if ((m = t.match(/^Q(\d{4})$/))) {
      const hpa = +m[1];
      out.qnh = { hpa, inhg: +(hpa / 33.8639).toFixed(2) };
    } else if ((m = t.match(/^A(\d{4})$/))) {
      const inhg = +m[1] / 100;
      out.qnh = { hpa: Math.round(inhg * 33.8639), inhg };
    }
  }

  const ceilingLayer = out.clouds.find((c) => (c.cover === 'BKN' || c.cover === 'OVC' || c.cover === 'VV') && c.base !== null);
  out.ceiling = ceilingLayer?.base ?? null;
  out.category = flightCategory(out.visibility?.meters ?? null, out.cavok ? null : out.ceiling);
  if (out.cavok) out.category = 'VFR';
  return out;
}

/** Headwind (+) / tailwind (-) and crosswind (+ from right) for a runway heading. */
export function windComponents(windDir: number, windSpeed: number, runwayHeading: number) {
  const diff = ((windDir - runwayHeading) * Math.PI) / 180;
  return {
    headwind: Math.round(windSpeed * Math.cos(diff)),
    crosswind: Math.round(windSpeed * Math.sin(diff)),
  };
}

/** Approximate magnetic heading from a runway designator such as "27L". */
export function runwayHeading(ident: string): number | null {
  const m = ident.trim().toUpperCase().match(/^(?:RW)?(\d{1,2})[LCR]?$/);
  if (!m) return null;
  const num = +m[1];
  if (num < 1 || num > 36) return null;
  return num * 10;
}

/** Split a block of raw reports into one string per station. */
export function splitReports(text: string): string[] {
  const reports: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    const startsNew = /^(METAR|SPECI|TAF)\b/.test(l) || /^[A-Z][A-Z0-9]{3} \d{6}Z/.test(l);
    if (startsNew || !reports.length) reports.push(l);
    else reports[reports.length - 1] += ' ' + l;
  }
  return reports;
}

function stationOf(report: string): string {
  const t = report.split(/\s+/).filter((x) => !/^(METAR|SPECI|TAF|AMD|COR)$/.test(x));
  return t[0] ?? '';
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export interface WeatherReports {
  metar: Record<string, string>;
  taf: Record<string, string>;
  source: string;
}

export async function fetchWeather(icaos: string[]): Promise<WeatherReports> {
  const ids = [...new Set(icaos.map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9]{4}$/.test(x)))];
  const result: WeatherReports = { metar: {}, taf: {}, source: '' };
  if (!ids.length) return result;
  const list = ids.join(',');

  const [metarRes, tafRes] = await Promise.allSettled([
    getText(apiUrl('awc', `/api/data/metar?ids=${list}&format=raw`)),
    getText(apiUrl('awc', `/api/data/taf?ids=${list}&format=raw`)),
  ]);
  if (metarRes.status === 'fulfilled') {
    for (const r of splitReports(metarRes.value)) {
      const st = stationOf(r);
      if (ids.includes(st) && !result.metar[st]) result.metar[st] = r;
    }
    result.source = 'aviationweather.gov';
  }
  if (tafRes.status === 'fulfilled') {
    for (const r of splitReports(tafRes.value)) {
      const st = stationOf(r);
      if (ids.includes(st) && !result.taf[st]) result.taf[st] = r;
    }
  }

  const missing = ids.filter((id) => !result.metar[id]);
  if (missing.length) {
    const vatsim = await Promise.allSettled(missing.map((id) => getText(apiUrl('vatsim', `/metar.php?id=${id}`))));
    vatsim.forEach((r, idx) => {
      const text = r.status === 'fulfilled' ? r.value.trim() : '';
      if (text && !/no metar/i.test(text) && /\d{6}Z/.test(text)) {
        result.metar[missing[idx]] = text.split(/\r?\n/)[0];
        result.source ||= 'VATSIM';
      }
    });
  }
  return result;
}

/** Format a TAF with each change group on its own line. */
export function formatTaf(taf: string): string {
  return taf.replace(/\s+(BECMG|TEMPO|FM\d{6}|PROB\d{2}(?:\s+TEMPO)?)(?=\s)/g, '\n  $1');
}

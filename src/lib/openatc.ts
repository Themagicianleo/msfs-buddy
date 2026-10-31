// Hand the current flight to OpenATC (the ATC app on the sim PC). OpenATC
// runs on your home network, so the EFB can't share storage with it; instead
// the plan travels as a code: "OPENATC1:" + base64url JSON of OpenATC's
// Flight plan form fields. It goes in a link (#fp=…) or on the clipboard, and
// OpenATC only fills its form with it; you start the flight there.

import type { FlightPlan } from './simbrief';

export const OPENATC_PREFIX = 'OPENATC1:';

/** Mainland China ICAO prefixes, for OpenATC's China (CAAC, metric) phraseology. */
const CHINA = /^Z[BGHJLPSUWY]/;

export interface OpenAtcPlan {
  v: 1;
  callsign?: string;
  dep: string;
  arr: string;
  cruise?: string;
  sid?: string;
  star?: string;
  route?: string;
  region: 'icao' | 'china';
  depRunway?: string;
  arrRunway?: string;
  depTransitionFt?: string;
  arrTransitionFt?: string;
}

export function toOpenAtcPlan(plan: FlightPlan): OpenAtcPlan {
  const sid = plan.navlog.find((f) => f.isSidStar && f.stage === 'CLB')?.via;
  const star = [...plan.navlog].reverse().find((f) => f.isSidStar && f.stage === 'DSC')?.via;
  const ft = (n: number | null) => (n ? String(Math.round(n)) : undefined);
  const out: OpenAtcPlan = {
    v: 1,
    callsign: (plan.callsign || plan.flightNumber || '').toUpperCase() || undefined,
    dep: plan.origin.icao,
    arr: plan.destination.icao,
    cruise: plan.cruiseAlt ? `FL${Math.round(plan.cruiseAlt / 100)}` : undefined,
    sid,
    star,
    route: plan.route || undefined,
    region: CHINA.test(plan.origin.icao) || CHINA.test(plan.destination.icao) ? 'china' : 'icao',
    depRunway: plan.origin.runway || undefined,
    arrRunway: plan.destination.runway || undefined,
    depTransitionFt: ft(plan.origin.transAlt),
    arrTransitionFt: ft(plan.destination.transAlt),
  };
  return JSON.parse(JSON.stringify(out)); // drop the undefined fields
}

function base64Url(text: string): string {
  let bin = '';
  new TextEncoder().encode(text).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function openAtcCode(plan: FlightPlan): string {
  return OPENATC_PREFIX + base64Url(JSON.stringify(toOpenAtcPlan(plan)));
}

/** "192.168.1.50:8443" or a full URL -> "https://192.168.1.50:8443/"; null if it isn't an address. */
export function normaliseOpenAtcUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!u.hostname) return null;
    if (!u.port && u.protocol === 'https:') u.port = '8443';
    return `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
}

export function openAtcLink(base: string, plan: FlightPlan): string | null {
  const url = normaliseOpenAtcUrl(base);
  return url && `${url}#fp=${openAtcCode(plan).slice(OPENATC_PREFIX.length)}`;
}

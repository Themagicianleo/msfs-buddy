// Airway routing from your own simulator's navdata. Little Navmap reads
// MSFS's airways and waypoints into its database file; you pick that file
// in Settings, SimPlanner extracts just the airway network (in this browser,
// never uploaded), and "Generate flight" finds a route along the airways like
// SimBrief does. The data is from your MSFS install, so it is not shipped
// with SimPlanner.

import { distanceNm, type LatLon } from './geo';
import type { NavDataProvider, NavFix } from './navdata';
import { SqliteFile, type ByteSource } from './sqlite';

export const AIRWAYS_KEY = 'airways';

/** Compact airway network, stored in IndexedDB. */
export interface AirwayData {
  importedAt: string;
  fileName: string;
  /** From the database's metadata: e.g. "MSFS24", and the AIRAC cycle if any. */
  dataSource: string;
  cycle: string;
  fixIdent: string[];
  fixRegion: string[];
  /** 'V' VOR, 'N' NDB, 'W' waypoint. */
  fixType: string[];
  fixLat: Float64Array;
  fixLon: Float64Array;
  airwayNames: string[];
  /** Per segment: airway name index, from fix, to fix, flags (bit 0/1 direction F/B, bit 2 low-level "victor"). */
  seg: Int32Array;
}

const FORWARD = 1;
const BACKWARD = 2;
const VICTOR = 4;

/** Read the airway network out of a Little Navmap database file. */
export async function extractAirways(source: ByteSource, fileName: string, onProgress?: (msg: string) => void): Promise<AirwayData> {
  const db = await SqliteFile.open(source);
  const tables = await db.tables();
  const airway = tables.get('airway');
  const waypoint = tables.get('waypoint');
  if (!airway || !waypoint) throw new Error('This database has no airway and waypoint tables. Pick the Little Navmap database for your simulator (see the steps above).');

  let dataSource = '';
  let cycle = '';
  const meta = tables.get('metadata');
  if (meta) {
    const cols = (['data_source', 'airac_cycle'] as const).filter((c) => meta.columns.includes(c));
    await db.rows(meta, cols, (r) => {
      dataSource = String(r.data_source ?? '');
      cycle = String(r.airac_cycle ?? '');
    });
  }
  // Little Navmap also ships a Navigraph database; that data is licensed for
  // Little Navmap only, so only simulator databases are accepted here.
  if (/^(NG|NAVIGRAPH)$/i.test(dataSource)) throw new Error('That is Little Navmap’s Navigraph database. Pick the one for MSFS instead (the file name mentions msfs).');

  onProgress?.('Reading airways…');
  const segRows: number[] = [];
  const nameIdx = new Map<string, number>();
  const airwayNames: string[] = [];
  const used = new Map<number, number>(); // waypoint_id -> fix index
  const fixOf = (id: number) => {
    let i = used.get(id);
    if (i === undefined) used.set(id, (i = used.size));
    return i;
  };
  await db.rows(airway, ['airway_name', 'airway_type', 'from_waypoint_id', 'to_waypoint_id', 'direction'] as const, (r) => {
    const name = String(r.airway_name ?? '').trim().toUpperCase();
    if (!name || typeof r.from_waypoint_id !== 'number' || typeof r.to_waypoint_id !== 'number') return;
    let n = nameIdx.get(name);
    if (n === undefined) {
      n = airwayNames.length;
      nameIdx.set(name, n);
      airwayNames.push(name);
    }
    const d = String(r.direction ?? 'N').toUpperCase();
    const flags = (d === 'F' ? FORWARD : d === 'B' ? BACKWARD : 0) | (String(r.airway_type ?? '').toUpperCase() === 'V' ? VICTOR : 0);
    segRows.push(n, fixOf(r.from_waypoint_id), fixOf(r.to_waypoint_id), flags);
  });
  if (!segRows.length) throw new Error('No airways found in this database. Load the scenery library in Little Navmap first.');

  onProgress?.(`Reading waypoints for ${(segRows.length / 4).toLocaleString('en-US')} airway segments…`);
  const count = used.size;
  const fixIdent = new Array<string>(count).fill('');
  const fixRegion = new Array<string>(count).fill('');
  const fixType = new Array<string>(count).fill('W');
  const fixLat = new Float64Array(count);
  const fixLon = new Float64Array(count);
  const found = new Uint8Array(count);
  await db.rows(waypoint, ['waypoint_id', 'ident', 'region', 'type', 'laty', 'lonx'] as const, (r) => {
    const i = typeof r.waypoint_id === 'number' ? used.get(r.waypoint_id) : undefined;
    if (i === undefined) return;
    fixIdent[i] = String(r.ident ?? '').trim().toUpperCase();
    fixRegion[i] = String(r.region ?? '');
    const t = String(r.type ?? '').toUpperCase();
    fixType[i] = t === 'V' ? 'V' : t === 'N' ? 'N' : 'W';
    fixLat[i] = Number(r.laty);
    fixLon[i] = Number(r.lonx);
    found[i] = 1;
  });
  // Drop segments whose waypoints are missing.
  const seg: number[] = [];
  for (let s = 0; s < segRows.length; s += 4) if (found[segRows[s + 1]] && found[segRows[s + 2]]) seg.push(segRows[s], segRows[s + 1], segRows[s + 2], segRows[s + 3]);
  return { importedAt: new Date().toISOString(), fileName, dataSource, cycle, fixIdent, fixRegion, fixType, fixLat, fixLon, airwayNames, seg: Int32Array.from(seg) };
}

// ---------- Graph and routing ----------

interface Edge {
  to: number;
  airway: number;
  nm: number;
  victor: boolean;
}

/** Binary heap keyed on a number. */
class Heap<T> {
  private items: { k: number; v: T }[] = [];
  get size() {
    return this.items.length;
  }
  push(k: number, v: T) {
    const a = this.items;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): { k: number; v: T } | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export interface AirwayRouteOptions {
  /** How far from each airport to look for the first/last airway fix. */
  connectNm: number;
  /** Extra "cost" (nm) for each change of airway, so routes don't zig-zag. */
  changePenaltyNm: number;
  /** Low-level (victor) airways cost this much more per nm. */
  victorFactor: number;
  /** Give up (and fall back) if the best route is longer than this × direct. */
  maxDetour: number;
}

export const DEFAULT_AIRWAY_OPTIONS: AirwayRouteOptions = { connectNm: 80, changePenaltyNm: 25, victorFactor: 1.15, maxDetour: 1.5 };

export interface AirwayRoute {
  /** FMC route string, e.g. "TSTAA T1 TVR T2 TSTAF". */
  route: string;
  fixes: NavFix[];
  routeNm: number;
  directNm: number;
  airways: string[];
  note: string;
}

export class AirwayGraph {
  private adj: Edge[][];
  private byIdent = new Map<string, number[]>();
  /** Fixes that lie on at least one airway, bucketed by whole degree, for "near the airport" lookups. */
  private grid = new Map<string, number[]>();

  constructor(readonly data: AirwayData) {
    const n = data.fixIdent.length;
    this.adj = Array.from({ length: n }, () => []);
    const s = data.seg;
    for (let i = 0; i < s.length; i += 4) {
      const [a, from, to, flags] = [s[i], s[i + 1], s[i + 2], s[i + 3]];
      const nm = distanceNm(this.pos(from), this.pos(to));
      const victor = !!(flags & VICTOR);
      if (!(flags & BACKWARD)) this.adj[from].push({ to, airway: a, nm, victor });
      if (!(flags & FORWARD)) this.adj[to].push({ to: from, airway: a, nm, victor });
    }
    for (let i = 0; i < n; i++) {
      const id = data.fixIdent[i];
      (this.byIdent.get(id) ?? this.byIdent.set(id, []).get(id)!).push(i);
      const key = `${Math.floor(data.fixLat[i])},${Math.floor(data.fixLon[i])}`;
      (this.grid.get(key) ?? this.grid.set(key, []).get(key)!).push(i);
    }
  }

  get fixCount() {
    return this.data.fixIdent.length;
  }
  get segmentCount() {
    return this.data.seg.length / 4;
  }

  pos(i: number): LatLon {
    return { lat: this.data.fixLat[i], lon: this.data.fixLon[i] };
  }

  fix(i: number): NavFix {
    const d = this.data;
    const type = d.fixType[i] === 'V' ? 'vor' : d.fixType[i] === 'N' ? 'ndb' : 'waypoint';
    return { ident: d.fixIdent[i], lat: d.fixLat[i], lon: d.fixLon[i], type, source: `Airways (${d.dataSource || 'simulator'})` };
  }

  private near(p: LatLon, nm: number): number[] {
    const out: number[] = [];
    const dLat = Math.ceil(nm / 60) + 1;
    const dLon = Math.ceil(nm / (60 * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)))) + 1;
    for (let la = Math.floor(p.lat) - dLat; la <= Math.floor(p.lat) + dLat; la++)
      for (let lo = Math.floor(p.lon) - dLon; lo <= Math.floor(p.lon) + dLon; lo++)
        for (const i of this.grid.get(`${la},${((lo + 180 + 360) % 360) - 180}`) ?? []) if (distanceNm(p, this.pos(i)) <= nm) out.push(i);
    return out;
  }

  /**
   * Shortest airway route from dep to arr (A* over the airway network).
   * The airports are joined to the nearest airway fixes by a direct leg,
   * which is where the SID and STAR go.
   */
  route(dep: LatLon, arr: LatLon, opts: AirwayRouteOptions = DEFAULT_AIRWAY_OPTIONS): AirwayRoute | null {
    const directNm = distanceNm(dep, arr);
    const starts = this.near(dep, opts.connectNm).filter((i) => this.adj[i].length);
    const ends = new Map(this.near(arr, opts.connectNm).map((i) => [i, distanceNm(this.pos(i), arr)]));
    if (!starts.length || !ends.size) return null;

    // State = (fix, airway arrived on); -1 = joined directly from the airport.
    const key = (fix: number, awy: number) => fix * 65536 + (awy + 1);
    const best = new Map<number, number>();
    const prev = new Map<number, number>();
    const heap = new Heap<[number, number, number]>(); // [fix, airway, cost so far]
    const h = (i: number) => distanceNm(this.pos(i), arr);
    for (const s of starts) {
      const g = distanceNm(dep, this.pos(s)) * 1.1;
      best.set(key(s, -1), g);
      heap.push(g + h(s), [s, -1, g]);
    }
    let goal: { k: number; cost: number } | null = null;
    let guard = 0;
    while (heap.size && guard++ < 2_000_000) {
      const { k: f, v } = heap.pop()!;
      const [fix, awy, g] = v;
      if (goal && f >= goal.cost) break;
      if (g > (best.get(key(fix, awy)) ?? Infinity)) continue;
      const endNm = ends.get(fix);
      if (endNm !== undefined && awy >= 0) {
        const total = g + endNm * 1.1;
        if (!goal || total < goal.cost) goal = { k: key(fix, awy), cost: total };
      }
      for (const e of this.adj[fix]) {
        const ng = g + e.nm * (e.victor ? opts.victorFactor : 1) + (awy >= 0 && e.airway !== awy ? opts.changePenaltyNm : 0);
        const nk = key(e.to, e.airway);
        if (ng < (best.get(nk) ?? Infinity)) {
          best.set(nk, ng);
          prev.set(nk, key(fix, awy));
          heap.push(ng + h(e.to), [e.to, e.airway, ng]);
        }
      }
    }
    if (!goal) return null;

    // Walk back: list of [fix, airway used to reach it].
    const path: [number, number][] = [];
    for (let k: number | undefined = goal.k; k !== undefined; k = prev.get(k)) path.unshift([Math.floor(k / 65536), (k % 65536) - 1]);
    const fixes = path.map(([i]) => this.fix(i));
    const pts: LatLon[] = [dep, ...fixes, arr];
    let routeNm = 0;
    for (let i = 1; i < pts.length; i++) routeNm += distanceNm(pts[i - 1], pts[i]);
    if (routeNm > directNm * opts.maxDetour) return null;

    // "ENTRY AWY1 CHANGE AWY2 EXIT": name a fix only where the airway changes.
    const tokens = [fixes[0].ident];
    const airways: string[] = [];
    for (let i = 1; i < path.length; i++) {
      const awy = this.data.airwayNames[path[i][1]];
      const nextAwy = i + 1 < path.length ? this.data.airwayNames[path[i + 1][1]] : null;
      if (awy !== nextAwy) {
        tokens.push(awy, fixes[i].ident);
        airways.push(awy);
      }
    }
    const extra = ((routeNm / directNm - 1) * 100).toFixed(1);
    const src = `${this.data.dataSource || 'your simulator'}${this.data.cycle ? ` cycle ${this.data.cycle}` : ''}`;
    const note = `Airway route from your ${src} navdata via ${airways.join(', ')}, ${extra}% longer than direct. Generated, not an ATC-validated route; add the SID and STAR in the FMC.`;
    return { route: tokens.join(' '), fixes, routeNm, directNm, airways, note };
  }

  /** Lets the route parser resolve airway fixes and expand airways for the map and navlog. */
  provider(): NavDataProvider {
    return {
      id: 'airways',
      name: 'Airways',
      findFix: (ident) => (this.byIdent.get(ident.toUpperCase()) ?? []).map((i) => this.fix(i)),
      expandAirway: (airway, fromIdent, toIdent) => {
        const a = this.data.airwayNames.indexOf(airway.toUpperCase());
        if (a < 0) return null;
        // Breadth-first along this airway only, from each fix named fromIdent.
        for (const start of this.byIdent.get(fromIdent.toUpperCase()) ?? []) {
          const back = new Map<number, number>([[start, -1]]);
          const queue = [start];
          while (queue.length) {
            const cur = queue.shift()!;
            if (this.data.fixIdent[cur] === toIdent.toUpperCase() && cur !== start) {
              const inner: NavFix[] = [];
              for (let p = back.get(cur)!; p !== start && p >= 0; p = back.get(p)!) inner.unshift(this.fix(p));
              return inner;
            }
            for (const e of this.adj[cur]) if (e.airway === a && !back.has(e.to)) {
              back.set(e.to, cur);
              queue.push(e.to);
            }
          }
        }
        return null;
      },
    };
  }
}

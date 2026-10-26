// Downloads the OurAirports data set (public domain) and writes the compact
// file the SimPlanner website loads: public/data/ourairports.json.
//
// Run by .github/workflows/update-airport-data.yml (monthly, or by hand).
// Locally:  npx vite-node scripts/build-airport-data.ts
//           npx vite-node scripts/build-airport-data.ts -- --from ./csv-folder
//   (--from reads airports.csv, runways.csv and navaids.csv from a folder)
//           npx vite-node scripts/build-airport-data.ts -- --augment
//   (--augment skips the download and re-applies data/openaip to the
//    existing public/data/ourairports.json)
//
// Also merges hand-downloaded openAIP exports from data/openaip/ (see the
// README there): *_nav.json beacons and *_apt.json runway headings.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  buildDataset,
  fillRunwayHeadings,
  mergeNavaids,
  OPENAIP_API,
  OURAIRPORTS_URLS,
  parseOpenAipNavaids,
  parseOpenAipRunwayHeadings,
  type AirportDataset,
  type NavaidRow,
} from '../src/simplanner/lib/airports';

const OUT_DIR = 'public/data';
const OUT = `${OUT_DIR}/ourairports.json`;
const fromIdx = process.argv.indexOf('--from');
const fromDir = fromIdx > 0 ? process.argv[fromIdx + 1] : '';
const augment = process.argv.includes('--augment');
const LOCAL_OPENAIP = 'data/openaip';

async function get(name: keyof typeof OURAIRPORTS_URLS): Promise<string> {
  if (fromDir) return readFileSync(`${fromDir}/${name}.csv`, 'utf8');
  const res = await fetch(OURAIRPORTS_URLS[name], { headers: { 'User-Agent': 'SimPlanner data update (GitHub Actions)' } });
  if (!res.ok) throw new Error(`${OURAIRPORTS_URLS[name]}: HTTP ${res.status}`);
  return res.text();
}

const date = new Date().toISOString().slice(0, 10);
let ds: AirportDataset;
if (augment) {
  ds = JSON.parse(readFileSync(OUT, 'utf8')) as AirportDataset;
  ds.source = ds.source.replace(/ \+ openAIP.*$/, '');
} else {
  const [airports, runways, navaids] = await Promise.all([get('airports'), get('runways'), get('navaids')]);
  ds = buildDataset(airports, runways, `OurAirports, downloaded ${date}`, navaids);
}

// Hand-downloaded openAIP exports committed in data/openaip/.
let localOpenAip = 0;
if (existsSync(LOCAL_OPENAIP)) {
  for (const file of readdirSync(LOCAL_OPENAIP).sort()) {
    const path = `${LOCAL_OPENAIP}/${file}`;
    if (file.endsWith('_nav.json')) {
      const { merged, added } = mergeNavaids(ds.navaids ?? [], parseOpenAipNavaids(JSON.parse(readFileSync(path, 'utf8'))));
      ds.navaids = merged;
      localOpenAip += added;
      console.log(`${path}: added ${added} beacons.`);
    } else if (file.endsWith('_apt.json')) {
      const filled = fillRunwayHeadings(ds, parseOpenAipRunwayHeadings(JSON.parse(readFileSync(path, 'utf8'))));
      if (filled) localOpenAip++;
      console.log(`${path}: filled ${filled} runway headings.`);
    }
  }
}
if (localOpenAip) ds.source += ' + openAIP (CC BY-NC 4.0)';

// openAIP adds beacons OurAirports lacks (coverage varies by country).
// Optional: needs a free openAIP API key in the OPENAIP_API_KEY repository
// secret; without it, or on any error, only OurAirports beacons are used.
// openAIP data is licensed CC BY-NC 4.0.
async function openAipNavaids(apiKey: string): Promise<NavaidRow[]> {
  const rows: NavaidRow[] = [];
  for (let page = 1; page <= 200; page++) {
    const res = await fetch(`${OPENAIP_API}/navaids?page=${page}&limit=1000`, {
      headers: { 'x-openaip-api-key': apiKey, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`openAIP API page ${page}: HTTP ${res.status}`);
    const body = (await res.json()) as { items?: unknown[]; totalPages?: number; totalCount?: number };
    const items = body.items ?? [];
    rows.push(...parseOpenAipNavaids(items));
    if (!items.length || (body.totalPages && page >= body.totalPages)) break;
  }
  const byCountry = new Map<string, number>();
  rows.forEach((r) => byCountry.set(r[6] ?? '', (byCountry.get(r[6] ?? '') ?? 0) + 1));
  console.log(`openAIP: ${rows.length} beacons (China: ${byCountry.get('CN') ?? 0}).`);
  return rows;
}

const openAipKey = process.env.OPENAIP_API_KEY ?? '';
if (!fromDir && !augment && openAipKey) {
  try {
    const { merged, added } = mergeNavaids(ds.navaids ?? [], await openAipNavaids(openAipKey));
    ds.navaids = merged;
    console.log(`openAIP: added ${added} beacons not already in OurAirports.`);
    if (added && !ds.source.includes('openAIP')) ds.source += ' + openAIP (CC BY-NC 4.0)';
  } catch (e) {
    console.log(`openAIP skipped: ${(e as Error).message}`);
  }
} else if (!fromDir && !augment) {
  console.log('openAIP API skipped: no OPENAIP_API_KEY secret set (optional; see simplanner/README.md).');
}

// Refuse to publish an obviously broken download.
if (!fromDir && !augment && (ds.airports.length < 5000 || (ds.navaids?.length ?? 0) < 1000)) {
  throw new Error(`Suspiciously small download: ${ds.airports.length} airports, ${ds.navaids?.length} navaids. Not writing.`);
}

// Skip rewriting when only the timestamp would change (keeps git history small).
const strip = (d: AirportDataset) => JSON.stringify({ ...d, importedAt: '', source: '' });
if (existsSync(OUT)) {
  const old = JSON.parse(readFileSync(OUT, 'utf8')) as AirportDataset;
  if (strip(old) === strip(ds)) {
    console.log('No changes in the OurAirports data.');
    process.exit(0);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify(ds);
writeFileSync(OUT, json);
writeFileSync(
  `${OUT_DIR}/SOURCE.md`,
  `# Airport data\n\n\`ourairports.json\` is generated from the OurAirports data set\n(https://ourairports.com/data/), which is released into the public domain.\nIt is not navigation data: no airways, procedures or AIRAC cycle.\n\nWhen available, VOR/NDB beacons from openAIP (https://www.openaip.net) are\nmerged in. openAIP data is licensed CC BY-NC 4.0 (non-commercial use, with\nattribution).\n\nLast update: ${date}. Rebuilt by \`scripts/build-airport-data.ts\`.\n`,
);
console.log(
  `Wrote ${OUT}: ${ds.airports.length} airports, ${Object.keys(ds.runways).length} with runways, ${ds.navaids?.length ?? 0} navaids, ${(json.length / 1e6).toFixed(1)} MB.`,
);

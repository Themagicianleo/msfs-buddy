// Downloads the OurAirports data set (public domain) and writes the compact
// file the SimPlanner website loads: public/data/ourairports.json.
//
// Run by .github/workflows/update-airport-data.yml (monthly, or by hand).
// Locally:  npx vite-node scripts/build-airport-data.ts
//           npx vite-node scripts/build-airport-data.ts -- --from ./csv-folder
//   (--from reads airports.csv, runways.csv and navaids.csv from a folder)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildDataset, mergeNavaids, OPENAIP_API, OURAIRPORTS_URLS, parseOpenAipNavaids, type AirportDataset, type NavaidRow } from '../src/simplanner/lib/airports';

const OUT_DIR = 'public/data';
const OUT = `${OUT_DIR}/ourairports.json`;
const fromIdx = process.argv.indexOf('--from');
const fromDir = fromIdx > 0 ? process.argv[fromIdx + 1] : '';

async function get(name: keyof typeof OURAIRPORTS_URLS): Promise<string> {
  if (fromDir) return readFileSync(`${fromDir}/${name}.csv`, 'utf8');
  const res = await fetch(OURAIRPORTS_URLS[name], { headers: { 'User-Agent': 'SimPlanner data update (GitHub Actions)' } });
  if (!res.ok) throw new Error(`${OURAIRPORTS_URLS[name]}: HTTP ${res.status}`);
  return res.text();
}

const [airports, runways, navaids] = await Promise.all([get('airports'), get('runways'), get('navaids')]);
const date = new Date().toISOString().slice(0, 10);
const ds = buildDataset(airports, runways, `OurAirports, downloaded ${date}`, navaids);

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
if (!fromDir && openAipKey) {
  try {
    const { merged, added } = mergeNavaids(ds.navaids ?? [], await openAipNavaids(openAipKey));
    ds.navaids = merged;
    console.log(`openAIP: added ${added} beacons not already in OurAirports.`);
    if (added) ds.source += ' + openAIP navaids (CC BY-NC 4.0)';
  } catch (e) {
    console.log(`openAIP skipped: ${(e as Error).message}`);
  }
} else if (!fromDir) {
  console.log('openAIP skipped: no OPENAIP_API_KEY secret set (optional; see simplanner/README.md).');
}

// Refuse to publish an obviously broken download.
if (!fromDir && (ds.airports.length < 5000 || (ds.navaids?.length ?? 0) < 1000)) {
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

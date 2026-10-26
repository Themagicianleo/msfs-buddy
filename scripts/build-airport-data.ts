// Downloads the OurAirports data set (public domain) and writes the compact
// file the SimPlanner website loads: public/data/ourairports.json.
//
// Run by .github/workflows/update-airport-data.yml (monthly, or by hand).
// Locally:  npx vite-node scripts/build-airport-data.ts
//           npx vite-node scripts/build-airport-data.ts -- --from ./csv-folder
//   (--from reads airports.csv, runways.csv and navaids.csv from a folder)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildDataset, mergeNavaids, OPENAIP_EXPORT, OURAIRPORTS_URLS, parseOpenAipNavaids, type AirportDataset, type NavaidRow } from '../src/simplanner/lib/airports';

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

// openAIP adds beacons OurAirports lacks (notably in China). Optional: any
// failure just leaves the OurAirports beacons. Licensed CC BY-NC 4.0.
async function openAipNavaids(countries: string[]): Promise<NavaidRow[]> {
  const rows: NavaidRow[] = [];
  const stats: string[] = [];
  const statuses = new Map<string, number>();
  let failures = 0;
  // Diagnostic: what the export bucket actually contains (names change over time).
  try {
    const bucket = OPENAIP_EXPORT.split('/').pop();
    const list = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=cn&maxResults=20`);
    const body = list.ok ? ((await list.json()) as { items?: { name: string }[] }) : null;
    console.log(`openAIP bucket listing: HTTP ${list.status}${body ? ': ' + (body.items ?? []).map((i) => i.name).join(', ') : ''}`);
  } catch (e) {
    console.log(`openAIP bucket listing failed: ${(e as Error).message}`);
  }
  const queue = [...countries];
  const worker = async () => {
    for (let cc = queue.shift(); cc; cc = queue.shift()) {
      try {
        const res = await fetch(`${OPENAIP_EXPORT}/${cc.toLowerCase()}_nav.json`);
        if (!res.ok) {
          failures++;
          statuses.set(String(res.status), (statuses.get(String(res.status)) ?? 0) + 1);
          continue;
        }
        const got = parseOpenAipNavaids(await res.json(), cc);
        rows.push(...got);
        if (got.length) stats.push(`${cc}:${got.length}`);
      } catch {
        failures++;
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`openAIP: ${rows.length} beacons from ${stats.length} countries (${failures} countries unavailable; HTTP ${[...statuses].map(([k, v]) => `${k}×${v}`).join(', ') || '-'}). ${stats.sort().join(' ')}`);
  return rows;
}

if (!fromDir && !process.argv.includes('--no-openaip')) {
  const countries = [...new Set(ds.airports.map((a) => a[5]).filter((c): c is string => !!c && c.length === 2))];
  const extra = await openAipNavaids(countries);
  const { merged, added } = mergeNavaids(ds.navaids ?? [], extra);
  ds.navaids = merged;
  console.log(`openAIP: added ${added} beacons not already in OurAirports.`);
  if (added) ds.source += ' + openAIP navaids (CC BY-NC 4.0)';
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

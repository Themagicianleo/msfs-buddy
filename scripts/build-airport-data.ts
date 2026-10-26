// Downloads the OurAirports data set (public domain) and writes the compact
// file the SimPlanner website loads: public/data/ourairports.json.
//
// Run by .github/workflows/update-airport-data.yml (monthly, or by hand).
// Locally:  npx vite-node scripts/build-airport-data.ts
//           npx vite-node scripts/build-airport-data.ts -- --from ./csv-folder
//   (--from reads airports.csv, runways.csv and navaids.csv from a folder)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildDataset, OURAIRPORTS_URLS, type AirportDataset } from '../src/simplanner/lib/airports';

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
  `# Airport data\n\n\`ourairports.json\` is generated from the OurAirports data set\n(https://ourairports.com/data/), which is released into the public domain.\nIt is not navigation data: no airways, procedures or AIRAC cycle.\n\nLast update: ${date}. Rebuilt by \`scripts/build-airport-data.ts\`.\n`,
);
console.log(
  `Wrote ${OUT}: ${ds.airports.length} airports, ${Object.keys(ds.runways).length} with runways, ${ds.navaids?.length ?? 0} navaids, ${(json.length / 1e6).toFixed(1)} MB.`,
);

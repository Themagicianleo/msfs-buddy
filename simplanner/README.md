# SimPlanner

A free flight-planning website for Microsoft Flight Simulator 2024, for flights
you plan by hand, including airports SimBrief doesn't have (e.g. ZUDC, ZUNZ).
You key in a flight and it shows what to type into the FMC: route, payload,
fuel, weights, a printable briefing, and an FMC cheat sheet per aircraft.

**Open it:** https://themagicianleo.github.io/msfs-buddy/simplanner/

There is nothing to install. It runs entirely in your browser: no accounts, no
server, no telemetry. Your data never leaves the device unless you export it.

> **For simulation only.** Fuel and weights are estimates, verify with the
> aircraft's own performance tools. Aircraft numbers ship as PLACEHOLDERS and
> FMC page names are UNVERIFIED until you check them.

## Quick start (works like SimBrief's dispatch)

1. Open **Dispatch**. Pick the aircraft and type **From** and **To** (ICAO,
   name or city; suggestions appear as you type). Leave **Load** on
   **Random (like SimBrief)**, or set passengers and cargo yourself.
2. Press **Generate flight**. By default SimPlanner picks:
   * **Route:** VOR-to-VOR (see below), or *Direct*, or *My own* to type it.
   * **Cruise level:** about FL100 + 0.75 × distance, capped at the
     aircraft's normal cruise level, using the east odd / west even rule.
   * **Alternate:** the nearest airport with scheduled airline service and a
     runway at least the profile's `minRunwayFt` long, in the arrival's
     country first (no military bases, no cross-border picks when a domestic
     one exists).
   * **Runways:** into the live METAR wind; the longest if there's no wind
     data. Where OurAirports has no runway heading, the runway number is used
     (16 → about 160°).
   * **Payload (Random):** a passenger load factor between 55% and 100%,
     most often about 85%, plus 5–70% of the cargo limit (most often 30%). If
     that would exceed MZFW, MTOW or MLW for this trip, cargo comes off first,
     then passengers. **New random load** on the OFP re-rolls it.
   Untick any of these to choose yourself.
3. The **OFP** opens: summary, navlog, fuel & weights, weather, FMC sheet
   and a printable briefing, plus **MSFS .pln**, **Little Navmap**,
   **Copy route**, **share link** and **kiosk link**. Every generated flight
   is saved under **Flights**.
4. **Open in EFB** shows the flight in the EFB (same site, same browser):
   map, OFP text, navlog, fuel, weights and logbook work as for a SimBrief
   flight; scheduled times stay empty (SimPlanner has no departure time) and
   per-fix times, fuel and altitudes are spread from the estimates. The EFB
   keeps it until you press its refresh button, which fetches SimBrief again.

Before trusting the numbers, check your aircraft profile on the **Aircraft**
page and set `"verified": true`.

## How routes are generated

SimBrief builds airway routes from licensed AIRAC navdata. SimPlanner ships
none, so **VOR to VOR** uses free beacon lists: OurAirports (public domain)
plus, where available, openAIP (CC BY-NC 4.0), covering VOR, VOR-DME, VORTAC,
TACAN and NDB beacons:

* only beacons within 50 nm of the great-circle track count, ignoring the
  first and last 30 nm (SID/STAR area). If none are that close, it looks up
  to 100 nm away, but keeps that route only if it is at most 12% longer than
  direct;
* it steps along the track choosing the beacon that makes the most progress
  in the next 60–220 nm while staying close to the line. High-altitude VORs
  beat low/terminal ones, and NDBs are used only when no VOR is in reach;
* over long empty stretches (oceans) it flies direct to the next beacon;
* on a **domestic** flight it only uses beacons in that country, so a
  flight inside China never routes via beacons in India or Myanmar.

**openAIP files in the repo:** every `data/openaip/*_nav.json` (beacons)
and `*_apt.json` (airports, used for missing runway headings) is merged on
each data update. China (`cn_*`) is there now; to add a country, download
its JSON export from https://www.openaip.net (Data → Export) and commit it
to that folder. See `data/openaip/README.md`.

**Optional, openAIP API:** create a free account at
https://www.openaip.net, make an API key (your profile → API clients), and add
it to this GitHub repository as a secret named `OPENAIP_API_KEY`
(*Settings → Secrets and variables → Actions → New repository secret*). Then
run **Update airport data**. The Action log shows how many beacons openAIP
added (including for China). openAIP data is CC BY-NC 4.0 (free,
non-commercial use with credit), which fits this free personal site. Without
the key only OurAirports is used.

Coverage is the limit: the open data has few Chinese beacons in the west.
With the openAIP China file, ZUDC→ZUNZ goes via DCH (Bamda) and ZULS→ZUAL
via RKZ (Rikaze), but many routes still come out **Direct** (and flights
under 220 nm are always one leg). For a beacon route there, add the real
fixes under *Waypoints* (from your charts) and choose **My own**.

**Airways (SimBrief-style), from your own simulator:** the default
*Airways* route mode searches the airway network for the shortest route
(A* search; each change of airway costs a little, low-level airways cost a
bit more; the airports join the nearest airway fixes by a direct leg, where
the SID and STAR go). The airway data comes from **your MSFS 2024 install via
Little Navmap**: in *Settings → Airways*, pick Little Navmap's MSFS database
from `%APPDATA%\ABarthel\little_navmap_db`. SimPlanner reads just the
`airway` and `waypoint` tables straight from the file with its own small
SQLite reader (`src/simplanner/lib/sqlite.ts`, no upload, no full load into
memory) and keeps the network in this browser (IndexedDB). It is never
committed or shipped: it is data from your simulator. Little Navmap's
bundled Navigraph database is refused (licensed to Little Navmap only).
Without airway data, *Airways* falls back to VOR to VOR. Limits:

* not ATC-validated: no airway level limits, RAD/route restrictions or
  conditional routes; one-way airways are respected only where the data
  marks them;
* the aircraft FMC's own navdata may be an older cycle and reject an airway:
  edit the route under *My own*;
* the database file name for MSFS 2024 and the exact contents Little Navmap
  writes for it are **UNVERIFIED** (tested against a file with the same
  tables and columns, generated by `scripts/make-airway-fixture.py`).

**CAAC published routes (China):** under *Settings → Published routes*,
import CAAC's route list CSVs (*International Flights from / to Mainland of
China* and *Regional Flight Routes*, one set per AIRAC cycle). For those
airport pairs, Generate flight uses the published route (real airways, e.g.
ZUUU→RKSI `GURET W233 AGULU … DONVO G597 AGAVO`) instead of VOR to VOR, and
Dispatch lets you pick between the published options. Limits:

* the files stay in your browser only (IndexedDB). They are CAAC
  publications, so they are not in this repo, the site or the backup;
* domestic flights are not in these lists, so ZUDC/ZUNZ still use VOR to VOR;
* international routes stop at the Chinese border fix; the foreign part is
  flown direct, so add it yourself;
* the lists have no coordinates. Fixes not in the open beacon data are left
  out of the distance (add them under *Waypoints* for an exact figure); the
  aircraft's FMC navdata has them;
* the *Overflying* list is not used (it joins border points, not airports);
* what the letter suffix on some route codes (e.g. `-01R`) means is not
  explained in the files: **UNVERIFIED**, check before using those.

The result looks like `ZBAA AAA DCT BBB DCT CCC RJTT`. It is flyable in the
FMC (type the beacon idents; pick the right one if the FMC offers several) but
**it is not an ATC airway route**, and it has no SID or STAR. Add those in the
FMC. Tuning values are `DEFAULT_ROUTE_OPTIONS` in
`src/simplanner/lib/autoplan.ts`.

## Small and high-elevation airports

SimPlanner is meant for airports SimBrief may lack, like ZUDC (Daocheng
Yading, 14,472 ft). For those it:

* climbs from and descends to the **field elevation**, not sea level;
* never suggests a cruise level below **10,000 ft above the higher airport**
  (ZUDC → at least FL250). There's no terrain data, so check MEA/grid MORA on
  your charts (Tibetan peaks exceed 20,000 ft);
* warns when an airport is above 8,000 ft (performance is much tighter) or
  its runway is shorter than the profile's `minRunwayFt`;
* picks runways only from real numbered runways, using the runway number
  when the data has no heading.

`src/simplanner/realdata.test.ts` plans ten flights around ZUDC, ZUNZ, ZUKD,
ZPDQ, ZPLJ, ZUJZ, ZLYS, ZUBD, ZUAL and ZULS for both the 737-800 and A320
profiles against the real data in this repository. It checks that routes
resolve, use only Chinese beacons, clear the minimum level, pick domestic
alternates and real runways, and that the random load fits. It runs in CI
on every deploy.

## Airport data

The website ships the airport data: `public/data/ourairports.json`, built
from OurAirports (public domain): large and medium airports, small ones with
an ICAO-style code, their runways, and VOR/NDB navaids.

The **Update airport data** GitHub Action
(`.github/workflows/update-airport-data.yml`) refreshes it on the 1st of each
month, commits it to this repository if anything changed, and redeploys the
site. Run it by hand from the repo's *Actions* tab
(**Update airport data → Run workflow**). The browser keeps a copy so the
planner also works offline. Airports you add on the *Airports* page are
stored in your browser and always take priority.

## Route strings

Example: `ZBAA SID WPT1 W5 WPT2 STAR RJTT`

| You type | Read as |
| --- | --- |
| `ZBAA`, `RJTT` | Airport (from your airports or OurAirports) |
| `WPT1` | A waypoint from *My waypoints* (nearest one if the ident repeats) |
| `W5`, `UL888`, `A593` | Airway (1–2 letters + digits). Flown **direct** between its entry and exit fixes |
| `SID`, `STAR`, `ELKUR1A` | Procedure. **Not modelled**: the leg runs direct from/to the airport |
| `DCT` | Direct |
| `4530N11630E`, `45N116E`, `40.08/116.58` | Coordinates |
| `N0450F350` | Speed/level group, ignored |

Anything not found is shown in red and left out of the distance, with a
warning. Courses are **true** great-circle courses; no magnetic variation is
applied.

### Plugging in your own navdata

SimPlanner ships no Navigraph/AIRAC data. Two ways to add your own:

* **Easiest:** paste waypoints as CSV on the *Waypoints* page.
* **In code:** implement `NavDataProvider` in `src/simplanner/lib/navdata.ts`
  (`findFix(ident)` returns candidate fixes; optional
  `expandAirway(airway, from, to)` returns the fixes along an airway). Add it
  to the providers list in `src/simplanner/state.tsx`. When a provider expands
  airways, the "flown direct" warning goes away for those legs.

## The fuel/time model

Simple on purpose. Every step is shown with your numbers under *How these
numbers were worked out* on the OFP (Fuel & weights tab).

```
climb time      = cruise altitude ÷ average climb rate
climb distance  = climb time × average climb ground speed
descent dist.   = (cruise altitude ÷ 1000) × descent nm per 1,000 ft   (3 = "3 to 1")
descent time    = descent distance ÷ descent speed
cruise distance = route distance − climb distance − descent distance
cruise time     = cruise distance ÷ (cruise TAS + average wind)
trip fuel       = Σ phase time × that phase's burn per hour
contingency     = max(contingency % × trip, minimum contingency minutes × holding burn)
alternate fuel  = same climb/cruise/descent model, arrival→alternate great circle,
                  at the profile's alternate cruise level, no wind
final reserve   = reserve minutes × holding burn
block fuel      = taxi + trip + contingency + alternate + final reserve + extra
ZFW = OEW + passengers × average weight + cargo
TOW = ZFW + block − taxi          LW = TOW − trip
```

If the route is too short for the cruise level, climb and descent are scaled
down to fit and you get a warning. Weight doesn't change burn in this model.

Checks against the profile: MZFW, MTOW, MLW, max fuel, max passengers, max
cargo. Anything over is shown in red at the top of the OFP, the briefing
and the kiosk.

All tuning values live in the aircraft profile (`performance`, `reserves`,
`defaults`). The shipped profiles are in `src/simplanner/defaults/profiles/`.

## Units

Each profile has `"units": "kg"` or `"lb"`; all its weights and burns are in
that unit. You can override per flight (*Units* on the Dispatch page); the
profile is converted, and the load inputs are converted when you switch.

## FMC cheat sheets

Plain-text templates in `src/simplanner/defaults/fmc/` (one per aircraft
family), editable on the *Aircraft* page (your edits are saved in the browser
and included in backups). Placeholders such as `{zfw_t}` (ZFW in thousands)
are filled from the plan; the full list is on the Aircraft page. Every page
name, button and field label is tagged **[UNVERIFIED]** until you confirm it.

## Backups and other devices

* Everything you create is in this browser's storage. **Settings → Download
  backup** saves one JSON file; **Restore** merges it back in (same names are
  replaced). The OurAirports import isn't in the backup; re-import it.
* **Copy share link** puts one flight (with the custom airports and waypoints
  it uses) in a link. Open it on another device to load the flight there.
* **Copy kiosk link** gives a read-only, large-text briefing (route, fuel,
  weights, limits, warnings, FMC sheet) that needs no storage and plain ES5
  JavaScript. Data travels in the `#…` part of the link, which browsers don't
  send to the web server.

## Kiosk in a sim EFB browser

**Untested.** I could not run MSFS 2024 or any add-on EFB from where this was
built. Whether an aircraft's EFB browser can open an external web page at all
depends on the aircraft. If one can, the kiosk page is the best candidate
(no modules, no storage, no external files). Treat it as an experiment.

## Assumptions

* Earth is a sphere (radius 3,440.065 nm): distances within about 0.5%.
* Average passenger weight includes baggage.
* Taxi fuel default = taxi burn per hour × typical taxi minutes (profile).
* Alternate is flown great circle, no wind, at `reserves.alternateCruiseFl`.
* Contingency has a floor of `reserves.minContingencyMin` minutes at holding burn.
* OurAirports: large, medium and small airports kept; heliports, seaplane
  bases, balloon ports and closed airports/runways dropped. The ICAO code is
  taken from `icao_code`, else a 4-letter `gps_code`, else `ident`.
* SID/STAR detection: letters + one digit + one letter (e.g. `ELKUR1A`).
  Every token read as a procedure is listed in the warnings so a wrong guess
  is visible.

## What could not be verified

* **Aircraft numbers:** all five profiles (PMDG 737-800, PMDG 777-200ER with
  GE90-94B / PW4090 / Trent 895 variants, iFly 737 MAX 8, Fenix A320,
  FSLabs A321) are round PLACEHOLDER figures of roughly the right size, not
  from any manual or performance data. The 777 variants are identical until
  you edit them.
* **FMC/MCDU page names, buttons and field labels** in all templates.
* **MSFS .pln import:** written in the documented FSX/MSFS AceXML format, with
  enroute points as *User* waypoints at their coordinates (no navdata region
  codes to reference real fixes). Not tested in MSFS 2024. Runways and
  procedures are not included; select them in the sim or FMC.
* **Little Navmap .lnmpln import:** written to the format described at
  https://www.littlenavmap.org/lnmpln.html, not validated against its schema or
  opened in Little Navmap. Little Navmap can also open the .pln.
* **PMDG/iFly/Fenix/FSLabs route import formats:** not produced. Type the route
  into the FMC using the cheat sheet.
* **Generated routes:** the beacon list comes from OurAirports, not the AIRAC
  cycle in MSFS 2024 or your aircraft's FMC. A beacon may be renamed,
  decommissioned or missing there. Check each ident in the FMC.
* **Cruise levels:** the east/west rule uses true course. China, Mongolia and
  some other states use metric flight levels; pick the metric level nearest
  the suggestion.
* **Live weather in the browser:** the NOAA API (with VATSIM as a fallback) is
  called directly from the page. I couldn't test that from the build
  environment, so if your browser blocks it you'll see the last saved reports
  or "No METAR available".
* **Airport data update:** the GitHub Action downloads from the OurAirports
  GitHub mirror and refuses to publish a suspiciously small file.
* **Kiosk in sim EFB browsers:** see above.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/simplanner/
npm test           # calculation, parsing, export and storage tests
npm run build
```

Code: `src/simplanner/` (React + TypeScript), entry `simplanner/index.html`,
kiosk `public/simplanner/kiosk.html`. Calculations are in `src/simplanner/lib/`
with tests alongside (`*.test.ts`).

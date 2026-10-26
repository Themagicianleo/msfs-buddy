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

## Quick start

1. **Airports:** on the *Airports* page press **Download from OurAirports**
   (about 15 MB, once per device). If that fails, download `airports.csv` and
   `runways.csv` from https://ourairports.com/data/ and use **Import files**.
   Add any missing or wrong airports under **My airports** (ICAO, lat/lon,
   elevation, runway idents, length, heading); yours always take priority.
2. **Waypoints:** add the fixes your route uses on the *Waypoints* page, one at
   a time or pasted as CSV (`IDENT,LAT,LON,NOTE`, decimal degrees).
3. **Aircraft:** on the *Aircraft* page, check every number in your profile
   against the aircraft's documentation, then set `"verified": true`.
4. **Plan:** fill in departure, arrival, alternate, aircraft, route, cruise
   level, passengers, cargo, average passenger weight, contingency %, final
   reserve time and taxi fuel. Results update as you type.
5. **Outputs:** *Briefing* (print or save as PDF), *FMC sheet*, **Copy route**,
   **MSFS .pln**, **Little Navmap** (.lnmpln), **Copy share link** and
   **Copy kiosk link**.

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
numbers were worked out* on the Plan page.

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
cargo. Anything over is shown in red at the top of the Plan page, the briefing
and the kiosk.

All tuning values live in the aircraft profile (`performance`, `reserves`,
`defaults`). The shipped profiles are in `src/simplanner/defaults/profiles/`.

## Units

Each profile has `"units": "kg"` or `"lb"`; all its weights and burns are in
that unit. You can override per flight (*Weight units* on the Plan page); the
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
* **Live weather in the browser:** the NOAA API (with VATSIM as a fallback) is
  called directly from the page. I couldn't test that from the build
  environment, so if your browser blocks it you'll see the last saved reports
  or "No METAR available".
* **OurAirports download in the browser:** fetched straight from the OurAirports
  GitHub mirror; untested from here. The file import is the fallback.
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

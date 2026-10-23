# MSFS Buddy — a mini EFB for Microsoft Flight Simulator

A browser-based electronic flight bag, styled after airliner tablet EFBs (like the
Fenix A320's), that pulls your latest flight plan from **SimBrief** and shows live
**METAR/TAF** for your airports, with **ChartFox** chart links. No Navigraph
subscription needed.

## Features

| Page | What it shows |
| --- | --- |
| **Flight** | Departure/arrival with planned runways and flight category, block times, fuel, weights, route |
| **OFP** | Full SimBrief OFP, the navlog table, and the ATC route / ICAO flight plan with copy buttons (handy for the MCDU) |
| **Map** | Route on a dark map, with waypoints and the alternate |
| **Weather** | Live METAR and TAF for DEP/ARR/ALTN plus any airport you add, decoded (wind, visibility, ceiling, QNH in hPa and inHg), flight category, headwind/crosswind for your runway. Refreshes every 5 minutes |
| **Charts** | ChartFox links for each airport, with the SID/STAR/runway to look for and a pop-out window to keep beside the sim |
| **Perf** | SimBrief takeoff/landing performance (V-speeds, FLEX, flaps) when you enable it in SimBrief, plus a takeoff card you fill in |
| **Loadsheet** | ZFW/TOW/LW against the limits, the fuel plan breakdown, pax and cargo |
| **Notes** | ATC clearance fields and a scratchpad. Saved in your browser |

## Running it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start          # builds the app and opens it at http://localhost:4173
```

While developing, `npm run dev` gives hot reload at http://localhost:5173.

Both commands send SimBrief and weather requests through a small local proxy, so
the browser never blocks them. To use the EFB on an iPad or phone while the sim
runs, open `http://<your-PC-IP>:4173` from the device (it has to be on the same
network).

### First-time setup

1. Open **Settings** and enter your SimBrief username or Pilot ID. You can find
   the Pilot ID under Account settings on simbrief.com.
2. Generate a flight on SimBrief, then press the ⟳ button in the top bar. The
   EFB also fetches your latest OFP each time it opens.
3. To get V-speeds on the Perf page, turn on *Takeoff / Landing Performance* in
   SimBrief's dispatch options.
4. Charts open on chartfox.org, where you sign in with a free ChartFox account.

You can press **Try a demo flight** to look around without a SimBrief account.

### Hosting it online (optional)

The included GitHub Actions workflow publishes the app to GitHub Pages. In the
repo, go to **Settings → Pages**, set the source to **GitHub Actions**, then push
to `main`. A hosted copy calls SimBrief, aviationweather.gov and VATSIM directly
from the browser. If a service blocks those cross-site requests, set a CORS proxy
under Settings → Advanced. If live weather can't be fetched at all, the EFB falls
back to the METAR/TAF stored in your OFP.

## Data sources

- Flight plans: [SimBrief](https://www.simbrief.com) (latest OFP via the public fetcher API)
- Weather: [aviationweather.gov](https://aviationweather.gov/data/api/), with [VATSIM METAR](https://metar.vatsim.net) as a fallback
- Charts: [ChartFox](https://chartfox.org)
- Map: © OpenStreetMap contributors, © CARTO

For flight simulation use only. Not for real-world navigation.

## Development

```bash
npm test           # METAR decoder and SimBrief parser tests
npm run typecheck
npm run build      # static build in dist/
```

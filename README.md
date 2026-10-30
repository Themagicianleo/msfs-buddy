# MSFS Buddy — a mini EFB for Microsoft Flight Simulator

A browser-based electronic flight bag, laid out like airliner tablet EFBs (such as
the Fenix A320's) and styled like a native iPad app (Liquid Glass navigation and controls, light and dark mode), that pulls your latest flight plan from **SimBrief** and shows live
**METAR/TAF** for your airports, with **ChartFox** chart links. No Navigraph
subscription needed.

> **Also here: [SimPlanner](simplanner/README.md)**, a flight planner for flights you enter by hand
> (no SimBrief needed): https://themagicianleo.github.io/msfs-buddy/simplanner/
> Its **Open in EFB** button shows a SimPlanner flight here, in place of the SimBrief one.

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
| **Logbook** | Log each flight from your SimBrief plan, tap **Now** to stamp OUT/OFF/ON/IN times, and add landing rate, fuel used, network and remarks. Shows totals (flights, hours, distance, average landing rate). Export to CSV, plus back up and restore |

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
5. If the EFB runs on the same PC as the sim and feels sluggish, turn on
   **Reduce transparency** in Settings to switch off the glass blur.

**Keeping your SimBrief ID:** it's saved in your browser, but some browsers
(especially in-app browsers and iOS Safari after a week unused) clear that.
Settings shows a personal link like `.../msfs-buddy/?user=123456`. Bookmark it,
or open it in Safari and use **Share → Add to Home Screen**, and the EFB always
opens with your ID set.

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
- Map: Esri dark grey canvas, with © OpenStreetMap contributors as a fallback

For flight simulation use only. Not for real-world navigation.

## Development

```bash
npm test           # METAR decoder and SimBrief parser tests
npm run typecheck
npm run build      # static build in dist/
```

# openAIP data (manually downloaded)

Files here are exports downloaded by hand from https://www.openaip.net and
merged into `public/data/ourairports.json` by `scripts/build-airport-data.ts`
(the **Update airport data** Action) on every run:

* `*_nav.json`: VOR/NDB beacons, added where OurAirports doesn't already have
  the same ident within 10 nm. Used by SimPlanner's VOR-to-VOR routes.
* `*_apt.json`: airports; only their runway **true headings** are used, to
  fill runways that have no heading in OurAirports.

| File | Country | Downloaded |
| --- | --- | --- |
| `cn_nav.json` | China | 2026-10-26 |
| `cn_apt.json` | China | 2026-10-26 |

To add another country, download its `xx_nav.json` / `xx_apt.json` from openAIP,
put them in this folder, and run the Action (or send them to Claude).

**Licence:** openAIP data is © openAIP contributors, licensed
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): free for
non-commercial use with attribution. Don't put licensed AIRAC/Navigraph data here.

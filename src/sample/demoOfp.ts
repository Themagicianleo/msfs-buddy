// A demo OFP shaped like SimBrief's xml.fetcher JSON output, so the EFB can be
// explored without a SimBrief account. Coordinates and figures are approximate.

const FIXES: [string, string, number, number, number, string, string][] = [
  // ident, airway, lat, lon, altitude ft, stage, type
  ['EGLL', '', 51.4706, -0.4619, 83, 'CLB', 'apt'],
  ['D254K', 'MID2G', 51.4363, -0.6488, 3000, 'CLB', 'wpt'],
  ['MID', 'MID2G', 51.0539, -0.625, 14000, 'CLB', 'vor'],
  ['HARDY', 'UL612', 50.3, -0.4, 27000, 'CLB', 'wpt'],
  ['XIDIL', 'UM605', 49.5, -0.17, 36000, 'CRZ', 'wpt'],
  ['PEKIM', 'UM605', 48.8, 0.15, 36000, 'CRZ', 'wpt'],
  ['OKRIX', 'UM605', 48.0, 0.5, 36000, 'CRZ', 'wpt'],
  ['LMG', 'UN460', 45.815, 1.025, 36000, 'CRZ', 'vor'],
  ['AGN', 'UN460', 43.888, 0.873, 36000, 'CRZ', 'vor'],
  ['TOU', 'UN871', 43.68, 1.31, 36000, 'CRZ', 'vor'],
  ['LOBAR', 'UN871', 42.65, 1.75, 30000, 'DSC', 'wpt'],
  ['SLL', 'LOBAR1W', 41.95, 1.95, 16000, 'DSC', 'vor'],
  ['CD24R', 'LOBAR1W', 41.36, 2.2, 3000, 'DSC', 'wpt'],
  ['LEBL', '', 41.2971, 2.0785, 14, 'DSC', 'apt'],
];

function distNm(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const d = Math.acos(
    Math.min(1, Math.sin(a[0] * r) * Math.sin(b[0] * r) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r)),
  );
  return (d * 180 * 60) / Math.PI;
}

function bearing(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return ((Math.atan2(y, x) / r + 360) % 360);
}

export function buildDemoOfp(): Record<string, any> {
  const now = Math.floor(Date.now() / 1000);
  const out = now + 30 * 60 - (now % 300);
  const taxiOut = 15 * 60;
  const block = 2 * 3600 + 5 * 60;
  const fuelStart = 7850;
  const burnPerNm = 7.1;

  let totalTime = 0;
  let used = 0;
  const fix = FIXES.map(([ident, via, lat, lon, alt, stage, type], i) => {
    const prev = i ? FIXES[i - 1] : null;
    const leg = prev ? distNm([prev[2], prev[3]], [lat, lon]) : 0;
    const gs = stage === 'CRZ' ? 452 : stage === 'CLB' ? 330 : 360;
    const legTime = prev ? Math.round((leg / gs) * 3600) : 0;
    totalTime += legTime;
    const legFuel = Math.round(leg * burnPerNm * (stage === 'CLB' ? 1.6 : stage === 'DSC' ? 0.5 : 1));
    used += legFuel;
    return {
      ident,
      name: ident,
      type,
      via_airway: via || (i ? 'DCT' : ''),
      stage,
      is_sid_star: via.match(/\d[A-Z]$/) ? '1' : '0',
      pos_lat: String(lat),
      pos_long: String(lon),
      altitude_feet: String(alt),
      wind_dir: String(250 + i * 3),
      wind_spd: String(alt > 20000 ? 45 + i : 15),
      oat: String(Math.round(15 - (alt / 1000) * 2)),
      track_mag: prev ? String(Math.round(bearing([prev[2], prev[3]], [lat, lon]))) : '',
      distance: String(Math.round(leg)),
      time_leg: String(legTime),
      time_total: String(totalTime),
      fuel_leg: String(legFuel),
      fuel_totalused: String(used),
      fuel_plan_onboard: String(fuelStart - 200 - used),
      mach: stage === 'CRZ' ? '.78' : '',
      ind_airspeed: String(stage === 'CRZ' ? 262 : 290),
      true_airspeed: String(stage === 'CRZ' ? 451 : 340),
      groundspeed: String(gs),
      frequency: type === 'vor' ? '115.10' : '',
    };
  });
  const routeDist = fix.reduce((acc, f) => acc + Number(f.distance), 0);

  const route = 'MID2G MID UL612 HARDY UM605 OKRIX DCT LMG UN460 AGN UN871 LOBAR LOBAR1W';
  const ofp = `<div style="line-height:14px;font-size:13px"><pre><b>[ OFP ]</b>
DEMO FLIGHT  EGLL-LEBL   A20N G-DEMO   DEMO OFP - NOT FOR REAL WORLD USE

FLT BAW478   23OCT26   EGLL/27R  LEBL/24R   AIRAC 2610
ROUTE: ${route}

FUEL       TIME   KG
TRIP       ${fmt(totalTime)}  ${used}
CONT 5%    0:06    ${Math.round(used * 0.05)}
ALTN LEGE  0:24    1180
FINRES     0:30    1080
EXTRA      0:05     190
TAXI               200
BLOCK FUEL         ${fuelStart}

</pre></div>`;

  return {
    fetch: { status: 'Success' },
    params: { request_id: 'demo', time_generated: String(now), airac: '2610', units: 'kgs' },
    general: {
      icao_airline: 'BAW',
      flight_number: '478',
      cruise_profile: 'CI 30',
      costindex: '30',
      initial_altitude: '36000',
      route,
      air_distance: String(routeDist + 12),
      gc_distance: '587',
      route_distance: String(routeDist),
      avg_wind_comp: '-12',
      avg_wind_dir: '262',
      avg_wind_spd: '41',
      passengers: '156',
      dx_rmk: ['DEMO OFP - GENERATE YOUR OWN FLIGHT ON SIMBRIEF'],
    },
    origin: {
      icao_code: 'EGLL', iata_code: 'LHR', name: 'London Heathrow', plan_rwy: '27R', elevation: '83',
      pos_lat: '51.4706', pos_long: '-0.4619', trans_alt: '6000', trans_level: '7000',
      metar: 'EGLL 231150Z AUTO 24012KT 9999 FEW028 BKN040 14/09 Q1012 NOSIG',
      taf: 'TAF EGLL 231059Z 2312/2418 24012KT 9999 BKN035 BECMG 2318/2321 22008KT TEMPO 2400/2406 7000 -RA',
    },
    destination: {
      icao_code: 'LEBL', iata_code: 'BCN', name: 'Barcelona El Prat', plan_rwy: '24R', elevation: '14',
      pos_lat: '41.2971', pos_long: '2.0785', trans_alt: '6000', trans_level: '7000',
      metar: 'LEBL 231200Z 22010KT 190V250 CAVOK 22/14 Q1018 NOSIG',
      taf: 'TAF LEBL 231100Z 2312/2418 22010KT CAVOK BECMG 2320/2322 32005KT',
    },
    alternate: {
      icao_code: 'LEGE', iata_code: 'GRO', name: 'Girona Costa Brava', plan_rwy: '20', elevation: '468',
      pos_lat: '41.9010', pos_long: '2.7605', trans_alt: '6000', trans_level: '7000',
      metar: 'LEGE 231200Z 18008KT 9999 FEW030 21/13 Q1018', taf: '',
    },
    aircraft: { icaocode: 'A20N', name: 'A320-251N', reg: 'G-DEMO', selcal: 'AB-CD' },
    atc: {
      callsign: 'BAW478',
      route: `N0451F360 ${route}`,
      flightplan_text: `(FPL-BAW478-IS\n-A20N/M-SDE3FGHIJ1RWXY/LB1\n-EGLL${fmt(out + taxiOut).replace(':', '')}\n-N0451F360 ${route}\n-LEBL0200 LEGE\n-PBN/A1B1C1D1O1S2 DOF/261023 REG/GDEMO)`,
    },
    times: {
      sched_out: String(out), sched_off: String(out + taxiOut), sched_on: String(out + taxiOut + totalTime),
      sched_in: String(out + block), est_out: String(out), est_off: String(out + taxiOut),
      est_on: String(out + taxiOut + totalTime), est_in: String(out + block),
      est_time_enroute: String(totalTime), est_block: String(block),
    },
    fuel: {
      taxi: '200', enroute_burn: String(used), contingency: String(Math.round(used * 0.05)),
      alternate_burn: '1180', reserve: '1080', extra: '190', min_takeoff: String(fuelStart - 390),
      plan_takeoff: String(fuelStart - 200), plan_ramp: String(fuelStart), plan_landing: String(fuelStart - 200 - used),
      avg_fuel_flow: '2410', max_tanks: '18728',
    },
    weights: {
      oew: '44300', pax_count: '156', bag_count: '140', pax_weight: '84', bag_weight: '15', cargo: '2100',
      payload: String(156 * 84 + 140 * 15 + 2100), est_zfw: String(44300 + 156 * 84 + 140 * 15 + 2100), max_zfw: '64300',
      est_tow: String(44300 + 156 * 84 + 140 * 15 + 2100 + fuelStart - 200), max_tow: '79000',
      est_ldw: String(44300 + 156 * 84 + 140 * 15 + 2100 + fuelStart - 200 - used), max_ldw: '67400',
      est_ramp: String(44300 + 156 * 84 + 140 * 15 + 2100 + fuelStart),
    },
    navlog: { fix },
    text: { plan_html: ofp },
    files: { directory: '', pdf: {} },
    images: { directory: '', map: [] },
    tlr: {
      takeoff: {
        conditions: { airport_icao: 'EGLL', planned_runway: '27R', wind_direction: '240', wind_speed: '12', temperature: '14', altimeter: '1012', surface_condition: 'dry', planned_weight: '72150' },
        runway: [
          { identifier: '27R', length_tora: '12802', flap_setting: 'CONF 1+F', thrust_setting: 'FLEX', flex_temperature: '54', speeds_v1: '141', speeds_vr: '143', speeds_v2: '147', max_weight: '79000', headwind_component: '10', crosswind_component: '-6', magnetic_course: '271' },
          { identifier: '27L', length_tora: '12008', flap_setting: 'CONF 1+F', thrust_setting: 'FLEX', flex_temperature: '52', speeds_v1: '140', speeds_vr: '143', speeds_v2: '147', max_weight: '79000', headwind_component: '10', crosswind_component: '-6', magnetic_course: '271' },
        ],
      },
      landing: {
        conditions: { airport_icao: 'LEBL', planned_runway: '24R', wind_direction: '220', wind_speed: '10', temperature: '22', altimeter: '1018', surface_condition: 'dry', planned_weight: '67100' },
        runway: [
          { identifier: '24R', length: '8727', flap_setting: 'CONF FULL', speeds_vref: '133', max_weight_dry: '67400', headwind_component: '9', crosswind_component: '-3', magnetic_course: '245', actual_distance: '4510' },
          { identifier: '24L', length: '11155', flap_setting: 'CONF FULL', speeds_vref: '133', max_weight_dry: '67400', headwind_component: '9', crosswind_component: '-3', magnetic_course: '245', actual_distance: '4510' },
        ],
      },
    },
  };
}

function fmt(sec: number) {
  if (sec > 86400) {
    const d = new Date(sec * 1000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }
  const m = Math.round(sec / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

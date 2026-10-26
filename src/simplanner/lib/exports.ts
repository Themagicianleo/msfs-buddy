// Flight plan files.
//
// MSFS .pln: the AceXML "SimBase.Document" format used by FSX and MSFS.
// All enroute points are written as User waypoints at their coordinates,
// because SimPlanner has no navdata region codes to reference real fixes.
// Little Navmap .lnmpln: LNM's own XML format (documented at
// https://www.littlenavmap.org/lnmpln.html). Little Navmap can also open
// the .pln. Neither file has been tested in MSFS 2024 or Little Navmap from
// here; see README "What could not be verified".

import { toDms } from './geo';
import type { RoutePoint } from './route';

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

function lla(p: { lat: number; lon: number }, altFt = 0) {
  const sign = altFt < 0 ? '-' : '+';
  return `${toDms(p.lat, true)},${toDms(p.lon, false)},${sign}${Math.abs(altFt).toFixed(2).padStart(9, '0')}`;
}

export interface ExportFlight {
  dep: RoutePoint & { elevationFt?: number | null };
  arr: RoutePoint & { elevationFt?: number | null };
  enroute: RoutePoint[];
  cruiseAltFt: number;
  title: string;
}

/**
 * Unique, MSFS-friendly ids for user waypoints. Coordinate points become
 * WP1, WP2, … because their written form (4000N12000E) makes long names.
 */
function waypointId(p: RoutePoint, used: Set<string>, coordNo: { n: number }): string {
  const generated = () => `WP${++coordNo.n}`;
  let id = (p.type === 'coord' ? generated() : p.ident).replace(/[^A-Z0-9]/gi, '').slice(0, 10).toUpperCase() || generated();
  const base = id;
  let k = 2;
  while (used.has(id)) id = `${base.slice(0, 8)}${k++}`;
  used.add(id);
  return id;
}

export function buildPln(f: ExportFlight): string {
  const used = new Set<string>([f.dep.ident, f.arr.ident]);
  const coordNo = { n: 0 };
  const wp = (id: string, type: string, p: { lat: number; lon: number }, alt: number, icao?: string) =>
    [
      `        <ATCWaypoint id="${esc(id)}">`,
      `            <ATCWaypointType>${type}</ATCWaypointType>`,
      `            <WorldPosition>${lla(p, alt)}</WorldPosition>`,
      ...(icao ? ['            <ICAO>', `                <ICAOIdent>${esc(icao)}</ICAOIdent>`, '            </ICAO>'] : []),
      '        </ATCWaypoint>',
    ].join('\n');
  const depAlt = f.dep.elevationFt ?? 0;
  const arrAlt = f.arr.elevationFt ?? 0;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<SimBase.Document Type="AceXML" version="1,0">',
    '    <Descr>AceXML Document</Descr>',
    '    <FlightPlan.FlightPlan>',
    `        <Title>${esc(f.title)}</Title>`,
    '        <FPType>IFR</FPType>',
    '        <RouteType>HighAlt</RouteType>',
    `        <CruisingAlt>${Math.round(f.cruiseAltFt)}.000</CruisingAlt>`,
    `        <DepartureID>${esc(f.dep.ident)}</DepartureID>`,
    `        <DepartureLLA>${lla(f.dep, depAlt)}</DepartureLLA>`,
    `        <DestinationID>${esc(f.arr.ident)}</DestinationID>`,
    `        <DestinationLLA>${lla(f.arr, arrAlt)}</DestinationLLA>`,
    `        <Descr>${esc(f.dep.ident)}, ${esc(f.arr.ident)} (SimPlanner)</Descr>`,
    `        <DepartureName>${esc(f.dep.name ?? f.dep.ident)}</DepartureName>`,
    `        <DestinationName>${esc(f.arr.name ?? f.arr.ident)}</DestinationName>`,
    '        <AppVersion>',
    '            <AppVersionMajor>11</AppVersionMajor>',
    '            <AppVersionBuild>282174</AppVersionBuild>',
    '        </AppVersion>',
    wp(f.dep.ident, 'Airport', f.dep, depAlt, f.dep.ident),
    ...f.enroute.map((p) => wp(waypointId(p, used, coordNo), 'User', p, 0)),
    wp(f.arr.ident, 'Airport', f.arr, arrAlt, f.arr.ident),
    '    </FlightPlan.FlightPlan>',
    '</SimBase.Document>',
    '',
  ].join('\n');
}

export function buildLnmpln(f: ExportFlight, now = new Date()): string {
  const used = new Set<string>([f.dep.ident, f.arr.ident]);
  const coordNo = { n: 0 };
  const wp = (ident: string, type: string, p: { lat: number; lon: number }, alt: number, name?: string) =>
    [
      '      <Waypoint>',
      ...(name ? [`        <Name>${esc(name)}</Name>`] : []),
      `        <Ident>${esc(ident)}</Ident>`,
      `        <Type>${type}</Type>`,
      `        <Pos Lon="${p.lon.toFixed(6)}" Lat="${p.lat.toFixed(6)}" Alt="${alt.toFixed(2)}"/>`,
      '      </Waypoint>',
    ].join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<LittleNavmap xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="https://www.littlenavmap.org/schema/lnmpln.xsd">',
    '  <Flightplan>',
    '    <Header>',
    '      <FlightplanType>IFR</FlightplanType>',
    `      <CruisingAlt>${Math.round(f.cruiseAltFt)}</CruisingAlt>`,
    `      <CreationDate>${now.toISOString().slice(0, 19)}</CreationDate>`,
    '      <FileVersion>1.0</FileVersion>',
    '      <ProgramName>SimPlanner</ProgramName>',
    '      <ProgramVersion>0.1</ProgramVersion>',
    '      <Documentation>https://www.littlenavmap.org/lnmpln.html</Documentation>',
    '    </Header>',
    '    <Waypoints>',
    wp(f.dep.ident, 'AIRPORT', f.dep, f.dep.elevationFt ?? 0, f.dep.name),
    ...f.enroute.map((p) => wp(waypointId(p, used, coordNo), 'USER', p, f.cruiseAltFt, p.type === 'coord' ? p.ident : p.name)),
    wp(f.arr.ident, 'AIRPORT', f.arr, f.arr.elevationFt ?? 0, f.arr.name),
    '    </Waypoints>',
    '  </Flightplan>',
    '</LittleNavmap>',
    '',
  ].join('\n');
}

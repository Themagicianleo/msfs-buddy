import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FlightPlan } from '../lib/simbrief';

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const ROUTE = '#0a84ff';
export const ALTN = '#ff9f0a';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';

// Esri's grey canvas needs no API key. If its tiles keep failing, switch to
// standard OpenStreetMap tiles (darkened with a CSS filter in dark mode).
function addBasemap(map: L.Map, theme: 'light' | 'dark') {
  const canvas = theme === 'dark' ? 'World_Dark_Gray' : 'World_Light_Gray';
  const base = L.tileLayer(`${ESRI}/${canvas}_Base/MapServer/tile/{z}/{y}/{x}`, {
    attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    maxZoom: 16,
  }).addTo(map);
  const labels = L.tileLayer(`${ESRI}/${canvas}_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }).addTo(map);

  let errors = 0;
  base.on('tileerror', () => {
    if (++errors !== 6) return;
    map.removeLayer(base);
    map.removeLayer(labels);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
      className: theme === 'dark' ? 'tiles-dimmed' : '',
    }).addTo(map);
  });
}

/**
 * Leaflet map of the planned route. `interactive: false` gives a static
 * backdrop (used behind the Flight page's glass card); `padding` keeps the
 * route clear of whatever floats over the map.
 */
export function RouteMap({ plan, theme, interactive = true, padding = [40, 40, 40, 40], className = '' }: {
  plan: FlightPlan;
  theme: 'light' | 'dark';
  interactive?: boolean;
  padding?: [number, number, number, number]; // top, right, bottom, left
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [pt, pr, pb, pl] = padding;

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, {
      zoomControl: interactive,
      attributionControl: false,
      worldCopyJump: true,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
    });
    L.control.attribution({ position: interactive ? 'bottomright' : 'topright' }).addTo(map);
    addBasemap(map, theme);

    const pts = plan.navlog.filter((f) => f.lat !== null && f.lon !== null);
    const latlngs = pts.map((f) => L.latLng(f.lat!, f.lon!));
    for (const a of [plan.origin, plan.destination]) {
      if (!pts.length && a.lat !== null && a.lon !== null) latlngs.push(L.latLng(a.lat, a.lon));
    }

    // Keep the line continuous across the antimeridian.
    for (let i = 1; i < latlngs.length; i++) {
      while (latlngs[i].lng - latlngs[i - 1].lng > 180) latlngs[i] = L.latLng(latlngs[i].lat, latlngs[i].lng - 360);
      while (latlngs[i].lng - latlngs[i - 1].lng < -180) latlngs[i] = L.latLng(latlngs[i].lat, latlngs[i].lng + 360);
    }

    // Route styled like Apple Maps directions: a solid blue line with white stops.
    L.polyline(latlngs, { color: ROUTE, weight: 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive }).addTo(map);

    pts.forEach((f, i) => {
      const isApt = f.type === 'apt' || i === 0 || i === pts.length - 1;
      if (!interactive && !isApt) return;
      const marker = L.circleMarker(latlngs[i], {
        radius: isApt ? 7 : 3.5,
        color: isApt ? '#ffffff' : ROUTE,
        fillColor: isApt ? ROUTE : '#ffffff',
        fillOpacity: 1,
        weight: isApt ? 3 : 2,
        interactive,
      }).addTo(map);
      marker.bindTooltip(`<b>${esc(f.ident)}</b>`, {
        permanent: isApt || pts.length < 40,
        direction: 'right',
        className: 'map-label',
        offset: [6, 0],
      });
      if (interactive) {
        const alt = f.altitude ? (f.altitude >= 10000 ? 'FL' + Math.round(f.altitude / 100) : f.altitude + ' ft') : '';
        marker.bindPopup(`<b>${esc(f.ident)}</b>${f.via ? ` via ${esc(f.via)}` : ''}<br/>${alt}`, { className: 'map-popup' });
      }
    });

    plan.alternates.forEach((a) => {
      if (a.lat === null || a.lon === null) return;
      const ll = L.latLng(a.lat, a.lon);
      L.circleMarker(ll, { radius: 6, color: '#ffffff', fillColor: ALTN, fillOpacity: 1, weight: 3, interactive })
        .addTo(map)
        .bindTooltip(`<b>${esc(a.icao)}</b> ALTN`, { permanent: true, direction: 'right', className: 'map-label', offset: [6, 0] });
      const last = latlngs[latlngs.length - 1];
      if (last) L.polyline([last, ll], { color: ALTN, weight: 3, dashArray: '2 7', lineCap: 'round', interactive }).addTo(map);
    });

    if (latlngs.length) {
      map.fitBounds(L.latLngBounds(latlngs), { paddingTopLeft: [pl, pt], paddingBottomRight: [pr, pb], maxZoom: 9 });
    } else {
      map.setView([30, 0], 2);
    }

    // Refit when the container is resized (sidebar, rotation).
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      map.remove();
    };
  }, [plan, theme, interactive, pt, pr, pb, pl]);

  return <div ref={el} className={`map ${className}`} />;
}

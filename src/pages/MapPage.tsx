import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NoPlan } from '../components/ui';
import type { FlightPlan } from '../lib/simbrief';
import type { Settings } from '../lib/storage';

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';

// Esri's dark grey canvas needs no API key. If its tiles keep failing, switch
// to standard OpenStreetMap tiles, darkened with a CSS filter (.tiles-dimmed).
function addBasemap(map: L.Map) {
  const base = L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
    attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    maxZoom: 16,
  }).addTo(map);
  const labels = L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 }).addTo(map);

  let errors = 0;
  base.on('tileerror', () => {
    if (++errors !== 6) return;
    map.removeLayer(base);
    map.removeLayer(labels);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
      className: 'tiles-dimmed',
    }).addTo(map);
  });
}

export function MapPage({ plan }: { plan: FlightPlan | null; settings: Settings }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!plan || !el.current) return;
    const map = L.map(el.current, { zoomControl: true, attributionControl: true, worldCopyJump: true });
    addBasemap(map);

    const pts = plan.navlog.filter((f) => f.lat !== null && f.lon !== null);
    const latlngs = pts.map((f) => L.latLng(f.lat!, f.lon!));
    if (plan.origin.lat !== null && plan.origin.lon !== null && !pts.length) latlngs.push(L.latLng(plan.origin.lat, plan.origin.lon));
    if (plan.destination.lat !== null && plan.destination.lon !== null && !pts.length) latlngs.push(L.latLng(plan.destination.lat, plan.destination.lon));

    // Keep the line continuous across the antimeridian.
    for (let i = 1; i < latlngs.length; i++) {
      while (latlngs[i].lng - latlngs[i - 1].lng > 180) latlngs[i] = L.latLng(latlngs[i].lat, latlngs[i].lng - 360);
      while (latlngs[i].lng - latlngs[i - 1].lng < -180) latlngs[i] = L.latLng(latlngs[i].lat, latlngs[i].lng + 360);
    }

    L.polyline(latlngs, { color: '#e040fb', weight: 3 }).addTo(map);

    pts.forEach((f, i) => {
      const isApt = f.type === 'apt' || i === 0 || i === pts.length - 1;
      const marker = L.circleMarker(latlngs[i], {
        radius: isApt ? 6 : 3.5,
        color: isApt ? '#39b7ea' : '#fff',
        fillColor: isApt ? '#39b7ea' : '#16191d',
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
      const alt = f.altitude ? (f.altitude >= 10000 ? 'FL' + Math.round(f.altitude / 100) : f.altitude + ' ft') : '';
      marker.bindTooltip(`<b>${esc(f.ident)}</b>`, {
        permanent: isApt || pts.length < 40,
        direction: 'right',
        className: 'map-label',
        offset: [6, 0],
      });
      marker.bindPopup(`<b>${esc(f.ident)}</b>${f.via ? ` via ${esc(f.via)}` : ''}<br/>${alt}`, { className: 'map-popup' });
    });

    plan.alternates.forEach((a) => {
      if (a.lat === null || a.lon === null) return;
      const ll = L.latLng(a.lat, a.lon);
      L.circleMarker(ll, { radius: 5, color: '#f0b429', fillColor: '#f0b429', fillOpacity: 1 })
        .addTo(map)
        .bindTooltip(`<b>${esc(a.icao)}</b> ALTN`, { permanent: true, direction: 'right', className: 'map-label', offset: [6, 0] });
      const last = latlngs[latlngs.length - 1];
      if (last) L.polyline([last, ll], { color: '#f0b429', weight: 2, dashArray: '6 6' }).addTo(map);
    });

    if (latlngs.length) map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
    else map.setView([30, 0], 2);

    return () => {
      map.remove();
    };
  }, [plan]);

  if (!plan) return <NoPlan what="the map" />;

  return (
    <div className="page page-fill">
      <div className="map-wrap">
        <div ref={el} className="map" />
        <div className="map-legend">
          <span><i style={{ background: '#e040fb' }} /> Route</span>
          <span><i style={{ background: '#f0b429' }} /> Alternate</span>
        </div>
      </div>
      {plan.mapImages.length > 0 && (
        <details className="sb-maps">
          <summary>SimBrief route maps ({plan.mapImages.length})</summary>
          <div className="sb-map-grid">
            {plan.mapImages.map((m) => (
              <figure key={m.url}>
                <img src={m.url} alt={m.name} loading="lazy" />
                <figcaption>{m.name}</figcaption>
              </figure>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

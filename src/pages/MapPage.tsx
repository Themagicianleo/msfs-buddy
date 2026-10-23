import { NoPlan } from '../components/ui';
import { ALTN, ROUTE, RouteMap } from '../components/RouteMap';
import type { FlightPlan } from '../lib/simbrief';
import type { Settings } from '../lib/storage';

export function MapPage({ plan, theme = 'dark' }: { plan: FlightPlan | null; settings: Settings; theme?: 'light' | 'dark' }) {
  if (!plan) return <NoPlan what="the map" />;

  return (
    <div className="page page-fill">
      <div className="map-wrap">
        <RouteMap plan={plan} theme={theme} />
        <div className="map-legend">
          <span><i style={{ background: ROUTE }} /> Route</span>
          <span><i style={{ background: ALTN }} /> Alternate</span>
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

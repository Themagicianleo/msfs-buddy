import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './state';
import { DispatchPage } from './pages/DispatchPage';
import { OfpPage } from './pages/OfpPage';
import { AircraftPage, AirportsPage, FlightsPage, SettingsPage, WaypointsPage } from './pages/DataPages';
import { decodeShare } from './lib/store';
import type { SharedFlight } from './lib/snapshot';
import { AppShell, ClockCapsule, type AppLink, type NavItem } from '../shared/AppShell';

const PAGES = [
  ['dispatch', 'Dispatch'],
  ['ofp', 'OFP'],
  ['flights', 'Flights'],
  ['airports', 'Airports'],
  ['waypoints', 'Waypoints'],
  ['aircraft', 'Aircraft'],
  ['settings', 'Settings'],
] as const;
type PageId = (typeof PAGES)[number][0];

const item = (id: PageId): NavItem<PageId> => ({ id, label: PAGES.find(([p]) => p === id)![1], icon: id });
const TABS = (['dispatch', 'ofp', 'flights'] as PageId[]).map(item);
const MORE = (['airports', 'waypoints', 'aircraft', 'settings'] as PageId[]).map(item);
const LINKS: AppLink[] = [{ href: import.meta.env.BASE_URL, label: 'EFB', icon: 'efb' }];
const TITLES: Record<PageId, string> = { dispatch: 'Plan a flight', ofp: 'Flight plan', flights: 'Flights', airports: 'Airports', waypoints: 'Waypoints', aircraft: 'Aircraft', settings: 'Settings' };

function useHashPage(): PageId {
  const read = () => {
    const h = location.hash.replace(/^#/, '').split('=')[0];
    // Old links (#plan, #briefing, #fmc) land on the new pages.
    const alias: Record<string, PageId> = { plan: 'dispatch', briefing: 'ofp', fmc: 'ofp' };
    const id = alias[h] ?? h;
    return (PAGES.some(([p]) => p === id) ? id : 'dispatch') as PageId;
  };
  const [page, setPage] = useState<PageId>(read);
  useEffect(() => {
    const on = () => {
      setPage(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return page;
}

/** Opening a share link (#import=…) offers to load that flight. */
function ShareImport() {
  const app = useApp();
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const m = location.hash.match(/^#import=(.+)$/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + '#ofp');
    try {
      const shared = decodeShare<SharedFlight>(m[1]);
      if (shared.app !== 'simplanner-flight') throw new Error();
      const icaos = new Set(shared.airports.map((a) => a.icao.toUpperCase()));
      // Database airports from the sender are only added if this device can't find them.
      const missing = (shared.refAirports ?? [])
        .filter((a) => !icaos.has(a.icao.toUpperCase()) && !app.index.get(a.icao))
        .map((a) => ({ ...a, name: `${a.name} (from share link)`, source: 'custom' as const }));
      const added = [...shared.airports, ...missing];
      const addedIcaos = new Set(added.map((a) => a.icao.toUpperCase()));
      const airports = [...app.store.airports.filter((a) => !addedIcaos.has(a.icao.toUpperCase())), ...added];
      const have = new Set(app.store.waypoints.map((w) => `${w.ident}@${w.lat},${w.lon}`));
      const waypoints = [...app.store.waypoints, ...shared.waypoints.filter((w) => !have.has(`${w.ident}@${w.lat},${w.lon}`))];
      app.replaceStore({ ...app.store, airports, waypoints, draft: { ...shared.inputs, routeMode: 'manual' } });
      setMsg(`Loaded shared flight ${shared.inputs.dep} → ${shared.inputs.arr} (${added.length} airports and ${shared.waypoints.length} waypoints added).`);
    } catch {
      setMsg('That share link could not be read. It may have been cut off when copying.');
    }
    // Runs once on start-up.
  }, []);
  if (!msg) return null;
  return <div className="banner banner-info" onClick={() => setMsg('')}>{msg}</div>;
}

function Shell() {
  const page = useHashPage();
  const { inputs } = useApp();
  const subtitle = page === 'ofp' && inputs.dep && inputs.arr ? `${inputs.flightNo ? `${inputs.flightNo} · ` : ''}${inputs.dep} – ${inputs.arr}` : undefined;
  return (
    <AppShell
      name="SimPlanner"
      actions={<ClockCapsule />}
      title={TITLES[page]}
      subtitle={subtitle}
      tabs={TABS}
      more={MORE}
      links={LINKS}
      page={page}
      onSelect={(p) => (location.hash = `#${p}`)}
    >
      <ShareImport />
      {page === 'dispatch' && <DispatchPage />}
      {page === 'ofp' && <OfpPage />}
      {page === 'flights' && <FlightsPage />}
      {page === 'airports' && <AirportsPage />}
      {page === 'waypoints' && <WaypointsPage />}
      {page === 'aircraft' && <AircraftPage />}
      {page === 'settings' && <SettingsPage />}
    </AppShell>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

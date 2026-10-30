import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './components/Icon';
import { LINKS, MORE, PAGE_TITLES, TABS, type Page } from './components/nav';
import { AppShell, ClockCapsule } from './shared/AppShell';
import { FlightPage } from './pages/FlightPage';
import { OfpPage } from './pages/OfpPage';
import { MapPage } from './pages/MapPage';
import { WeatherPage } from './pages/WeatherPage';
import { ChartsPage } from './pages/ChartsPage';
import { PerfPage } from './pages/PerfPage';
import { LoadsheetPage } from './pages/LoadsheetPage';
import { NotesPage } from './pages/NotesPage';
import { LogbookPage } from './pages/LogbookPage';
import { SettingsPage } from './pages/SettingsPage';
import { fetchLatestOfp, normalise, type FlightPlan } from './lib/simbrief';
import { DEFAULT_SETTINGS, load, save, usePersistent, type Settings } from './lib/storage';
import { setCorsProxy } from './lib/http';
import { buildDemoOfp } from './sample/demoOfp';
import { applyTheme, useResolvedTheme } from './lib/theme';

export type LoadState = { status: 'idle' | 'loading' | 'ok' | 'error'; message?: string; at?: Date };

export default function App() {
  const [page, setPage] = usePersistent<Page>('page', 'flight');
  const [stored, setSettings] = usePersistent<Settings>('settings', DEFAULT_SETTINGS);
  // Settings saved by older versions may lack newer keys.
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  const [plan, setPlan] = useState<FlightPlan | null>(() => load<FlightPlan | null>('plan', null));
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  // Each page starts at the top, with the large title showing.
  useEffect(() => window.scrollTo(0, 0), [page]);

  const theme = useResolvedTheme(settings.appearance);
  useEffect(() => applyTheme(theme), [theme]);

  setCorsProxy(settings.corsProxy);

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const p = await fetchLatestOfp(settings.simbriefUser);
      setPlan(p);
      save('plan', p);
      setState({ status: 'ok', at: new Date() });
    } catch (e) {
      setState({ status: 'error', message: (e as Error).message });
    }
  }, [settings.simbriefUser]);

  const loadDemo = useCallback(() => {
    const p = normalise(buildDemoOfp());
    setPlan(p);
    save('plan', p);
    setState({ status: 'ok', at: new Date(), message: 'Demo flight loaded' });
    setPage('flight');
  }, [setPage]);

  // Pull the latest OFP on start-up, and whenever the SimBrief user changes.
  // A flight sent from SimPlanner is kept on start-up (as if already fetched
  // for this user); the refresh button still fetches SimBrief.
  const fetchedFor = useRef(plan?.source === 'simplanner' ? settings.simbriefUser : null);
  useEffect(() => {
    if (!settings.simbriefUser || settings.simbriefUser === fetchedFor.current) return;
    fetchedFor.current = settings.simbriefUser;
    void refresh();
  }, [refresh, settings.simbriefUser]);

  // SimPlanner (another page of this site) can send a flight while the EFB is open in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'msfs-buddy.plan' || !e.newValue) return;
      try {
        setPlan(JSON.parse(e.newValue) as FlightPlan);
        setState({ status: 'ok', at: new Date(), message: 'Flight from SimPlanner' });
      } catch {
        // ignore a half-written value
      }
    };
    addEventListener('storage', onStorage);
    return () => removeEventListener('storage', onStorage);
  }, []);

  const common = { plan, settings, theme };

  const actions = (
    <>
      {state.status === 'error' && <span className="pill danger" title={state.message}>SimBrief error</span>}
      <ClockCapsule local={settings.showLocalTime} hour12={!settings.clock24} />
      <button className="capsule icon" onClick={refresh} title="Fetch latest SimBrief OFP" disabled={state.status === 'loading'}>
        <span className={state.status === 'loading' ? 'spin' : ''}><Icon name="refresh" size={20} /></span>
      </button>
    </>
  );
  const subtitle = plan && [plan.callsign || plan.flightNumber, `${plan.origin.icao} – ${plan.destination.icao}`, plan.aircraft.icao, plan.source === 'simplanner' ? 'from SimPlanner' : ''].filter(Boolean).join(' · ');

  return (
    <AppShell name="EFB" actions={actions} title={PAGE_TITLES[page]} subtitle={subtitle} tabs={TABS} more={MORE} links={LINKS} page={page} onSelect={setPage} solid={settings.reduceTransparency}>
      {page === 'flight' && (
        <FlightPage {...common} state={state} onRefresh={refresh} onDemo={loadDemo} onGoto={setPage} />
      )}
      {page === 'ofp' && <OfpPage {...common} />}
      {page === 'map' && <MapPage {...common} />}
      {page === 'weather' && <WeatherPage {...common} />}
      {page === 'charts' && <ChartsPage {...common} />}
      {page === 'perf' && <PerfPage {...common} />}
      {page === 'loadsheet' && <LoadsheetPage {...common} />}
      {page === 'notes' && <NotesPage {...common} />}
      {page === 'logbook' && <LogbookPage {...common} />}
      {page === 'settings' && (
        <SettingsPage settings={settings} onChange={setSettings} onRefresh={refresh} onDemo={loadDemo} state={state} />
      )}
    </AppShell>
  );
}

import type { AppLink, NavItem } from '../shared/AppShell';

export type Page = 'flight' | 'ofp' | 'map' | 'weather' | 'charts' | 'perf' | 'loadsheet' | 'notes' | 'logbook' | 'settings';

export const PAGE_TITLES: Record<Page, string> = {
  flight: 'Flight',
  ofp: 'OFP',
  map: 'Map',
  weather: 'Weather',
  charts: 'Charts',
  perf: 'Performance',
  loadsheet: 'Loadsheet',
  notes: 'Notes',
  logbook: 'Logbook',
  settings: 'Settings',
};

const item = (id: Page): NavItem<Page> => ({ id, label: PAGE_TITLES[id], icon: id });

// The tab bar holds the briefing; everything else is under More.
export const TABS = (['flight', 'ofp', 'weather', 'charts'] as Page[]).map(item);
export const MORE = (['map', 'perf', 'loadsheet', 'notes', 'logbook', 'settings'] as Page[]).map(item);

// SimPlanner is a separate page on the same site (hand-entered flight planning).
export const LINKS: AppLink[] = [{ href: `${import.meta.env.BASE_URL}simplanner/`, label: 'SimPlanner', icon: 'planner' }];

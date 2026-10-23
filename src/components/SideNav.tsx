import { useState } from 'react';
import { Icon } from './Icon';

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

const SECTIONS: { title: string; items: Page[] }[] = [
  { title: 'Briefing', items: ['flight', 'ofp', 'map', 'weather', 'charts'] },
  { title: 'Aircraft', items: ['perf', 'loadsheet'] },
  { title: 'Pilot', items: ['notes', 'logbook'] },
];

// The phone tab bar shows these; everything else lives under More.
const TABS: Page[] = ['flight', 'weather', 'charts', 'logbook'];

export function SideNav({ page, onSelect }: { page: Page; onSelect: (p: Page) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = !TABS.includes(page);

  const pick = (p: Page) => {
    setMoreOpen(false);
    onSelect(p);
  };

  return (
    <>
      <nav className="sidebar" aria-label="Pages">
        <div className="sidebar-title">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={30} height={30} />
          EFB
        </div>
        {SECTIONS.map((s) => (
          <div key={s.title} className="sidebar-section">
            <div className="sidebar-heading">{s.title}</div>
            {s.items.map((id) => (
              <button key={id} className={`sidebar-row ${page === id ? 'active' : ''}`} onClick={() => pick(id)}>
                <Icon name={id} size={20} />
                <span>{PAGE_TITLES[id]}</span>
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar-spacer" />
        <button className={`sidebar-row ${page === 'settings' ? 'active' : ''}`} onClick={() => pick('settings')}>
          <Icon name="settings" size={20} />
          <span>Settings</span>
        </button>
      </nav>

      <nav className="tabbar" aria-label="Pages">
        {TABS.map((id) => (
          <button key={id} className={`tab-item ${page === id && !moreOpen ? 'active' : ''}`} onClick={() => pick(id)}>
            <Icon name={id} size={24} />
            <span>{PAGE_TITLES[id]}</span>
          </button>
        ))}
        <button className={`tab-item ${inMore || moreOpen ? 'active' : ''}`} onClick={() => setMoreOpen(!moreOpen)}>
          <Icon name="more" size={24} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grabber" />
            <div className="list">
              {(['ofp', 'map', 'perf', 'loadsheet', 'notes', 'settings'] as Page[]).map((id) => (
                <button key={id} className={`list-row ${page === id ? 'active' : ''}`} onClick={() => pick(id)}>
                  <span className="list-icon"><Icon name={id} size={20} /></span>
                  <span className="list-label">{PAGE_TITLES[id]}</span>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

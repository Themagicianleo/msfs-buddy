import { Icon } from './Icon';

export type Page = 'flight' | 'ofp' | 'map' | 'weather' | 'charts' | 'perf' | 'loadsheet' | 'notes' | 'settings';

const ITEMS: { id: Page; label: string }[] = [
  { id: 'flight', label: 'Flight' },
  { id: 'ofp', label: 'OFP' },
  { id: 'map', label: 'Map' },
  { id: 'weather', label: 'Weather' },
  { id: 'charts', label: 'Charts' },
  { id: 'perf', label: 'Perf' },
  { id: 'loadsheet', label: 'Loadsheet' },
  { id: 'notes', label: 'Notes' },
];

export function SideNav({ page, onSelect }: { page: Page; onSelect: (p: Page) => void }) {
  return (
    <nav className="sidenav">
      {ITEMS.map((it) => (
        <button key={it.id} className={`nav-btn ${page === it.id ? 'active' : ''}`} onClick={() => onSelect(it.id)}>
          <Icon name={it.id} />
          <span>{it.label}</span>
        </button>
      ))}
      <div className="nav-spacer" />
      <button className={`nav-btn ${page === 'settings' ? 'active' : ''}`} onClick={() => onSelect('settings')}>
        <Icon name="settings" />
        <span>Settings</span>
      </button>
    </nav>
  );
}

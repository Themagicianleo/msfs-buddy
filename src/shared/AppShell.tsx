// The frame both apps share (Light Scout's layout): a brand and floating glass
// capsules at the top, a large title, the page, and a floating tab bar with a
// "More" menu for everything that doesn't fit.

import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';

export interface NavItem<T extends string> {
  id: T;
  label: string;
  icon: string;
}

export interface AppLink {
  href: string;
  label: string;
  icon: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** UTC clock capsule, with local time on wider screens. */
export function ClockCapsule({ local = false, hour12 = false, children }: { local?: boolean; hour12?: boolean; children?: ReactNode }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const utc = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  return (
    <div className="capsule">
      <span className="clock-utc">{utc}</span>
      <span className="clock-caption">UTC{local && ` · ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12 })}`}</span>
      {children}
    </div>
  );
}

export function AppShell<T extends string>({ name, actions, title, subtitle, tabs, more, links, page, onSelect, solid, children }: {
  name: string;
  actions?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** Shown in the tab bar (up to four). */
  tabs: NavItem<T>[];
  /** Shown under More. */
  more: NavItem<T>[];
  /** Other apps, at the bottom of More. */
  links?: AppLink[];
  page: T;
  onSelect: (p: T) => void;
  solid?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const inMore = more.some((m) => m.id === page);
  const pick = (p: T) => {
    setOpen(false);
    onSelect(p);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={solid ? 'solid' : ''}>
      <div className="ambient" />
      <div className="wrap">
        <header className="appbar">
          <a className="brand" href="#" onClick={(e) => { e.preventDefault(); pick(tabs[0].id); }}>
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
            <span>{name}</span>
          </a>
          {actions}
        </header>
        <div className="large-title">
          <h1>{title}</h1>
          {subtitle && <div className="subtitle">{subtitle}</div>}
        </div>
        {children}
      </div>

      <nav className="tabbar" aria-label="Pages">
        {tabs.map((t) => (
          <button key={t.id} aria-selected={page === t.id && !open} onClick={() => pick(t.id)}>
            <Icon name={t.icon} size={26} />
            <span>{t.label}</span>
          </button>
        ))}
        <button aria-selected={open || inMore} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="more" size={26} />
          <span>More</span>
        </button>
      </nav>

      {open && (
        <>
          <div className="sheet-backdrop" onClick={() => setOpen(false)} />
          <div className="menu" role="menu">
            {more.map((m) => (
              <button key={m.id} className="menu-row" role="menuitem" aria-current={page === m.id ? 'page' : undefined} onClick={() => pick(m.id)}>
                <Icon name={m.icon} size={22} />
                <span>{m.label}</span>
              </button>
            ))}
            {links && links.length > 0 && <div className="menu-sep" />}
            {links?.map((l) => (
              <a key={l.href} className="menu-row" role="menuitem" href={l.href}>
                <Icon name={l.icon} size={22} />
                <span>{l.label}</span>
                <span className="chev"><Icon name="chevron" size={16} /></span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

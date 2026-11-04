import type { ReactNode } from 'react';
import { fmtNum } from '../lib/format';
import type { FlightCategory } from '../lib/metar';

export function Panel({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card panel ${className}`}>
      {(title || right) && (
        <div className="card-head">
          <h2>{title}</h2>
          {right}
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Field({ label, value, unit, accent }: { label: string; value: ReactNode; unit?: string; accent?: boolean }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className={`field-value ${accent ? 'accent' : ''}`}>
        {value}
        {unit && <small> {unit}</small>}
      </div>
    </div>
  );
}

export function CatBadge({ cat }: { cat: FlightCategory }) {
  return <span className={`cat cat-${cat.toLowerCase()}`}>{cat}</span>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={`tab ${t.id === value ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function NoPlan({ what = 'this page' }: { what?: string }) {
  return (
    <div className="empty">
      <p>Load a SimBrief flight plan to use {what}.</p>
      <p className="muted">Set your SimBrief username in Settings, then tap the refresh button.</p>
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  return (
    <button
      className="btn btn-small"
      onClick={(e) => {
        const btn = e.currentTarget;
        navigator.clipboard?.writeText(text).then(() => {
          btn.textContent = 'Copied';
          setTimeout(() => (btn.textContent = label), 1200);
        });
      }}
    >
      {label}
    </button>
  );
}

/** A weight against its limit, as a filled bar (orange near the limit, red over it). */
export function WeightBar({ label, value, max, unit }: { label: string; value: number | null; max: number | null; unit: string }) {
  const pct = value && max ? Math.min(100, (value / max) * 100) : 0;
  const over = value !== null && max !== null && value > max;
  return (
    <div className="wbar">
      <div className="wbar-top">
        <span>{label}</span>
        <span>
          <b className={over ? 'warn' : ''}>{fmtNum(value)}</b>
          <span className="muted"> / {fmtNum(max)} {unit}</span>
        </span>
      </div>
      <div className="wbar-track">
        <div className={`wbar-fill ${over ? 'over' : pct > 95 ? 'near' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="muted small">{max && value !== null ? `${fmtNum(max - value)} ${unit} margin` : ''}</div>
    </div>
  );
}

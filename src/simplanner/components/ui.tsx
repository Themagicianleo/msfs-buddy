import { useState, type ReactNode } from 'react';
import { ESTIMATE_WARNING } from '../lib/planning';

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {actions && <div className="row">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children, wide }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function NumberInput({ value, onChange, step = 1, min, max }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  // Keep the typed text while editing so "12." or "" don't jump around.
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="input"
      inputMode="decimal"
      value={text ?? String(value)}
      onFocus={() => setText(String(value))}
      onBlur={() => setText(null)}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
      }}
      step={step}
    />
  );
}

export function TextInput({ value, onChange, placeholder, upper, maxLength }: { value: string; onChange: (v: string) => void; placeholder?: string; upper?: boolean; maxLength?: number }) {
  return (
    <input
      className={`input ${upper ? 'upper' : ''}`}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      autoCapitalize={upper ? 'characters' : undefined}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
    />
  );
}

export function EstimateBanner() {
  return <div className="banner banner-warn">⚠ {ESTIMATE_WARNING} For simulation use only, not for real-world flight.</div>;
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="warnings">
      {items.map((w, i) => (
        <li key={i} className={w.startsWith('LIMIT EXCEEDED') ? 'danger' : ''}>{w}</li>
      ))}
    </ul>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn"
      onClick={() => {
        const finish = () => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(finish, () => fallbackCopy(text) && finish());
        else if (fallbackCopy(text)) finish();
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  );
}

/** For browsers without the async clipboard API (e.g. plain http on a LAN). */
function fallbackCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table className="kv">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th>{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

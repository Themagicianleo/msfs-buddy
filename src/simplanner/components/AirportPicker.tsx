import { useState } from 'react';
import { useApp } from '../state';

/** ICAO field with search-as-you-type over the airport data (ICAO, name or city). */
export function AirportPicker({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (icao: string) => void; placeholder?: string }) {
  const { index } = useApp();
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const shown = text ?? value;
  const results = open && text && text.length >= 2 ? index.search(text, 8) : [];
  const apt = value ? index.get(value) : null;

  const commit = (v: string) => {
    onChange(v.trim().toUpperCase());
    setText(null);
    setOpen(false);
  };

  return (
    <div className="picker">
      <span className="field-label">{label}</span>
      <input
        className="input upper picker-input"
        value={shown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => text !== null && commit(text), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text !== null) {
            e.preventDefault();
            commit(results[0]?.icao ?? text);
          }
          if (e.key === 'Escape') {
            setText(null);
            setOpen(false);
          }
        }}
      />
      {results.length > 0 && (
        <div className="picker-list">
          {results.map((a) => (
            <button key={a.icao + a.source} type="button" onMouseDown={(e) => { e.preventDefault(); commit(a.icao); }}>
              <b className="mono">{a.icao}</b> {a.name}
              <span className="muted"> {[a.city, a.country].filter(Boolean).join(', ')}{a.source === 'custom' ? ' · mine' : ''}</span>
            </button>
          ))}
        </div>
      )}
      <span className="picker-name">
        {!value ? ' ' : apt ? `${apt.name}${apt.city ? ', ' + apt.city : ''}` : <span className="danger">Not found. <a href="#airports">Add it</a></span>}
      </span>
    </div>
  );
}

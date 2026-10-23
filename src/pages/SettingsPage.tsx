import { useState } from 'react';
import type { LoadState } from '../App';
import { Panel } from '../components/ui';
import type { Settings } from '../lib/storage';

export function SettingsPage({ settings, onChange, onRefresh, onDemo, state }: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onRefresh: () => void;
  onDemo: () => void;
  state: LoadState;
}) {
  const [user, setUser] = useState(settings.simbriefUser);
  const dirty = user.trim() !== settings.simbriefUser;

  const saveUser = (e: React.FormEvent) => {
    e.preventDefault();
    onChange({ ...settings, simbriefUser: user.trim() });
  };

  const toggle = (k: 'autoRefreshWx' | 'clock24' | 'showLocalTime' | 'reduceTransparency') => (
    <label className="toggle">
      <input type="checkbox" checked={settings[k]} onChange={(e) => onChange({ ...settings, [k]: e.target.checked })} />
      <span className="toggle-ui" />
    </label>
  );

  return (
    <div className="page settings">
      <Panel title="SimBrief">
        <form className="setting-row" onSubmit={saveUser}>
          <div>
            <div>SimBrief username or Pilot ID</div>
            <div className="muted small">Pilot ID is under Account Settings on simbrief.com. Only your latest generated OFP is fetched.</div>
          </div>
          <div className="btn-row">
            <input className="input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="username or 123456" />
            <button className="btn btn-primary" type="submit" disabled={!dirty}>Save</button>
          </div>
        </form>
        <div className="setting-row">
          <div>
            <div>Fetch latest OFP</div>
            {state.status === 'error' && <div className="small warn">{state.message}</div>}
            {state.status === 'ok' && <div className="small ok">{state.message ?? 'Flight plan loaded'}</div>}
          </div>
          <div className="btn-row">
            <button className="btn" onClick={onRefresh} disabled={!settings.simbriefUser || dirty || state.status === 'loading'}>
              {state.status === 'loading' ? 'Loading…' : 'Import now'}
            </button>
            <button className="btn" onClick={onDemo}>Load demo flight</button>
          </div>
        </div>
      </Panel>

      <Panel title="Display & weather">
        <div className="setting-row"><div>Auto-refresh weather every 5 minutes</div>{toggle('autoRefreshWx')}</div>
        <div className="setting-row"><div>24-hour local clock</div>{toggle('clock24')}</div>
        <div className="setting-row"><div>Show local time in top bar</div>{toggle('showLocalTime')}</div>
        <div className="setting-row">
          <div>
            <div>Reduce transparency</div>
            <div className="muted small">Turns off the glass blur. Use this if the EFB runs on the same PC as the sim and feels slow.</div>
          </div>
          {toggle('reduceTransparency')}
        </div>
      </Panel>

      <Panel title="Advanced">
        <div className="setting-row">
          <div>
            <div>CORS proxy (hosted builds only)</div>
            <div className="muted small">
              Leave blank normally. If SimBrief or weather requests are blocked on a hosted copy, set a proxy prefix, e.g.
              <code> https://corsproxy.io/?url=</code> or a template containing <code>{'{url}'}</code>. Ignored when running locally
              with <code>npm start</code>.
            </div>
          </div>
          <input
            className="input"
            value={settings.corsProxy}
            onChange={(e) => onChange({ ...settings, corsProxy: e.target.value })}
            placeholder="(none)"
          />
        </div>
      </Panel>

      <p className="muted small note">
        For flight simulation use only. Data: SimBrief (flight plans), aviationweather.gov / VATSIM (METAR/TAF), ChartFox (charts),
        Esri / © OpenStreetMap (map).
      </p>
    </div>
  );
}

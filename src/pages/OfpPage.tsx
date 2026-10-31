import { useState } from 'react';
import { CopyButton, NoPlan, Panel, Tabs } from '../components/ui';
import { fmtDuration, fmtNum } from '../lib/format';
import type { FlightPlan } from '../lib/simbrief';
import { openAtcCode, openAtcLink, toOpenAtcPlan } from '../lib/openatc';
import type { Settings } from '../lib/storage';

type Tab = 'ofp' | 'navlog' | 'atc';

// The OFP HTML comes from SimBrief; render it in a sandboxed frame (no scripts)
// so its markup and styles cannot leak into the EFB.
function ofpDocument(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:#f4f1e8;color:#111;}
    body{padding:18px 22px;font-family:"Courier New",monospace;}
    pre{font-size:13px;line-height:1.35;white-space:pre;}
    img{max-width:100%;height:auto;}
  </style></head><body>${html}</body></html>`;
}

export function OfpPage({ plan, settings }: { plan: FlightPlan | null; settings: Settings }) {
  const [tab, setTab] = useState<Tab>('ofp');
  if (!plan) return <NoPlan what="the OFP" />;

  return (
    <div className="page page-fill">
      <div className="page-toolbar">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'ofp', label: 'OFP' },
            { id: 'navlog', label: 'Navlog' },
            { id: 'atc', label: 'ATC Flight Plan' },
          ]}
        />
        {plan.pdfUrl && (
          <a className="btn btn-small" href={plan.pdfUrl} target="_blank" rel="noreferrer">
            Open PDF
          </a>
        )}
      </div>

      {tab === 'ofp' &&
        (plan.ofpHtml ? (
          <iframe className="ofp-frame" title="OFP" sandbox="" srcDoc={ofpDocument(plan.ofpHtml)} />
        ) : (
          <div className="empty">This OFP has no text briefing.</div>
        ))}

      {tab === 'navlog' && <Navlog plan={plan} />}

      {tab === 'atc' && (
        <div className="grid grid-1">
          <Panel title="ATC route" right={<CopyButton text={plan.atcRoute || plan.route} />}>
            <div className="route-box mono">{plan.atcRoute || plan.route}</div>
          </Panel>
          <Panel title="Route (for MCDU / sim flight planner)" right={<CopyButton text={plan.route} />}>
            <div className="route-box mono">
              {plan.origin.icao} {plan.route} {plan.destination.icao}
            </div>
          </Panel>
          <OpenAtcPanel plan={plan} settings={settings} />
          <Panel title="ICAO flight plan" right={<CopyButton text={plan.atcFlightPlan} />}>
            <pre className="route-box mono pre">{plan.atcFlightPlan || '—'}</pre>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Navlog({ plan }: { plan: FlightPlan }) {
  const u = plan.units.toUpperCase();
  const wtDiv = 1000;
  return (
    <div className="table-wrap">
      <table className="navlog">
        <thead>
          <tr>
            <th>Fix</th>
            <th>Via</th>
            <th>Alt</th>
            <th>MT</th>
            <th>Wind</th>
            <th>OAT</th>
            <th>TAS/GS</th>
            <th>Leg</th>
            <th>Total</th>
            <th>ETE</th>
            <th>Fuel rem<br /><small>{u} ×1000</small></th>
            <th>Freq</th>
          </tr>
        </thead>
        <tbody>
          {plan.navlog.map((f, i) => (
            <tr key={i} className={`stage-${f.stage.toLowerCase()} ${f.type === 'apt' ? 'row-apt' : ''}`}>
              <td className="fix">
                <b>{f.ident}</b>
                {f.name && f.name !== f.ident && <small>{f.name}</small>}
              </td>
              <td className={f.isSidStar ? 'accent' : ''}>{f.via}</td>
              <td>{f.altitude === null ? '—' : f.altitude >= 10000 && f.type !== 'apt' ? `FL${Math.round(f.altitude / 100)}` : fmtNum(f.altitude)}</td>
              <td>{f.trackMag === null ? '' : String(Math.round(f.trackMag)).padStart(3, '0')}</td>
              <td>{f.windDir === null ? '' : `${String(Math.round(f.windDir)).padStart(3, '0')}/${f.windSpd}`}</td>
              <td>{f.oat ?? ''}</td>
              <td>{f.tas ? `${f.tas}/${f.gs ?? ''}` : ''}</td>
              <td>{fmtNum(f.legDistance)}</td>
              <td>{fmtNum(f.totalDistance)}</td>
              <td>{fmtDuration(f.totalTime)}</td>
              <td>{f.fuelOnboard === null ? '' : (f.fuelOnboard / wtDiv).toFixed(1)}</td>
              <td className="muted">{f.frequency}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Hand the flight to OpenATC: a link when its address is set, or a code to paste. */
function OpenAtcPanel({ plan, settings }: { plan: FlightPlan; settings: Settings }) {
  const link = openAtcLink(settings.openAtcUrl, plan);
  const fp = toOpenAtcPlan(plan);
  return (
    <Panel
      title="OpenATC"
      right={
        <div className="btn-row">
          {link && <a className="btn btn-primary btn-small" href={link} target="_blank" rel="noreferrer">Open in OpenATC</a>}
          <CopyButton text={openAtcCode(plan)} label="Copy for OpenATC" />
        </div>
      }
    >
      <div className="muted small">
        Fills OpenATC’s flight plan ({[fp.callsign, `${fp.dep} → ${fp.arr}`, fp.cruise, fp.sid && `SID ${fp.sid}`, fp.star && `STAR ${fp.star}`, fp.region === 'china' ? 'China phraseology' : 'ICAO phraseology'].filter(Boolean).join(' · ')}).
        Check it there and press Start flight.{' '}
        {link
          ? 'If OpenATC runs as a Home Screen app, use Copy for OpenATC, then Paste from EFB in OpenATC.'
          : 'Set OpenATC’s address in Settings for a one-tap link; until then, copy the code and use Paste from EFB in OpenATC.'}
      </div>
    </Panel>
  );
}

// Block times from the departure time you set on Dispatch (UTC). OUT is the
// departure (off blocks); taxi-out and taxi-in each take the profile's taxi
// minutes; the flight time is the planned trip time. Estimates.

export interface BlockTimes {
  out: Date;
  off: Date;
  on: Date;
  in: Date;
}

/** "2026-10-30T09:30Z" from a date ("2026-10-30") and a time ("09:30" or "0930"); null if either is invalid. */
export function makeDepTime(date: string, time: string): string | null {
  const t = time.trim().replace(/z$/i, '').match(/^(\d{1,2}):?(\d{2})$/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !t || +t[1] > 23 || +t[2] > 59) return null;
  const iso = `${date}T${t[1].padStart(2, '0')}:${t[2]}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export function blockTimes(depTime: string | undefined, taxiMin: number, tripMin: number): BlockTimes | null {
  const out = depTime ? new Date(depTime) : null;
  if (!out || Number.isNaN(out.getTime()) || !Number.isFinite(tripMin)) return null;
  const add = (d: Date, min: number) => new Date(d.getTime() + Math.round(min) * 60_000);
  const off = add(out, taxiMin);
  const on = add(off, tripMin);
  return { out, off, on, in: add(on, taxiMin) };
}

/** "0930Z" */
export function zulu(d: Date | null | undefined): string {
  if (!d) return '—';
  return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}

/** The next whole 5 minutes at least `leadMin` from now, as date and time fields in UTC. */
export function suggestDeparture(now = new Date(), leadMin = 30): { date: string; time: string } {
  const t = new Date(Math.ceil((now.getTime() + leadMin * 60_000) / 300_000) * 300_000);
  return { date: t.toISOString().slice(0, 10), time: t.toISOString().slice(11, 16) };
}

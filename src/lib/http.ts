// Builds URLs for the external services used by the EFB.
//
// In development / `vite preview` requests go through the local Vite proxy
// (see vite.config.ts), which sidesteps browser CORS restrictions entirely.
// In a static production build the services are called directly; an optional
// CORS proxy prefix can be configured in Settings for hosts that need it.

export type Service = 'simbrief' | 'awc' | 'vatsim';

const HOSTS: Record<Service, string> = {
  simbrief: 'https://www.simbrief.com',
  awc: 'https://aviationweather.gov',
  vatsim: 'https://metar.vatsim.net',
};

const useLocalProxy = import.meta.env.DEV || import.meta.env.VITE_USE_PROXY === '1';
let corsProxy = '';

export function setCorsProxy(prefix: string) {
  corsProxy = prefix.trim();
}

export function apiUrl(service: Service, path: string): string {
  if (useLocalProxy) return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/proxy/${service}${path}`;
  const direct = HOSTS[service] + path;
  if (!corsProxy) return direct;
  return corsProxy.includes('{url}')
    ? corsProxy.replace('{url}', encodeURIComponent(direct))
    : corsProxy + direct;
}

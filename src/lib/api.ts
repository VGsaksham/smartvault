const explicitBase = (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();

function getFallbackBase(): string {
  // Browser runtime: use localhost API when developing locally.
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:5005';
    // Production/LAN via NGINX reverse proxy: call same-origin /api
    return '';
  }
  // Server runtime fallback
  return 'http://127.0.0.1:5005';
}

export const API_BASE_URL = (explicitBase || getFallbackBase()).replace(/\/+$/, '');

/**
 * Build an absolute API URL from a relative path.
 * Accepts already-absolute URLs and returns them unchanged.
 */
export function apiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}


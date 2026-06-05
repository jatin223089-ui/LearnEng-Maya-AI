/** Backend URL — empty uses /api proxy for REST. WebSocket always hits backend directly. */
export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

export const API = BACKEND_URL ? `${BACKEND_URL}/api` : '/api';

/** CRA dev proxy is unreliable for long-lived WebSockets — connect directly to backend. */
export function wsBaseUrl() {
  if (BACKEND_URL) {
    return BACKEND_URL.replace(/^http/, 'ws');
  }
  const loc = window.location;
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}`;
}
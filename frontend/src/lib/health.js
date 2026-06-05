import api from './api';

export async function checkBackendHealth() {
  try {
    const r = await api.get('/health', { timeout: 8000 });
    return { ok: true, ...r.data };
  } catch (e) {
    return {
      ok: false,
      database_ok: false,
      gemini_configured: false,
      error: e?.response?.data?.detail || e?.message || 'Backend unreachable',
    };
  }
}

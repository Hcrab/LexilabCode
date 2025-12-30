// Simple global fetch wrapper to keep /api on current origin
// Let the dev server proxy handle forwarding to backend (package.json "proxy")
const API_BASE = window.location.origin;

const origFetch = window.fetch.bind(window);

window.fetch = (input, init) => {
  try {
    // Handle string URL input
    if (typeof input === 'string') {
      // Keep /api requests on current origin (no hardcoded :5001)
      if (input.startsWith('/api')) {
        return origFetch(`${API_BASE}${input}`, init);
      }
      return origFetch(input, init);
    }

    // Handle Request object input
    if (input instanceof Request) {
      const url = input.url || '';
      // Normalize to pathname+search relative to current origin
      const u = new URL(url, window.location.origin);
      if (u.pathname.startsWith('/api')) {
        const sameOrigin = `${API_BASE}${u.pathname}${u.search}`;
        const req = new Request(sameOrigin, input);
        return origFetch(req, init);
      }
      return origFetch(input, init);
    }

    // Fallback
    return origFetch(input, init);
  } catch (e) {
    return origFetch(input, init);
  }
};

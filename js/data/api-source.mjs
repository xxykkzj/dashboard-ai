/**
 * Live data source.
 *
 * Calls GET {baseUrl}/{view}?from=YYYY-MM-DD&to=YYYY-MM-DD&range=30&platform=ios&…
 * and expects JSON in the same shape the mock source returns (see the
 * "Data contract" table in README.md, or read js/data/mock-source.mjs).
 *
 * Put a small backend (or Fabric's API for GraphQL behind a gateway) between
 * this page and Fabric. The browser should never hold database credentials,
 * and the API should return aggregates only.
 *
 * Using GraphQL instead? Keep this file's interface and change query() to
 * POST a GraphQL query per view, mapping the response to the same shape.
 */
export function createApiSource({ baseUrl, headers = {} }) {
  return {
    label: 'Live API',
    asAt: new Date().toISOString().slice(0, 10),
    async query(view, params) {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v == null || (k === 'platform' && v === 'all')) return;
        qs.set(k, String(v));
      });
      const res = await fetch(`${baseUrl}/${encodeURIComponent(view)}?${qs}`, {
        headers: { Accept: 'application/json', ...headers },
        credentials: 'include'
      });
      if (!res.ok) throw new Error(`${view} returned HTTP ${res.status}`);
      return res.json();
    }
  };
}

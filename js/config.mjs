/**
 * Dashboard configuration.
 *
 * dataSource
 *   'mock' reads the JSON files in data/mock (default).
 *   'api'  calls your analytics API (Fabric GraphQL or a backend service).
 *   You can also switch per visit with ?source=api in the address bar.
 */
const params = new URLSearchParams(location.search);

export const CONFIG = {
  dataSource: params.get('source') || 'mock',

  mockBasePath: './data/mock/',
  referenceBasePath: './data/reference/',

  api: {
    // Each reporting item calls GET {baseUrl}/{viewName}?from=…&to=…&platform=…
    // See js/data/api-source.mjs and README.md for the response shapes.
    baseUrl: '/api/analytics',
    headers: {}
  },

  // Council areas with fewer users than this are hidden for privacy.
  suppressionThreshold: 10
};

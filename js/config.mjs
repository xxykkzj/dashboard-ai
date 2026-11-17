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
  suppressionThreshold: 10,

  // Parts of the dashboard that can be switched off. A switched-off feature's
  // items, selector options and service rows are hidden; its code and mock
  // data stay in place. Set to true to bring it back.
  features: {
    fuelExemption: false     // parked for now
  }
};

/** True unless the feature is switched off in CONFIG.features */
export const featureOn = name => !name || CONFIG.features[name] !== false;

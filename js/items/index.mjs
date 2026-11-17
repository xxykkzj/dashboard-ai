/**
 * Registry of tabs and reporting items.
 * To add an item: add an object to one of the tab files (or a new file),
 * give it a view name, and add that view to js/data/mock-source.mjs
 * (and later to the real API).
 */
import { featureOn } from '../config.mjs';
import overview from './overview.mjs';
import journeys from './journeys.mjs';
import services from './services.mjs';
import health from './health.mjs';
import cost from './cost.mjs';
import value from './value.mjs';
import location, { locationCallout } from './location.mjs';

export const TABS = [
  { id: 'overview', label: 'Overview', title: 'Overview', desc: 'Headline measures against their targets, then adoption and retention.' },
  { id: 'value', label: 'Value', title: 'Value', desc: 'The money case for the app: cost avoided by moving transactions into the app, what the app costs to run, net benefit and payback. Estimates, built on assumptions in value.json.' },
  { id: 'journeys', label: 'Journeys', title: 'Customer journeys', desc: 'How many people reach each step, where they stop, how long it takes, and renewals coming due.' },
  { id: 'services', label: 'Services', title: 'Services', desc: 'Transactions and payments by service, and digital credentials.' },
  { id: 'location', label: 'Location', title: 'Where and when the app is used', desc: 'Council-level only, with small areas hidden for privacy.' },
  { id: 'health', label: 'Service health', title: 'Service health', desc: 'Reliability of transactions, the backend systems the app depends on, app versions and notifications.' },
  { id: 'cost', label: 'Cost', title: 'Platform cost', desc: 'Azure spend for the app and its analytics platform: unit costs, budget, services and days over threshold. Mock figures in AUD.' },
  { id: 'model', label: 'Data model', title: 'Data model', desc: 'The assumed tables and columns behind every item, and how data reaches this dashboard through Fabric.' }
];

/**
 * Presentation mode: the slides, in order. Each slide has a fixed title and
 * shows a few items full-width. Item spans are for the slide, not the tab.
 */
export const STORY = [
  { title: 'Performance against targets', items: [['ITM-00', 's12'], ['ITM-01', 's3'], ['ITM-02', 's3'], ['ITM-03', 's3'], ['ITM-04', 's3']] },
  { title: 'Adoption', items: [['ITM-05', 's8'], ['ITM-06', 's4']] },
  { title: 'Retention', items: [['ITM-29', 's12']] },
  { title: 'Reliability', items: [['ITM-28', 's7'], ['ITM-16', 's5']] },
  { title: 'Customer journeys', items: [['ITM-07', 's6'], ['ITM-08', 's6']] },
  { title: 'Where the app is used', items: [['ITM-22', 's8'], ['ITM-27', 's4']] },
  { title: 'Value', items: [['ITM-43', 's12']] },
  { title: 'Where the value comes from', items: [['ITM-26', 's7'], ['ITM-45', 's5']] }
];

/**
 * Tab layout: which items each tab shows, in which order, at what width, and
 * under which section heading. This is the one place to reorganise the
 * dashboard: move an [id, span] pair to another section or tab and refresh.
 * Spans are 12-column widths (s3, s4, s5, s6, s7, s8, s12); keep each row
 * adding up to 12. A tab's first section sits on the cover band, so its title
 * is read out by screen readers but not shown. Items left out of LAYOUT stay
 * on the tab named in their own definition, after the sections.
 */
export const LAYOUT = {
  overview: [
    { title: 'Headlines', items: [['ITM-00', 's12'], ['ITM-01', 's3'], ['ITM-02', 's3'], ['ITM-03', 's3'], ['ITM-04', 's3']] },
    { title: 'Adoption and retention', items: [['ITM-05', 's8'], ['ITM-06', 's4'], ['ITM-29', 's12']] }
  ],
  value: [
    { title: 'The money case', items: [['ITM-43', 's12'], ['ITM-26', 's7'], ['ITM-45', 's5']] },
    { title: 'Payback and what-ifs', items: [['ITM-44', 's12'], ['ITM-46', 's12']] }
  ],
  journeys: [
    { title: 'Signing up and completing a transaction', items: [['ITM-07', 's6'], ['ITM-08', 's6'], ['ITM-31', 's12']] },
    { title: 'Renewals', items: [['ITM-30', 's6'], ['ITM-09', 's6']] },
    { title: 'Fuel exemption', items: [['ITM-10', 's6'], ['ITM-17', 's6']] }
  ],
  services: [
    { title: 'Transactions and payments', items: [['ITM-13', 's6'], ['ITM-32', 's6']] },
    { title: 'Digital credentials', items: [['ITM-12', 's6'], ['ITM-15', 's6'], ['ITM-14', 's12']] }
  ],
  location: [
    { title: 'Where and when', items: [['ITM-22', 's8 tall'], ['ITM-27', 's4'], ['ITM-23', 's4'], ['ITM-24', 's12']] }
  ],
  health: [
    { title: 'Reliability', items: [['ITM-28', 's6'], ['ITM-19', 's6'], ['ITM-16', 's12']] },
    { title: 'Backend systems', items: [['ITM-18', 's12'], ['ITM-33', 's12']] },
    { title: 'App versions and notifications', items: [['ITM-34', 's8'], ['ITM-20', 's4'], ['ITM-21', 's8'], ['ITM-35', 's4']] }
  ],
  cost: [
    { title: 'Unit costs and budget', items: [['ITM-39', 's8'], ['ITM-40', 's4'], ['ITM-36', 's4'], ['ITM-37', 's4'], ['ITM-38', 's4']] },
    { title: 'Where the money goes', items: [['ITM-41', 's6'], ['ITM-42', 's6']] }
  ]
};

// Items whose feature is switched off in CONFIG.features are left out everywhere
const ALL_ITEMS = [...overview, ...value, ...journeys, ...services, ...location, ...health, ...cost];
export const ITEMS = ALL_ITEMS.filter(i => featureOn(i.feature));

// Apply LAYOUT: each placed item takes its tab, width and section from it
for (const [tab, sections] of Object.entries(LAYOUT)) {
  sections.forEach(sec => sec.items.forEach(([id, span]) => {
    const item = ITEMS.find(i => i.id === id);
    if (item) Object.assign(item, { tab, span, section: sec.title });
  }));
}

/** A tab's sections with their items, skipping empty ones, plus any items not placed in LAYOUT */
export function tabSections(tabId) {
  const placed = new Set(Object.values(LAYOUT).flat().flatMap(s => s.items.map(([id]) => id)));
  const out = (LAYOUT[tabId] || [])
    .map(sec => ({ title: sec.title, items: sec.items.map(([id]) => ITEMS.find(i => i.id === id)).filter(Boolean) }))
    .filter(sec => sec.items.length);
  const rest = ITEMS.filter(i => i.tab === tabId && !placed.has(i.id));
  if (rest.length) out.push({ title: 'More', items: rest });
  return out;
}

/** Extra HTML placed after a tab's cards */
export const TAB_FOOTERS = {
  journeys: `<div class="callout"><h3>Want screen-level funnels?</h3><p>These funnels use what the database records: accounts, statuses, notifications. To see drop-off between screens inside one service, the app needs to send events such as <code>rego_renewal_started</code> or <code>payment_initiated</code> to an analytics tool, which Fabric can ingest alongside this data.</p></div>`,
  location: locationCallout
};

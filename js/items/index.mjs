/**
 * Registry of tabs and reporting items.
 * To add an item: add an object to one of the tab files (or a new file),
 * give it a view name, and add that view to js/data/mock-source.mjs
 * (and later to the real API).
 */
import overview from './overview.mjs';
import journeys from './journeys.mjs';
import services from './services.mjs';
import health from './health.mjs';
import cost from './cost.mjs';
import location, { locationCallout } from './location.mjs';

export const TABS = [
  { id: 'overview', label: 'Overview', title: 'Overview', desc: 'Headline measures against their targets, daily trends, retention and the value estimate.' },
  { id: 'journeys', label: 'Journeys', title: 'Customer journeys', desc: 'How many people reach each step, and how many stop between steps.' },
  { id: 'services', label: 'Services', title: 'Services', desc: 'Credentials, transactions, payments, renewals coming due and the fuel exemption scheme.' },
  { id: 'location', label: 'Location', title: 'Where and when the app is used', desc: 'Council-level only, with small areas hidden for privacy.' },
  { id: 'health', label: 'Service health', title: 'Service health', desc: 'Backend availability and response times, failures, app versions and notifications.' },
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
  { title: 'Value estimate', items: [['ITM-26', 's12']] }
];

export const ITEMS = [...overview, ...journeys, ...services, ...location, ...health, ...cost];

/** Extra HTML placed after a tab's cards */
export const TAB_FOOTERS = {
  journeys: `<div class="callout"><h3>Want screen-level funnels?</h3><p>These funnels use what the database records: accounts, statuses, notifications. To see drop-off between screens inside one service, the app needs to send events such as <code>rego_renewal_started</code> or <code>payment_initiated</code> to an analytics tool, which Fabric can ingest alongside this data.</p></div>`,
  location: locationCallout
};

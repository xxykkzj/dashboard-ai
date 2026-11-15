/**
 * Picks the data source. Both sources expose the same interface:
 *
 *   source.label            text shown in the header
 *   source.asAt             last date with data (YYYY-MM-DD)
 *   source.query(view, p)   resolves to the rows for one reporting item
 *
 * Items never know which source they are talking to, so switching from
 * mock data to the real API is a config change, not a rewrite.
 */
import { CONFIG } from '../config.mjs';
import { createMockSource } from './mock-source.mjs';
import { createApiSource } from './api-source.mjs';

export async function createSource() {
  if (CONFIG.dataSource === 'api') return createApiSource(CONFIG.api);
  return createMockSource(CONFIG);
}

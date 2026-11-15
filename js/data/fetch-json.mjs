/** Fetch a JSON file without caching, so edits to mock data show on refresh. */
export async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't load ${url} (HTTP ${res.status})`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`${url} isn't valid JSON: ${e.message}`);
  }
}

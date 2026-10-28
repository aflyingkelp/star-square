// One snapshot per request and an atomic compare-and-swap commit prevent concurrent
// Edge Function instances from overwriting each other's maps, scores, or profiles.
export function databaseClient(url, key) {
  return async (route, options = {}) => {
    const response = await fetch(url + '/rest/v1/' + route, { ...options,
      headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}), 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Database request failed (' + response.status + ')');
    const body = await response.text(); return body ? JSON.parse(body) : null;
  };
}
export function createStorage(database) {
  let snapshot, changes = {};
  async function load() { return snapshot ||= Object.fromEntries((await database('app_state?select=key,value,updated_at')).map(row => [row.key, row])); }
  const read = async (key, fallback) => structuredClone((await load())[key]?.value ?? fallback);
  const write = async (key, value) => { changes[key] = value; };
  async function mutate(work) {
    for (let attempt = 0; attempt < 5; attempt++) {
      snapshot = null; changes = {}; await load();
      const result = await work();
      const committed = await database('rpc/game_state_commit', { method: 'POST', body: JSON.stringify({
        expected_versions: Object.fromEntries(Object.entries(snapshot).map(([key, row]) => [key, row.updated_at])), new_values: changes }) });
      if (committed) return result;
    }
    throw Object.assign(new Error('Server is busy; please retry'), { status: 503 });
  }
  return { mutate, readMaps: () => read('maps', []), writeMaps: value => write('maps', value),
    readScores: () => read('scores', []), writeScores: value => write('scores', value), readProfiles: () => read('profiles', {}), writeProfiles: value => write('profiles', value) };
}

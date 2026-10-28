import http from 'node:http';
import { isIP } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { validateLevel } from './workshop-schema.js';
import { createEngine } from './tas-tools/headless.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.STAR_SQUARE_DATA_DIR || path.join(root, 'data'));
const port = Number(process.env.PORT || 4173);
const geoCache = new Map();
const scoreEngine = createEngine().engine;
const officialLevels = new Map(scoreEngine.levels().map(level => [level.id, level]));
const requestBuckets = new Map();
let mutationQueue = Promise.resolve();
const isoRegionKey = (country, region) => country && region ? `${country}-${region}` : null;
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const useSupabase = Boolean(supabaseUrl && supabaseKey);
const requirePersistentStorage = process.env.REQUIRE_PERSISTENT_STORAGE === '1';
if (Boolean(supabaseUrl) !== Boolean(supabaseKey)) throw new Error('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');

async function supabaseRequest(table, key, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}${options.upsert ? '?on_conflict=key' : `?${new URLSearchParams({ key: `eq.${key}` })}`}`, {
    method: options.method || 'GET',
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json',
      ...(options.upsert ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : options.returning ? { Prefer: 'return=representation' } : {}) },
    ...(options.value === undefined ? {} : { body: JSON.stringify({ key, value: options.value, updated_at: new Date().toISOString() }) }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Supabase ${table} request failed (${response.status})`);
  const content = await response.text();
  return content ? JSON.parse(content) : [];
}
async function readStored(table, key, fallback) {
  if (!useSupabase) return readJson(path.join(dataDir, `${key}.json`), fallback);
  const rows = await supabaseRequest(table, key);
  return rows[0]?.value ?? fallback;
}
async function writeStored(table, key, value) {
  if (!useSupabase) return writeJson(path.join(dataDir, `${key}.json`), value);
  await supabaseRequest(table, key, { method: 'POST', value, upsert: true });
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function writeJson(file, value) {
  await fs.mkdir(dataDir, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2));
  await fs.rename(temp, file);
}
async function mutate(work) {
  const task = mutationQueue.then(work, work);
  mutationQueue = task.then(() => undefined, () => undefined);
  return task;
}
async function readMaps() { return readStored('app_state', 'maps', []); }
async function writeMaps(maps) { await writeStored('app_state', 'maps', maps); }
async function readScores() { return readStored('app_state', 'scores', []); }
async function writeScores(scores) { await writeStored('app_state', 'scores', scores); }
async function readProfiles() { return readStored('app_state', 'profiles', {}); }
async function writeProfiles(profiles) { await writeStored('app_state', 'profiles', profiles); }
function send(res, status, value, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
}
async function body(req, limit = 10_000_000) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > limit) throw Object.assign(new Error('Request too large'), { status: 413 });
  }
  try { return JSON.parse(data || '{}'); }
  catch { throw Object.assign(new Error('Expected JSON'), { status: 400 }); }
}
function cleanIp(raw) {
  let value = String(raw || '').trim().replace(/^\[|\]$/g, '');
  if (value.startsWith('::ffff:')) value = value.slice(7);
  return isIP(value) ? value : '';
}
function clientIp(req) {
  const hops = Math.max(0, Math.min(10, Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10) || 0));
  if (hops) {
    const chain = String(req.headers['x-forwarded-for'] || '').split(',').map(x => cleanIp(x)).filter(Boolean);
    const forwarded = chain[Math.max(0, chain.length - hops)];
    if (forwarded) return forwarded;
  }
  return cleanIp(req.socket.remoteAddress);
}
function isPublicIp(ip) {
  if (!ip) return false;
  if (isIP(ip) === 4) {
    const p = ip.split('.').map(Number), [a,b] = p;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 ||
      a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19));
  }
  const lower = ip.toLowerCase();
  return lower !== '::1' && !lower.startsWith('fc') && !lower.startsWith('fd') && !lower.startsWith('fe80:') && lower !== '::';
}
async function geoForRequest(req) {
  if (process.env.GEOIP_LOOKUP === '0') return null;
  const ip = clientIp(req), key = createHash('sha256').update(ip || 'local-egress').digest('hex');
  const cached = geoCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  // Loopback clients use the provider's request IP lookup, which resolves this host's public egress address.
  const target = isPublicIp(ip) ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : 'https://ipapi.co/json/';
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'STAR-SQUARE/1.0' } });
    if (!response.ok) throw new Error('Geolocation lookup failed');
    const raw = await response.json();
    const country = String(raw.country_code || raw.country || '').toUpperCase().slice(0, 2);
    const regionCode = String(raw.region_code || '').toUpperCase().slice(0, 16);
    const regionName = String(raw.region || '').slice(0, 80);
    const value = /^[A-Z]{2}$/.test(country) ? { country, regionCode, regionName } : null;
    geoCache.set(key, { value, expires: Date.now() + (value ? 6 : 0.25) * 60 * 60 * 1000 });
    return value;
  } catch {
    geoCache.set(key, { value: null, expires: Date.now() + 15 * 60 * 1000 });
    return null;
  }
}
function weightedPP(scores) {
  const values = Object.values(scores || {}).filter(row => Number.isFinite(row.pp) && row.pp >= 0).map(row => row.pp).sort((a,b) => b-a);
  return Math.round(values.reduce((sum, value, i) => sum + value * Math.pow(0.95, i), 0) * 100) / 100;
}
function profileFor(profiles, id, name, geo) {
  if (!profiles[id]) profiles[id] = { id, name: 'Square-' + id.slice(0, 4), country: null, regionCode: null, regionName: null, bestScores: {}, unrankedBestScores: {}, rankHistory: [] };
  const p = profiles[id];
  if (name) p.name = String(name).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 32) || p.name;
  if (geo) { p.country = geo.country; p.regionCode = geo.regionCode; p.regionName = geo.regionName; p.locationUpdatedAt = new Date().toISOString(); }
  p.rankedPP = weightedPP(p.bestScores);
  p.unrankedPP = weightedPP(p.unrankedBestScores);
  return p;
}
function sortProfiles(rows) {
  return rows.sort((a,b) => (b.rankedPP || 0) - (a.rankedPP || 0) || String(a.id).localeCompare(String(b.id)));
}
function rankedLists(profiles) {
  const all = Object.values(profiles).filter(p => Object.keys(p.bestScores || {}).length > 0);
  return {
    global: sortProfiles([...all]),
    country: country => sortProfiles(all.filter(p => country && p.country === country)),
    region: (country, regionCode) => sortProfiles(all.filter(p => country && regionCode && p.country === country && p.regionCode === regionCode))
  };
}
function positionsFor(p, lists) {
  const position = rows => { const i = rows.findIndex(row => row.id === p.id); return i < 0 ? null : i + 1; };
  return { global: position(lists.global), country: position(lists.country(p.country)), region: position(lists.region(p.country, p.regionCode)) };
}
function refreshRanks(profiles, activeId) {
  const lists = rankedLists(profiles), at = new Date().toISOString();
  for (const p of Object.values(profiles)) {
    const ranks = positionsFor(p, lists), last = p.rankHistory?.at(-1);
    if (!last || last.global !== ranks.global || last.country !== ranks.country || last.region !== ranks.region || p.id === activeId && last.pp !== p.rankedPP) {
      p.rankHistory ||= [];
      p.rankHistory.push({ at, ...ranks, pp: p.rankedPP || 0 });
      if (p.rankHistory.length > 500) p.rankHistory.splice(0, p.rankHistory.length - 500);
    }
    p.currentRanks = ranks;
  }
  return lists;
}
function publicProfile(p) {
  return { id: p.id, name: p.name, country: p.country, regionCode: p.regionCode, regionName: p.regionName,
    rankedPP: p.rankedPP || 0, unrankedPP: p.unrankedPP || 0, ranks: p.currentRanks || { global: null, country: null, region: null },
    rankHistory: p.rankHistory || [] };
}
function leaderboardRows(profiles, map, unranked = false) {
  return Object.values(profiles).filter(p => (unranked ? p.unrankedBestScores : p.bestScores)?.[map])
    .map(p => ({ id: p.id, name: p.name, country: p.country, regionCode: p.regionCode,
      ...(unranked ? p.unrankedBestScores[map] : p.bestScores[map]), ranked: !unranked }))
    .sort((a,b) => b.pp-a.pp || b.score-a.score || b.accuracy-a.accuracy || String(a.id).localeCompare(String(b.id)))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}
function allowRequest(req, bucket, limit, intervalMs) {
  const ip = clientIp(req) || 'unknown', key = bucket + ':' + createHash('sha256').update(ip).digest('hex');
  const now = Date.now(), old = requestBuckets.get(key) || { start: now, count: 0 };
  if (now - old.start >= intervalMs) { old.start = now; old.count = 0; }
  old.count++; requestBuckets.set(key, old);
  if (requestBuckets.size > 20_000) for (const [k, v] of requestBuckets) if (now - v.start > intervalMs * 2) requestBuckets.delete(k);
  return old.count <= limit;
}
function expectedPp(stars, hits, bombs) {
  const anchors = [[3.5,100],[4.3,200],[5.4,300],[6.2,400],[7,500],[7.8,600]]; let base;
  if (stars <= anchors[0][0]) base = stars * 100 / 3.5;
  else if (stars <= 7.8) { let i=1; while (i<anchors.length && stars>anchors[i][0]) i++; const [x0,y0]=anchors[i-1],[x1,y1]=anchors[i]; base=y0+(stars-x0)*(y1-y0)/(x1-x0); }
  else base=600+(stars-7.8)*125;
  return Math.round(base*Math.pow(.9,hits)*Math.pow(.8,bombs)*100)/100;
}
function verifyRankedRun(score) {
  const level=officialLevels.get(score.levelId), tape=score.replay;
  if (!level || !tape || !/^[0-9a-f]{8}$/i.test(String(tape.digest||'')) || Number(score.rank)!==level.rank || Math.abs(Number(score.stars)-Number(level.stars))>.01) return false;
  let ok=false;
  try {
    scoreEngine.startScoreReplay(score.levelId,{weapon:score.weapon,upgrades:score.upgrades||{},seed:tape.seed});
    let ticks=0;
    for (const [count,mask] of tape.runs) for (let i=0;i<count;i++) { scoreEngine.tick(mask); ticks++; }
    const state=scoreEngine.state(), expectedAccuracy=Math.round(Math.max(0,(Number(state.player.maxLives||5)-state.hits)/(Number(state.player.maxLives||5))*100)*100)/100;
    ok=ticks===tape.ticks && state.tick===tape.ticks && !!state.result?.passed===!!score.passed && !!state.result?.passed &&
      state.hits===Number(score.hits) && state.bombs===Number(score.bombs) && state.score===Number(score.score) && state.graze===Number(score.graze) &&
      Math.abs(expectedAccuracy-Number(score.accuracy))<.011 && scoreEngine.digest()===tape.digest &&
      Math.abs(expectedPp(level.stars,state.hits,state.bombs)-Number(score.pp))<.011;
  } catch { ok=false; }
  finally { try { scoreEngine.stop(); } catch {} }
  return ok;
}
function validScore(score) {
  const tape = score?.replay;
  if (!score || typeof score.id !== 'string' || score.id.length > 100 || !/^[\w-]{1,80}$/.test(String(score.profileId || '')) ||
      !/^[\w-]{1,100}$/.test(String(score.levelId || '')) || !Number.isFinite(+score.pp) || +score.pp < 0 || +score.pp > 100_000 ||
      !Number.isFinite(+score.accuracy) || +score.accuracy < 0 || +score.accuracy > 100 || !Number.isFinite(+score.score) ||
      !tape || !Array.isArray(tape.runs) || tape.runs.length > 200_000 || !Number.isInteger(tape.ticks) || tape.ticks < 1 || tape.ticks > 300_000 ||
      !tape.runs.every(run => Array.isArray(run) && run.length === 2 && Number.isInteger(run[0]) && run[0] > 0 && run[0] <= 300_000 && Number.isInteger(run[1]) && run[1] >= 0 && run[1] <= 511) ||
      tape.runs.reduce((sum, run) => sum + run[0], 0) !== tape.ticks) return false;
  return true;
}
function normalizeRun(score, ranked) {
  return { levelId: String(score.levelId), title: String(score.title || 'Untitled run').slice(0, 100), pp: Number(score.pp) || 0,
    score: Number(score.score) || 0, accuracy: Number(score.accuracy) || 0, hits: Number(score.hits) || 0,
    stars: Number(score.stars) || 0, grade: String(score.grade || '—').slice(0, 12), createdAt: String(score.createdAt || new Date().toISOString()), ranked };
}
function upsertBest(profile, score, ranked) {
  const bag = ranked ? profile.bestScores : profile.unrankedBestScores, row = normalizeRun(score, ranked), prior = bag[row.levelId];
  if (!prior || row.pp > prior.pp || row.pp === prior.pp && row.score > prior.score || row.pp === prior.pp && row.score === prior.score && row.accuracy > prior.accuracy) bag[row.levelId] = row;
  profile.rankedPP = weightedPP(profile.bestScores); profile.unrankedPP = weightedPP(profile.unrankedBestScores);
}
function topRows(rows, count = 50) { return rows.slice(0, count).map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, pp: p.rankedPP || 0, country: p.country, regionCode: p.regionCode })); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      return send(res, 200, { ok: true, storage: useSupabase ? 'supabase' : requirePersistentStorage ? 'unconfigured' : 'local',
        onlineReady: useSupabase || !requirePersistentStorage });
    }
    if (url.pathname.startsWith('/api/') && requirePersistentStorage && !useSupabase) {
      return send(res, 503, { error: 'Online storage setup is pending. Configure Supabase in the hosting dashboard.' });
    }
    if (url.pathname === '/api/sync' && req.method === 'POST') {
      if (!allowRequest(req,'sync',30,60_000)) return send(res,429,{error:'Too many profile syncs'});
      const input = await body(req, 32_000), id = String(input.id || ''), name = String(input.name || '');
      if (!/^[\w-]{1,80}$/.test(id)) return send(res, 400, { error: 'Invalid profile id' });
      const geo = await geoForRequest(req);
      const result = await mutate(async () => {
        const profiles = await readProfiles(), p = profileFor(profiles, id, name, geo);
        const lists = refreshRanks(profiles, id); await writeProfiles(profiles); const ranks = positionsFor(p, lists);
        return { profile: publicProfile(p), ranks, top: { global: topRows(lists.global), country: topRows(lists.country(p.country)), region: topRows(lists.region(p.country,p.regionCode)) } };
      });
      return send(res, 200, result);
    }
    if (url.pathname === '/api/rankings' && req.method === 'GET') {
      const id = String(url.searchParams.get('profileId') || '');
      const profiles = await readProfiles(), lists = rankedLists(profiles), p = profiles[id];
      if (!p) return send(res, 200, { profile: null, ranks: { global: null, country: null, region: null }, top: { global: topRows(lists.global), country: [], region: [] }, history: [] });
      const ranks = positionsFor(p, lists);
      return send(res, 200, { profile: publicProfile(p), ranks, history: p.rankHistory || [], top: {
        global: topRows(lists.global), country: topRows(lists.country(p.country)), region: topRows(lists.region(p.country,p.regionCode))
      } });
    }
    const levelBoardMatch = url.pathname.match(/^\/api\/leaderboards\/([\w-]{1,100})$/);
    if (levelBoardMatch && req.method === 'GET') {
      const profiles = await readProfiles(), levelId = levelBoardMatch[1];
      return send(res, 200, { levelId, ranked: leaderboardRows(profiles, levelId), unranked: leaderboardRows(profiles, levelId, true) });
    }
    if (url.pathname === '/api/scores' && req.method === 'GET') {
      const profileId = url.searchParams.get('profileId'), levelId = url.searchParams.get('levelId');
      const scores = await readScores();
      return send(res, 200, scores.filter(row => (!profileId || row.profileId === profileId) && (!levelId || row.levelId === levelId)).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100));
    }
    if (url.pathname === '/api/scores' && req.method === 'POST') {
      const input = await body(req), score = input.score;
      if (!validScore(score)) return send(res, 400, { error: 'Invalid score or replay data' });
      const wantsRanked = score.ranked === true && !!score.passed && !score.practice && !score.custom && !score.speedhack;
      if (!allowRequest(req,wantsRanked?'ranked-score':'score',wantsRanked?12:100,60_000)) return send(res,429,{error:'Score upload limit reached; retry in a minute'});
      if (wantsRanked && !verifyRankedRun(score)) return send(res,422,{error:'Ranked replay did not match the submitted score'});
      const geo = await geoForRequest(req);
      const result = await mutate(async () => {
        const scores = await readScores(), prior = scores.find(item => item.clientId === score.id);
        if (prior) return { id: prior.id, clientId: prior.clientId, ranked: prior.ranked, duplicate: true };
        const ranked = wantsRanked;
        const stored = { id: randomUUID(), clientId: String(score.id), profileId: String(score.profileId),
          profileName: String(score.profileName || '').slice(0, 32), levelId: String(score.levelId), title: String(score.title || 'Untitled run').slice(0, 100),
          dan: String(score.dan || '').slice(0, 40), rank: Number(score.rank) || 0, stars: Number(score.stars) || 0,
          passed: !!score.passed, ranked, speedhack: !!score.speedhack, speedhackRate: Number(score.speedhackRate) || 1,
          accuracy: Number(score.accuracy), hits: Number(score.hits) || 0, pp: Number(score.pp) || 0,
          grade: String(score.grade || '—').slice(0, 12), time: Number(score.time) || 0, score: Number(score.score) || 0,
          graze: Number(score.graze) || 0, bombs: Number(score.bombs) || 0, createdAt: String(score.createdAt || new Date().toISOString()),
          weapon: String(score.weapon || '').slice(0, 40), upgrades: score.upgrades || {}, level: score.level, replay: score.replay };
        scores.unshift(stored);
        const profiles = await readProfiles(), p = profileFor(profiles, stored.profileId, stored.profileName, geo);
        if (stored.passed) upsertBest(p, stored, ranked);
        const lists = refreshRanks(profiles, p.id);
        await writeScores(scores); await writeProfiles(profiles);
        return { id: stored.id, clientId: stored.clientId, ranked, ranks: positionsFor(p, lists) };
      });
      return send(res, result.duplicate ? 200 : 201, result);
    }
    if (url.pathname === '/api/maps' && req.method === 'GET') {
      const maps = await readMaps();
      maps.sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.createdAt.localeCompare(a.createdAt));
      return send(res, 200, maps);
    }
    if (url.pathname === '/api/maps' && req.method === 'POST') {
      const input = await body(req, 8_500_000);
      if (!validateLevel(input.level)) return send(res, 400, { error: 'Invalid map data' });
      const result = await mutate(async () => {
        const maps = await readMaps();
        const map = { id: randomUUID(), title: String(input.title || input.level.title || 'Untitled Spell').trim().slice(0, 36),
          author: String(input.author || 'Player').trim().slice(0, 32), level: input.level, rating: 0, ratingCount: 0, ratings: {}, createdAt: new Date().toISOString() };
        maps.unshift(map); await writeMaps(maps.slice(0, 500)); return map;
      });
      return send(res, 201, result);
    }
    const ratingMatch = url.pathname.match(/^\/api\/maps\/([\w-]+)\/rating$/);
    if (ratingMatch && req.method === 'POST') {
      const input = await body(req, 10_000), rating = Number(input.rating), voter = String(input.profileId || '').slice(0, 80);
      if (!voter || !Number.isFinite(rating) || rating < 1 || rating > 5) return send(res, 400, { error: 'Rating must be 1–5' });
      const result = await mutate(async () => {
        const maps = await readMaps(), map = maps.find(item => item.id === ratingMatch[1]);
        if (!map) return null;
        map.ratings[voter] = Math.round(rating); const values = Object.values(map.ratings);
        map.ratingCount = values.length; map.rating = values.reduce((sum, value) => sum + value, 0) / values.length;
        await writeMaps(maps); return { rating: map.rating, ratingCount: map.ratingCount };
      });
      return result ? send(res, 200, result) : send(res, 404, { error: 'Map not found' });
    }
    if (['/tas-library.js','/tas-library.json','/tas-verification.json','/difficulty.js','/difficulty-catalog.js'].includes(url.pathname)) {
      const name = url.pathname.slice(1), type = name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/json; charset=utf-8';
      const content = await fs.readFile(path.join(root, name), 'utf8');
      if (type.startsWith('application/json')) return send(res, 200, JSON.parse(content));
      return send(res, 200, content, type);
    }
    if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, await fs.readFile(path.join(root, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    return send(res, error.status || 500, { error: error.status ? error.message : 'Server error' });
  }
});
server.listen(port, '0.0.0.0', () => console.log(`STAR//SQUARE community server listening on ${server.address().port}`));

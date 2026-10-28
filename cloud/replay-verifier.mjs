const encode = bytes => btoa(String.fromCharCode(...bytes));
const decode = text => Uint8Array.from(atob(text), ch => ch.charCodeAt(0));
const utf8 = new TextEncoder();
const text = new TextDecoder();
const hex = bytes => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
export function makeReplayVerifier(secret) {
  const keyPromise = crypto.subtle.importKey('raw', utf8.encode('STAR-SQUARE-REPLAY-v1:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  async function sign(payload) {
    const bytes = utf8.encode(JSON.stringify(payload));
    const signature = await crypto.subtle.sign('HMAC', await keyPromise, bytes);
    // State can be larger than the JavaScript argument limit; encode it in chunks.
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary) + '.' + encode(new Uint8Array(signature));
  }
  async function open(token) {
    if (typeof token !== 'string' || token.length > 5_000_000) throw new Error('Invalid checkpoint');
    const parts = token.split('.'); if (parts.length !== 2) throw new Error('Invalid checkpoint');
    const bytes = decode(parts[0]);
    if (!await crypto.subtle.verify('HMAC', await keyPromise, decode(parts[1]), bytes)) throw new Error('Invalid checkpoint');
    const payload = JSON.parse(text.decode(bytes));
    if (payload.expires < Date.now()) throw new Error('Expired checkpoint');
    return payload;
  }
  return async function verifyReplayChunk(score, checkpoint, { scoreEngine, officialLevels, expectedPp }) {
    const level = officialLevels.get(score.levelId), tape = score.replay;
    if (!level || !/^[0-9a-f]{8}$/i.test(String(tape?.digest || '')) || Number(score.rank) !== level.rank || Math.abs(Number(score.stars) - Number(level.stars)) > .01) return { ok: false };
    const scoreHash = hex(await crypto.subtle.digest('SHA-256', utf8.encode(JSON.stringify(score))));
    const rules = scoreEngine.rulesHash();
    let previous;
    try {
      if (checkpoint) {
        previous = await open(checkpoint);
        if (previous.scoreHash !== scoreHash || previous.rules !== rules) return { ok: false };
      }
      scoreEngine.startScoreReplay(score.levelId, { weapon: score.weapon, upgrades: score.upgrades || {}, seed: tape.seed });
      if (previous) scoreEngine.restore(previous.state);
      let ticks = previous?.ticks || 0, runIndex = previous?.runIndex || 0, runOffset = previous?.runOffset || 0;
      const until = Math.min(tape.ticks, ticks + 2000);
      while (ticks < until && runIndex < tape.runs.length) {
        const [count, mask] = tape.runs[runIndex];
        scoreEngine.tick(mask); ticks++; runOffset++;
        if (runOffset === count) { runIndex++; runOffset = 0; }
      }
      if (ticks !== until) return { ok: false };
      if (ticks < tape.ticks) {
        const state = scoreEngine.snapshot();
        // All values in this checkpoint came from the authoritative simulation.
        // The browser can carry it between requests but cannot alter it undetected.
        scoreEngine.stop();
        return { ok: true, complete: false, progress: ticks / tape.ticks,
          checkpoint: await sign({ scoreHash, rules, ticks, runIndex, runOffset, state, expires: previous?.expires || Date.now() + 20 * 60_000 }) };
      }
      const state = scoreEngine.state();
      const expectedAccuracy = Math.round(Math.max(0, (Number(state.player.maxLives || 5) - state.hits) / Number(state.player.maxLives || 5) * 100) * 100) / 100;
      const ok = state.tick === tape.ticks && !!state.result?.passed && state.hits === Number(score.hits) && state.bombs === Number(score.bombs) &&
        state.score === Number(score.score) && state.graze === Number(score.graze) && Math.abs(expectedAccuracy - Number(score.accuracy)) < .011 &&
        scoreEngine.digest() === tape.digest && Math.abs(expectedPp(level.stars, state.hits, state.bombs) - Number(score.pp)) < .011;
      scoreEngine.stop(); return { ok, complete: true };
    } catch { try { scoreEngine.stop(); } catch {} return { ok: false }; }
  };
}

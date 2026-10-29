// Executes only the bundled, trusted game source. Never pass player-provided JavaScript.
// Browser shims let the deterministic simulation run without Node's vm or filesystem.
export function createPortableEngine({ gameSource, difficultySource, catalog, archiveSource }) {
  const elements = new Map(), listeners = {}, frames = new Map(); let frameID = 0;
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({ createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (target, key) => target[key] || (() => {}) });
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, width: 800, height: 600, style: {}, dataset: {}, hidden: false, isConnected: true,
      classList: { add() {}, remove() {}, toggle() {} }, getContext: () => ctx, querySelectorAll: () => [], addEventListener() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), setPointerCapture() {}, value: '', textContent: '', innerHTML: '' });
    return elements.get(id);
  }
  const local = new Map();
  const scope = { console, structuredClone, crypto: globalThis.crypto, performance, Math, Date, JSON, module: undefined,
    document: { getElementById: element, addEventListener: (name, fn) => { listeners[name] = fn; } },
    location: { protocol: 'file:' }, localStorage: { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value) },
    requestAnimationFrame: fn => { frames.set(++frameID, fn); return frameID; }, cancelAnimationFrame: id => frames.delete(id), setTimeout: () => 0, clearTimeout() {},
    fetch: async () => ({ ok: false }), prompt: () => null, STAR_SQUARE_DIFFICULTY_CATALOG: catalog };
  scope.window = scope; scope.addEventListener = (name, fn) => { listeners[name] = fn; };
  new Function('scope', `with (scope) {\n${archiveSource || ''}\n${difficultySource}\n${gameSource}\n}`)(scope);
  return scope.SquareTAS;
}

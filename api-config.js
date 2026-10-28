// Local Node hosting uses the same-origin API. cloud/build.mjs writes the public
// Firebase deployment config without putting server secrets in browser assets.
window.STAR_SQUARE_CLOUD = { apiBase: '', apiKey: '' };

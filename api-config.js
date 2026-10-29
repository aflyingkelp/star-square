// Local Node hosting uses the same-origin API. cloud/build.mjs writes the public
// Firebase deployment config without putting server secrets in browser assets.
const isGitHubPages = location.hostname === 'aflyingkelp.github.io';
window.STAR_SQUARE_CLOUD = isGitHubPages
  ? { apiBase: 'https://uzvdubjbwuogwkpobqut.supabase.co/functions/v1/star-square-api', apiKey: 'sb_publishable_WtihMGZaItcFSLLfEFroSg_spQGtU_a' }
  : { apiBase: '', apiKey: '' };

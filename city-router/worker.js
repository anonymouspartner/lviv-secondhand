// City router — serves every city subdomain (kyiv.lvivsecondhand.com, …)
// from the one GitHub Pages site behind www.lvivsecondhand.com.
//
// GitHub Pages can carry a single custom domain, and the app is one static
// shell that picks its city from location.hostname (see index.html, CITIES).
// So this Worker, routed on *.lvivsecondhand.com/*, simply proxies each
// request to the same path on www and hands the response back unchanged.
// The hostname the browser sees is the city's, which is all the app needs.
//
// Safety rails:
//   • Only the city hosts listed below are proxied. Every other host on the
//     zone that reaches this route — www, the apex, and unrelated proxied
//     records such as read.lvivsecondhand.com (a Tunnel) — is passed straight
//     through to whatever its own DNS record points at, so the Worker never
//     loops and never hijacks a sibling service. That also means each city
//     needs its own DNS record: NO wildcard `*` record, or hosts that exist
//     nowhere would land here with no origin behind them.
//   • The city list is a copy of cities.json; keep the two in step
//     (scripts/validate-cities.mjs checks the repo file, this one is hand-kept).
//
// Deployed by .github/workflows/deploy-city-router.yml. No secrets, no storage.

const ORIGIN = 'https://www.lvivsecondhand.com';
const CITY_HOSTS = new Set([
  'kyiv', 'kharkiv', 'dnipro', 'odesa', 'zhytomyr',
  'ternopil', 'lutsk', 'rivne', 'chernivtsi', 'ivano-frankivsk',
].map((s) => `${s}.lvivsecondhand.com`));

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (!CITY_HOSTS.has(host)) return fetch(request); // not ours: own DNS decides

    // Same path and query on www. Method/body are forwarded for completeness,
    // but the site is static: only GET/HEAD ever do anything.
    const upstream = new Request(`${ORIGIN}${url.pathname}${url.search}`, {
      method: request.method,
      headers: stripHopHeaders(request.headers),
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
    const res = await fetch(upstream, { cf: { cacheEverything: false } });

    // GitHub Pages answers redirects with absolute www URLs (e.g. /store →
    // /store/). Rewrite them onto the city host so the visitor stays there.
    const headers = new Headers(res.headers);
    const loc = headers.get('location');
    if (loc && loc.startsWith(ORIGIN)) headers.set('location', `https://${host}${loc.slice(ORIGIN.length)}`);
    headers.set('x-city-router', host.split('.')[0]);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};

function stripHopHeaders(h) {
  const out = new Headers(h);
  for (const k of ['host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip']) out.delete(k);
  return out;
}

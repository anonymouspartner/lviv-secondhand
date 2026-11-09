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
//     zone that reaches this route — www, the apex, and any other proxied
//     record a sibling service may add later (a Tunnel, another Worker) — is
//     passed straight through to whatever its own DNS record points at, so the Worker never
//     loops and never hijacks a sibling service. That also means each city
//     needs its own DNS record: NO wildcard `*` record, or hosts that exist
//     nowhere would land here with no origin behind them.
//   • The city list is a copy of cities.json; keep the two in step
//     (scripts/validate-cities.mjs checks the repo file, this one is hand-kept).
//
//
// SEO: one byte-for-byte copy is not quite enough. Every www page carries a
// static <link rel="canonical"> naming www, so a proxied city homepage told
// Google it was a duplicate of Lviv and was never indexed (Search Console:
// "Alternate page with proper canonical tag"). index.html does rewrite the
// canonical in JavaScript, but Google uses the raw HTML value. So on HTML
// responses this Worker edits <head> as it streams through (HTMLRewriter, no
// buffering):
//   • the city homepage gets a self-canonical and a matching og:url;
//   • any other page that already names a canonical keeps it (www — correct,
//     those pages are Lviv content or shared legal pages);
//   • any page with no canonical gets the www one appended, so Google never
//     has to guess between 11 copies ("Duplicate without user-selected
//     canonical").
// It also answers /robots.txt (www's rules, but this host's sitemap) and
// /sitemap.xml (just this city's homepage — the only page a city host owns).
//
// Deployed by .github/workflows/deploy-city-router.yml. No secrets, no storage.
// Tested by scripts/check-city-router.mjs.

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

    const read = request.method === 'GET' || request.method === 'HEAD';
    if (read && url.pathname === '/sitemap.xml') return citySitemap(host, request.method);

    // Same path and query on www. Method/body are forwarded for completeness,
    // but the site is static: only GET/HEAD ever do anything.
    const upstream = new Request(`${ORIGIN}${url.pathname}${url.search}`, {
      method: request.method,
      headers: stripHopHeaders(request.headers),
      body: read ? undefined : request.body,
      redirect: 'manual',
    });
    const res = await fetch(upstream, { cf: { cacheEverything: false } });

    // GitHub Pages answers redirects with absolute www URLs (e.g. /store →
    // /store/). Rewrite them onto the city host so the visitor stays there.
    const headers = new Headers(res.headers);
    const loc = headers.get('location');
    if (loc && loc.startsWith(ORIGIN)) headers.set('location', `https://${host}${loc.slice(ORIGIN.length)}`);
    headers.set('x-city-router', host.split('.')[0]);

    if (read && res.ok && url.pathname === '/robots.txt') {
      // www's rules verbatim (one source of truth), pointed at this host's sitemap.
      const text = (await res.text()).replace(/^Sitemap:.*$/gim, `Sitemap: https://${host}/sitemap.xml`);
      headers.delete('content-length');
      headers.delete('etag');
      return new Response(request.method === 'HEAD' ? null : text, { status: res.status, statusText: res.statusText, headers });
    }

    const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    if (request.method !== 'GET' || !res.ok || !(headers.get('content-type') || '').includes('text/html')) return out;
    return headRewriter(host, url.pathname).transform(out);
  },
};

// The <head> edits described at the top of this file.
function headRewriter(host, pathname) {
  const isHome = pathname === '/' || pathname === '/index.html';
  if (isHome) {
    const self = `https://${host}/`;
    return new HTMLRewriter()
      .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', self); } })
      .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', self); } });
  }
  // A page with no canonical of its own: name the www copy. /jobs/index.html
  // and /jobs/ are one page, so the canonical drops a trailing index.html.
  let seen = false;
  const www = `${ORIGIN}${pathname.replace(/\/index\.html$/, '/')}`;
  return new HTMLRewriter()
    .on('link[rel="canonical"]', { element() { seen = true; } })
    .on('head', {
      element(el) {
        el.onEndTag((end) => { if (!seen) end.before(`<link rel="canonical" href="${escAttr(www)}">`, { html: true }); });
      },
    });
}

// A city host owns exactly one page — its homepage. Everything else it serves
// is the www page under a www canonical, so it does not belong in this sitemap.
function citySitemap(host, method) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${host}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
  return new Response(method === 'HEAD' ? null : xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600', 'x-city-router': host.split('.')[0] },
  });
}

const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function stripHopHeaders(h) {
  const out = new Headers(h);
  for (const k of ['host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip']) out.delete(k);
  return out;
}

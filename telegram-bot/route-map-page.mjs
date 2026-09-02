// The field-agent "route" Mini App: a Telegram WebApp page (opened from
// cmdRoute()'s inline `web_app` button) showing a live map of every store
// currently available to the agent (not gated by AGENT_REVISIT_DAYS, not
// claimed by another agent -- see /route-map/data in worker.js). The agent
// taps pins to select up to ROUTE_SIZE, taps Submit, and the page POSTs the
// selection straight to /route-map/submit on this same Worker/origin (no
// CORS needed) -- see worker.js's comment on why this doesn't use
// Telegram's WebApp.sendData()/web_app_data relay: that mechanism is
// restricted to keyboard/menu-button-launched apps, and this one is opened
// from an inline button.
//
// Deliberately a small standalone page, not a mode grafted onto the public
// index.html -- that file's state (getData/getStoreOverrides/localStorage)
// is single-user and has nothing to do with a multi-agent claim system.
//
// check-inline-js.mjs syntax-checks the one bare script tag below by the
// same convention as index.html's own inline script -- keep it to exactly
// one such tag (Telegram's SDK and Leaflet stay as separate src-carrying
// script tags, which that check already ignores).
export const ROUTE_MAP_PAGE = `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Маршрут · Route</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
  html, body { height: 100%; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  #map { position: absolute; inset: 0 0 88px 0; }
  #bar {
    position: absolute; left: 0; right: 0; bottom: 0; height: 88px;
    background: var(--tg-theme-bg-color, #fff); color: var(--tg-theme-text-color, #111);
    border-top: 1px solid rgba(0,0,0,0.1); display: flex; flex-direction: column;
    justify-content: center; align-items: stretch; padding: 8px 16px; box-sizing: border-box; gap: 8px;
  }
  #hint { font-size: 13px; opacity: 0.75; text-align: center; line-height: 1.4; }
  #submit {
    height: 44px; border: none; border-radius: 10px; font-size: 16px; font-weight: 600;
    background: var(--tg-theme-button-color, #2ea6ff); color: var(--tg-theme-button-text-color, #fff);
  }
  #submit:disabled { opacity: 0.5; }
  #status {
    position: absolute; inset: 0; background: var(--tg-theme-bg-color, #fff); color: var(--tg-theme-text-color, #111);
    display: none; align-items: center; justify-content: center; text-align: center; padding: 24px; box-sizing: border-box;
    font-size: 16px; line-height: 1.5;
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="bar">
  <div id="hint">Оберіть магазини на карті · Pick stores on the map</div>
  <button id="submit" disabled>Надіслати (0) · Submit (0)</button>
</div>
<div id="status"></div>
<script>
(function () {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  var initData = tg ? tg.initData : '';

  var statusEl = document.getElementById('status');
  var submitBtn = document.getElementById('submit');
  var hintEl = document.getElementById('hint');
  function showStatus(html) {
    statusEl.innerHTML = html;
    statusEl.style.display = 'flex';
  }

  if (!initData) {
    showStatus('⚠️ Відкрийте цю сторінку з бота. · Please open this from the bot chat.');
    return;
  }

  var map = L.map('map').setView([49.835, 24.025], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);

  var MAX_SELECT = 12;
  var selected = {};
  var markers = {};

  function markerColor(id) {
    return selected[id] ? '#2ea6ff' : '#8a8f98';
  }
  function refreshMarker(id) {
    var m = markers[id];
    if (!m) return;
    m.setIcon(L.divIcon({
      className: '',
      html: '<div style="width:26px;height:26px;border-radius:50%;background:' + markerColor(id) +
        ';border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>',
      iconSize: [26, 26], iconAnchor: [13, 13],
    }));
  }
  function updateBar() {
    var n = Object.keys(selected).length;
    submitBtn.textContent = 'Надіслати (' + n + ') · Submit (' + n + ')';
    submitBtn.disabled = n === 0;
    hintEl.textContent = n >= MAX_SELECT
      ? 'Максимум ' + MAX_SELECT + ' магазинів за раз. · Maximum ' + MAX_SELECT + ' stores at once.'
      : 'Оберіть магазини на карті (до ' + MAX_SELECT + '). · Pick stores on the map (up to ' + MAX_SELECT + ').';
  }
  function toggle(id) {
    if (selected[id]) {
      delete selected[id];
    } else {
      if (Object.keys(selected).length >= MAX_SELECT) return;
      selected[id] = true;
    }
    refreshMarker(id);
    updateBar();
  }

  fetch('/route-map/data', { headers: { 'X-Telegram-Init-Data': initData } })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) { showStatus('⚠️ Не вдалося завантажити магазини. · Could not load stores.'); return; }
      MAX_SELECT = data.maxSelect || MAX_SELECT;
      if (!data.stores.length) {
        showStatus('🤷 Немає вільних магазинів прямо зараз. · No available stores right now.');
        return;
      }
      var bounds = [];
      data.stores.forEach(function (s) {
        if (s.ownClaim) selected[s.id] = true;
        var marker = L.marker([s.lat, s.lng], {
          icon: L.divIcon({ className: '', html: '', iconSize: [26, 26], iconAnchor: [13, 13] }),
        }).addTo(map);
        marker.bindPopup('<b>' + esc(s.name) + '</b>' + (s.address ? '<br>' + esc(s.address) : ''));
        marker.on('click', function () { toggle(s.id); });
        markers[s.id] = marker;
        refreshMarker(s.id);
        bounds.push([s.lat, s.lng]);
      });
      if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });
      updateBar();
    })
    .catch(function () { showStatus('⚠️ Помилка мережі. · Network error.'); });

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var geo = null;
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function (pos) { geo = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      function () {}, // Best-effort -- proceed without it if denied/unavailable.
      { timeout: 4000 },
    );
  }

  submitBtn.addEventListener('click', function () {
    var storeIds = Object.keys(selected);
    if (!storeIds.length) return;
    submitBtn.disabled = true;
    var payload = { initData: initData, storeIds: storeIds };
    if (geo) { payload.lat = geo.lat; payload.lng = geo.lng; }
    fetch('/route-map/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) {
          showStatus('⚠️ Не вдалося надіслати маршрут. · Could not submit the route.');
          return;
        }
        showStatus('✅ Маршрут надіслано! Перевірте чат. · Route sent — check your chat.\\n(' + res.claimed + ')');
        setTimeout(function () { if (tg) tg.close(); }, 1200);
      })
      .catch(function () {
        showStatus('⚠️ Помилка мережі. · Network error.');
        submitBtn.disabled = false;
      });
  });
})();
</script>
</body>
</html>
`;

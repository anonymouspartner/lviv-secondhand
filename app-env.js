/* Lviv Second Hand — app environment flag.
   Loaded early in <head> on every page with purchase UI. When the site runs
   inside the Android app (a Capacitor wrapper whose server.url is this site),
   it adds class "in-app" to <html>; CSS then hides every way to buy or pay
   (Google Play payments policy: shops buy on the website instead) and the page
   scripts guard their checkout entry points with window.lshInApp().
   In a normal browser none of the signals match and nothing changes.

   Signals:
   - window.Capacitor.isNativePlatform() / getPlatform() === 'android' — the
     native bridge Capacitor injects into the live page. It can arrive a little
     after this script runs, so the check repeats on DOMContentLoaded, on load
     and once shortly after, and lshInApp() re-checks on every call.
   - "LvivSecondHandApp" in the user agent — set by appendUserAgent in
     native/capacitor.config.json (only in app builds made after that change). */
(function () {
  var root = document.documentElement;
  function detect() {
    try {
      if (/LvivSecondHandApp/.test(navigator.userAgent || '')) return true;
      var C = window.Capacitor;
      if (!C) return false;
      if (typeof C.isNativePlatform === 'function' && C.isNativePlatform()) return true;
      if (typeof C.getPlatform === 'function' && C.getPlatform() === 'android') return true;
    } catch (e) {}
    return false;
  }
  function mark() {
    if (root.classList.contains('in-app')) return true;
    if (detect()) { root.classList.add('in-app'); return true; }
    return false;
  }
  window.lshInApp = mark;
  if (!mark()) {
    document.addEventListener('DOMContentLoaded', mark);
    window.addEventListener('load', mark);
    setTimeout(mark, 1500);
  }
})();

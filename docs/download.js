// Download: one big button for this computer, the other systems as small links, and the
// one-line install (no browser / system warnings) for this system first.
(function () {
  var CATALOG = 'https://raw.githubusercontent.com/Azizbek-dsgn/Meyor-Releases/main/catalog.json';
  var NAMES = {'win-x64': 'Windows', 'mac-arm64': 'Mac · Apple Silicon', 'mac-x64': 'Mac · Intel'};
  function mb(bytes) { return bytes ? ' · ' + Math.round(bytes / 1048576) + ' MB' : ''; }
  function appleSilicon() {
    try {
      var gl = document.createElement('canvas').getContext('webgl'), info = gl && gl.getExtension('WEBGL_debug_renderer_info');
      var gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      if (/Intel|AMD|Radeon/.test(gpu)) return false;
    } catch (e) {}
    return true; // every Mac sold since 2021
  }
  var ua = navigator.userAgent || '', platform = navigator.platform || '';
  var mac = /Mac/.test(platform) || /Mac OS X/.test(ua), win = /Win/.test(platform) || /Windows/.test(ua);
  var mine = win ? 'win-x64' : mac ? (appleSilicon() ? 'mac-arm64' : 'mac-x64') : null;
  Array.prototype.forEach.call(document.querySelectorAll('[data-get]'), function (box) {
    Array.prototype.forEach.call(box.querySelectorAll('.cmd'), function (c) {
      // this system's command first and open; the other one stays available below it
      if (mine && c.dataset.os === (win ? 'win' : 'mac')) c.parentNode.insertBefore(c, c.parentNode.querySelector('.cmd'));
      if (mine && c.dataset.os !== (win ? 'win' : 'mac')) c.classList.add('other');
    });
    if (mine) Array.prototype.forEach.call(box.querySelectorAll('[data-asset="' + mine + '"]'), function (a) { a.classList.add('mine'); });
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]'); if (!b) return;
    var done = function () { var t = b.textContent; b.textContent = b.dataset.done || '✓'; setTimeout(function () { b.textContent = t; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.copy).then(done, function () {});
    else { var r = document.createRange(); r.selectNodeContents(b.previousElementSibling); var s = getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); done(); }
  });
  fetch(CATALOG, {cache: 'no-store'}).then(function (r) { return r.json(); }).then(function (catalog) {
    var h = catalog.meyor;
    Array.prototype.forEach.call(document.querySelectorAll('[data-asset]'), function (a) { var x = h.assets[a.dataset.asset]; if (x) { a.href = x.url; a.title = 'v' + h.version + mb(x.bytes); } });
    Array.prototype.forEach.call(document.querySelectorAll('[data-main]'), function (a) {
      var key = mine && h.assets[mine] ? mine : null, label = a.querySelector('[data-main-label]');
      if (key) { a.href = h.assets[key].url; if (label) label.textContent = NAMES[key] + ' · v' + h.version + mb(h.assets[key].bytes); }
      else { a.href = '#download'; if (label) label.textContent = 'v' + h.version; }
    });
    var v = document.getElementById('version'); if (v) v.textContent = 'Hustler ' + h.version;
  }).catch(function () {});
})();

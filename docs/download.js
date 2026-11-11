// Download buttons: the newest Hustler straight from its release (the file downloads, the page stays open).
(function () {
  var CATALOG = 'https://raw.githubusercontent.com/Azizbek-dsgn/Meyor-Releases/main/catalog.json';
  function mb(bytes) { return bytes ? ' · ' + Math.round(bytes / 1048576) + ' MB' : ''; }
  function appleSilicon() {
    try {
      var gl = document.createElement('canvas').getContext('webgl'), info = gl && gl.getExtension('WEBGL_debug_renderer_info');
      var gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      if (/Apple M\d|Apple GPU/.test(gpu)) return true;
      if (/Intel|AMD|Radeon/.test(gpu)) return false;
    } catch (e) {}
    return true; // every Mac sold since 2021
  }
  var mac = /Mac/.test(navigator.platform || navigator.userAgent), win = /Win/.test(navigator.platform || navigator.userAgent);
  var mine = win ? 'win-x64' : mac ? (appleSilicon() ? 'mac-arm64' : 'mac-x64') : null;
  var buttons = document.querySelectorAll('[data-asset]');
  Array.prototype.forEach.call(buttons, function (b) { if (b.dataset.asset === mine) { b.classList.add('primary'); b.parentNode.insertBefore(b, b.parentNode.firstChild); } });
  fetch(CATALOG, {cache: 'no-store'}).then(function (r) { return r.json(); }).then(function (catalog) {
    var hustler = catalog.meyor;
    Array.prototype.forEach.call(buttons, function (b) {
      var asset = hustler.assets[b.dataset.asset]; if (!asset) return;
      b.href = asset.url; b.setAttribute('download', '');
      var size = b.querySelector('small'); if (size) size.textContent = 'v' + hustler.version + mb(asset.bytes);
    });
    var v = document.getElementById('version'); if (v) v.textContent = 'Hustler ' + hustler.version;
  }).catch(function () {});
})();

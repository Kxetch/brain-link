// Brain Link 0.1.4: lets the home server (the "brain") ask this TV to open a page, start an app or start a TizenBrew module.
// Plain old JavaScript (var, function) because older TVs run a very old Node.
(function () {
  var VERSION = '0.1.5-safe (0.1.4 code)';
  var BRAIN = ['192.168.1.158'];             // only these addresses may change anything; everyone else can only read the status
  var PORT = 8090;
  var started = Date.now();
  var state = { listening: false, error: null, requests: 0, last: null };
  var http;
  try { http = require('http'); } catch (e) { state.error = 'no http module: ' + e; }

  function query(url) {
    var out = {}, q = url.indexOf('?') < 0 ? '' : url.slice(url.indexOf('?') + 1);
    q.split('&').forEach(function (p) {
      if (!p) return;
      var i = p.indexOf('='), k = i < 0 ? p : p.slice(0, i), v = i < 0 ? '' : p.slice(i + 1);
      try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
    });
    return out;
  }
  function path(url) { var i = url.indexOf('?'); return i < 0 ? url : url.slice(0, i); }

  function snapshot() {
    var launch = false, appInfo = null;
    try { launch = typeof tizen.application.launchAppControl === 'function'; } catch (e) {}
    try { appInfo = tizen.application.getAppInfo().id; } catch (e) {}
    return {
      ok: true, service: 'brain-link', version: VERSION, uptimeS: Math.round((Date.now() - started) / 1000),
      node: process.version, listening: state.listening, error: state.error, requests: state.requests,
      canLaunchApps: launch, appId: appInfo, last: state.last
    };
  }

  // Open a web page in the TV's own browser (for example the sunrise page served by the brain).
  function open(q, done) {
    var url = q.url || '';
    if (!/^https?:\/\/[A-Za-z0-9._~:\/?#@!$&'()*+,;=%\-\[\]]{1,500}$/.test(url)) return done({ ok: false, error: 'bad url' });
    try {
      var ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', url);
      tizen.application.launchAppControl(ctrl, 'org.tizen.browser',
        function () { done({ ok: true, opened: url, by: 'browser' }); },
        function () {
          tizen.application.launchAppControl(ctrl, null,
            function () { done({ ok: true, opened: url, by: 'any' }); },
            function (e) { done({ ok: false, error: 'open failed: ' + (e && e.message) }); });
        });
    } catch (e) { done({ ok: false, error: 'exception: ' + e }); }
  }

  // Start an installed app by its id (Prime, YouTube, ...).
  function app(q, done) {
    var id = q.id || '';
    if (!/^[A-Za-z0-9._]{3,80}$/.test(id)) return done({ ok: false, error: 'bad app id' });
    try {
      tizen.application.launch(id,
        function () { done({ ok: true, launched: id }); },
        function (e) { done({ ok: false, error: 'launch failed: ' + (e && e.message) }); });
    } catch (e) { done({ ok: false, error: 'exception: ' + e }); }
  }

  // Ask TizenBrew to start a module (same call TizenTube's own cast server uses).
  function launch(q, done) {
    var name = q.module || '', op = q.op === 'default' ? 'default' : 'view';
    var type = q.type === 'npm' ? 'npm' : 'gh';
    if (!/^[A-Za-z0-9._@\/\-]{3,100}$/.test(name)) return done({ ok: false, error: 'bad module name' });
    try {
      var pkg = tizen.application.getAppInfo().packageId || tizen.application.getAppInfo().id.split('.')[0];
      var data = new tizen.ApplicationControlData('module', [JSON.stringify({ moduleName: name, moduleType: type, args: '' })]);
      var ctrl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/' + op, null, null, null, [data]);
      tizen.application.launchAppControl(ctrl, pkg + '.TizenBrewStandalone',
        function () { done({ ok: true, launched: name, op: op, pkg: pkg }); },
        function (e) { done({ ok: false, error: 'launch failed: ' + (e && e.message) }); });
    } catch (e) { done({ ok: false, error: 'exception: ' + e }); }
  }

  if (http) {
    try {
      var server = http.createServer(function (req, res) {
        state.requests++;
        var send = function (code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        var who = String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, '');
        var p = path(req.url), q = query(req.url);
        var routes = { '/open': open, '/app': app, '/launch': launch };
        if (routes[p] || p === '/exit') {
          if (BRAIN.indexOf(who) < 0) return send(403, { ok: false, error: 'not allowed from ' + who });
          if (req.method !== 'POST') return send(405, { ok: false, error: 'use POST' });
          if (p === '/exit') {                          // restart this service so a new version loads
            send(200, { ok: true, exiting: true });
            setTimeout(function () { try { tizen.application.getCurrentApplication().exit(); } catch (e) {} }, 300);
            return;
          }
          return routes[p](q, function (obj) { state.last = { path: p, ok: obj.ok, at: new Date().toISOString() }; send(200, obj); });
        }
        send(200, snapshot());
      });
      server.on('error', function (e) { state.error = String(e); state.listening = false; });
      server.on('listening', function () { state.listening = true; });
      server.listen(PORT, '0.0.0.0');
    } catch (e) { state.error = String(e); }
  }
})();

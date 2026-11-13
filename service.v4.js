// Brain Link 0.1.5 (0.1.4 plus /modules, /autolaunch and /run for TizenBrew modules): lets the home server (the "brain") ask this TV to open a page, start an app or start a TizenBrew module.
// Plain old JavaScript (var, function) because older TVs run a very old Node.
(function () {
  var VERSION = '0.1.5';
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


  // ---- TizenBrew modules: read its config, change the autolaunch module, restart it so the module starts ----
  var fs; try { fs = require('fs'); } catch (e) {}
  var CONFIG = '/home/owner/share/tizenbrewConfig.json';
  function readCfg() {
    if (!fs || !fs.existsSync(CONFIG)) return { modules: ['npm/@foxreis/tizentube'], autoLaunchServiceList: [], autoLaunchModule: '' };
    return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  }
  function modules(q, done) {
    try { var c = readCfg(); done({ ok: true, modules: c.modules, autoLaunchModule: c.autoLaunchModule, autoLaunchServiceList: c.autoLaunchServiceList }); }
    catch (e) { done({ ok: false, error: 'cannot read config: ' + e }); }
  }
  // module is "npm/@foxreis/tizentube" or "gh/user/repo" as TizenBrew lists it; empty switches autolaunch off
  function setAuto(name) {
    if (name !== '' && !/^(npm|gh)\/[A-Za-z0-9._@\/\-]{2,100}$/.test(name)) return { ok: false, error: 'bad module name' };
    var c = readCfg();
    if (name !== '' && c.modules.indexOf(name) < 0) return { ok: false, error: 'not in the TizenBrew module list', modules: c.modules };
    var before = c.autoLaunchModule || '';
    c.autoLaunchModule = name;
    fs.writeFileSync(CONFIG, JSON.stringify(c, null, 4));
    return { ok: true, autoLaunchModule: name, previous: before };
  }
  function autolaunch(q, done) {
    try { done(setAuto(q.module === undefined ? '' : q.module)); } catch (e) { done({ ok: false, error: 'exception: ' + e }); }
  }
  // Make TizenBrew start a module: set it as the autolaunch module, close TizenBrew's screen, open it again.
  function run(q, done) {
    var r;
    try { r = setAuto(q.module || ''); } catch (e) { return done({ ok: false, error: 'exception: ' + e }); }
    if (!r.ok) return done(r);
    var pkg;
    try { pkg = tizen.application.getAppInfo().packageId || tizen.application.getAppInfo().id.split('.')[0]; } catch (e) { return done({ ok: false, error: 'no package id' }); }
    var id = pkg + '.TizenBrewStandalone';
    var finished = false;
    function go() {
      if (finished) return; finished = true;
      try {
        tizen.application.launch(id,
          function () { done({ ok: true, started: q.module, previous: r.previous, note: 'autolaunch left set to this module' }); },
          function (e) { done({ ok: false, error: 'launch failed: ' + (e && e.message), previous: r.previous }); });
      } catch (e) { done({ ok: false, error: 'exception: ' + e }); }
    }
    try {
      var rq = http.request({ host: '127.0.0.1', port: 8001, path: '/api/v2/applications/' + id, method: 'DELETE' }, function (res) { res.resume(); setTimeout(go, 2500); });
      rq.on('error', function () { setTimeout(go, 500); });
      rq.setTimeout(4000, function () { try { rq.abort(); } catch (e) {} });
      rq.end();
    } catch (e) { go(); }
  }

  if (http) {
    try {
      var server = http.createServer(function (req, res) {
        state.requests++;
        var send = function (code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        var who = String((req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, '');
        var p = path(req.url), q = query(req.url);
        var routes = { '/open': open, '/app': app, '/launch': launch, '/autolaunch': autolaunch, '/run': run };
        if (p === '/modules') {
          if (BRAIN.indexOf(who) < 0) return send(403, { ok: false, error: 'not allowed from ' + who });
          return modules(q, function (obj) { send(200, obj); });
        }
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

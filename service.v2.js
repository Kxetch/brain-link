// Brain Link, step 1: prove that a TizenBrew service can listen on the home network and use the TV's launch API.
// Written in plain old JavaScript (var, function) because older TVs run a very old Node.
(function () {
  var started = Date.now();
  var state = { listening: false, error: null, requests: 0 };
  var http;
  try { http = require('http'); } catch (e) { state.error = 'no http module: ' + e; }

  function snapshot() {
    var launch = false, appInfo = null;
    try { launch = typeof tizen.application.launchAppControl === 'function'; } catch (e) {}
    try { appInfo = tizen.application.getAppInfo().id; } catch (e) {}
    return {
      ok: true, service: 'brain-link', version: '0.1.3', uptimeS: Math.round((Date.now() - started) / 1000),
      node: process.version, listening: state.listening, error: state.error, requests: state.requests,
      canLaunchApps: launch, appId: appInfo
    };
  }

  // Step 2 (test): ask TizenBrew to open one module. Only the Sunrise module is allowed for now, and only from the LAN.
  var ALLOWED = ['Kxetch/brain-sunrise'];
  function launch(url, done) {
    var m = /[?&]module=([^&]+)/.exec(url);
    var name = m ? decodeURIComponent(m[1]) : '';
    var o = /[?&]op=([a-z]+)/.exec(url);
    var op = o && o[1] === 'default' ? 'default' : 'view';      // 'view' is what TizenTube itself uses
    if (ALLOWED.indexOf(name) < 0) return done({ ok: false, error: 'module not allowed: ' + name });
    try {
      var pkg = tizen.application.getAppInfo().packageId || tizen.application.getAppInfo().id.split('.')[0];
      var data = new tizen.ApplicationControlData('module', [JSON.stringify({ moduleName: name, moduleType: 'gh', args: '' })]);
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
        var done = function (obj) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        if (req.url.indexOf('/launch') === 0) return launch(req.url, done);
        if (req.url.indexOf('/exit') === 0) {          // lets the brain restart this service so updates take effect (token check comes later)
          done({ ok: true, exiting: true });
          setTimeout(function () { try { tizen.application.getCurrentApplication().exit(); } catch (e) {} }, 300);
          return;
        }
        done(snapshot());
      });
      server.on('error', function (e) { state.error = String(e); state.listening = false; });
      server.on('listening', function () { state.listening = true; });
      server.listen(8090, '0.0.0.0');
    } catch (e) { state.error = String(e); }
  }
})();

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
      ok: true, service: 'brain-link', version: '0.1.0', uptimeS: Math.round((Date.now() - started) / 1000),
      node: process.version, listening: state.listening, error: state.error, requests: state.requests,
      canLaunchApps: launch, appId: appInfo
    };
  }

  if (http) {
    try {
      var server = http.createServer(function (req, res) {
        state.requests++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(snapshot()));
      });
      server.on('error', function (e) { state.error = String(e); state.listening = false; });
      server.on('listening', function () { state.listening = true; });
      server.listen(8090, '0.0.0.0');
    } catch (e) { state.error = String(e); }
  }
})();

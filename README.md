# brain-link

A TizenBrew service module that lets a home server on your own network ask a Samsung TV to do things (first step: answer a ping and report what the TV's launch API allows).

Install in TizenBrew: Module Manager, Add GitHub module, type `Kxetch/brain-link` (without `gh/`). Then Settings, Autolaunch Settings for services, pick Brain Link.

MIT licensed.

## 0.1.4: routes (only the brain's address may use them)

`POST /open?url=<http(s) url>` opens a page in the TV browser, `POST /app?id=<app id>` starts an installed app,
`POST /launch?module=<user/repo>&type=gh|npm&op=view|default` asks TizenBrew to start a module, `POST /exit` restarts the service.
`GET /` is a read-only status for everyone on the network. Edit `BRAIN` at the top of `service.v4.js` for your own server address.

## 0.1.5: TizenBrew modules

`GET /modules` lists TizenBrew's installed modules and autolaunch setting. `POST /autolaunch?module=npm/@foxreis/tizentube` (or empty to switch off)
changes the autolaunch module. `POST /run?module=npm/@foxreis/tizentube` sets it, closes TizenBrew's screen and opens it again, so the module starts.
`/run` leaves autolaunch set; the caller restores the old value (returned as `previous`) with `/autolaunch`.

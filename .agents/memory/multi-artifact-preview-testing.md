---
name: Multi-artifact preview & screenshot testing gotchas
description: How to correctly reach and verify a service in a multi-artifact project, and why local testing can show false failures.
---

## No unified port-5000 router locally
In a multi-artifact project, there is no local reverse proxy on 127.0.0.1:5000 multiplexing paths to each artifact's dev server. Each artifact's frontend runs on its own `localPort` (declared in its `artifact.toml`). The Screenshot tool's default target (`127.0.0.1:5000`) will simply refuse the connection — pass `source.port` set to the artifact's real dev port (e.g. the Vite `PORT` for a `web` artifact).

If a project was recently auto-converted from a single-artifact/legacy structure, an old workflow bound directly to port 5000 may still be running and make `127.0.0.1:5000` appear to work — that's leftover legacy state, not the real multi-artifact routing model, and disappears once the legacy workflow is correctly removed.

## CORS allow-list only covers `localhost`, not `127.0.0.1`
API servers built from the standard Replit CORS boilerplate whitelist `http://localhost:<port>` variants plus `https://$REPLIT_DEV_DOMAIN`, but NOT `http://127.0.0.1:<port>`. The Screenshot/appPreview tool navigates to `127.0.0.1`, so any same-origin frontend calling the API from that context gets real CORS 500s that a genuine user (who always hits the `*.replit.dev` domain) never sees. Before treating a 500/CORS error seen during local screenshot testing as a real bug, check whether the rejected origin is the `127.0.0.1:<port>` testing artifact rather than the actual preview domain.

**Why:** wasted significant effort chasing a "broken API" that was actually just a CORS allow-list gap for a testing-only origin.
**How to apply:** when a screenshot test shows a 500 tied to a CORS rejection log line, grep the server's CORS allow-list before assuming app code is broken.

## Screenshot tool can serve a stale cached page for time-sensitive UI
For timed/animated UI (e.g. a splash screen that unmounts after N ms), repeated Screenshot calls against the exact same URL can return a cached/already-past-the-timer page even though `curl` confirms the dev server is serving fresh, updated source. Appending a unique query string (e.g. `?cachebust=<anything>`) forces a true fresh navigation and reveals the real current state.
**How to apply:** when verifying a timed UI element via Screenshot and the result doesn't match the code you just wrote, retry with a cache-busting query param before concluding the code is wrong.

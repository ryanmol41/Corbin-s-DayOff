# Holiday time off

A React/Vite holiday coverage calendar with a small Node.js API. The app includes the 2026–27 planning window, team member and coverage dropdowns, holiday and weekend labels, calendar/list views, per-profile dark mode, and edit/delete controls for requests created by the selected profile.

## Requirements

- Node.js `>=22.13.0`
- npm

## Install and build

```bash
npm ci
npm run build
```

## Run on the Debian VM

Keep Node listening on loopback and put an authenticated reverse proxy such as Nginx in front of it:

```bash
HOST=127.0.0.1 PORT=3000 DATA_DIR=/var/lib/holiday-time-off npm start
```

The app serves the built site and API on port `3000`. `DATA_DIR` is created automatically and holds `time-off.json`; keep that directory on persistent storage and include it in backups. The default data directory is `./data`.

For a temporary direct LAN deployment, set `HOST=0.0.0.0` and open the port only to trusted networks. Do not expose the service directly to the public internet.

## Identity and access

This standalone export does not include the original ChatGPT sign-in or Site allowlist. The profile menu identifies the submitting team member, and the API uses that profile to show edit/delete controls only for requests attributed to that name. Without a trusted identity layer, the profile is self-selected and can be impersonated.

For a shared deployment, require authentication at the reverse proxy. Configure it to overwrite the `X-Team-Member` request header with the authenticated person's approved roster name, and ensure clients cannot supply that header themselves. The API accepts only names from its built-in roster. Change the trusted header with `IDENTITY_HEADER` if your proxy uses another header name. Do not treat the profile picker by itself as access control.

## Development

Run the Node API in one terminal and Vite in another:

```bash
npm start
npm run dev
```

Vite proxies `/api` requests to `http://127.0.0.1:3000`.

## Included files

- `src/app.jsx` — calendar application
- `src/main.jsx` — React entry point
- `src/styles.css` — responsive light/dark styling
- `index.html` — Vite document entry
- `package.json` — npm scripts and dependencies
- `vite.config.js` — React plugin and API proxy
- `server.js` — Node API and production static file server

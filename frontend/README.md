# Frontend — AI Knowledge Hub

React 19 + Vite single-page app. Browse and filter AI papers by topic, read the
Bedrock-generated summaries, play the Polly narration, and subscribe to the
weekly digest.

See the [root README](../README.md) for the full project and architecture.

## Development

```bash
npm install
npm run dev      # Vite dev server on :5173
npm run build    # production build to dist/
npm run lint
```

API calls go to `/api` by default. Point them elsewhere with
`VITE_API_BASE_URL=http://localhost:3000` in a `.env` file — useful when
running the backend directly instead of through Docker Compose.

## Production

The `Dockerfile` builds the app and serves `dist/` with Nginx, which proxies
`/api/*` to the backend container. `docker-entrypoint.sh` substitutes
`BACKEND_HOST` into `nginx.conf` at container start, so the same image works
under Docker Compose (`backend`) and on EC2 (`localhost`).

## Notable details

- **No router library.** `App.jsx` uses a small `useClientRouter` hook over the
  History API; Nginx serves `index.html` for unknown paths so deep links work.
- **`useDeferredValue` on topic filters** keeps the grid responsive while a
  refetch is in flight.

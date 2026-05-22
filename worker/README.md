# OpenAI CORS Proxy (Cloudflare Worker)

A tiny Cloudflare Worker that forwards requests to `api.openai.com` and adds the CORS headers OpenAI omits on `/v1/responses` (the Responses API endpoint we need for `web_search`).

## Why this exists

OpenAI's Responses API (`POST /v1/responses`) returns `405 Method Not Allowed` on CORS preflight from browsers, so direct browser-to-OpenAI calls fail. The older `/v1/chat/completions` endpoint *does* support browser CORS, but doesn't support the `web_search` tool — which the macro-calculation and program-generation prompts rely on.

This worker is the smallest possible fix: ~100 lines, stateless, free to run, and doesn't see or store your API key.

## Threat model

- **The worker never sees your API key.** Your browser sends `Authorization: Bearer sk-...`, the worker copies the header verbatim onto the upstream request, and the response comes back the same way. The worker has no KV / D1 / R2 bindings — there's nowhere it could store the key even if it tried.
- **Anyone who finds your worker URL can use it as an OpenAI proxy.** They'd still need their own API key (the worker doesn't add one). But this means you should not paste the worker URL into a public README; treat it as semi-private.
- **The worker only forwards `/v1/*` paths.** Anything else returns 404, so it's not an open relay for arbitrary URLs.

## Deploy

You need a free Cloudflare account.

```bash
# From the repo root
cd worker
pnpm install        # one-time, installs wrangler locally
pnpm auth           # opens browser, links your CF account
pnpm ship           # publishes the worker
```

> `pnpm auth` and `pnpm ship` are aliases for `pnpm run login` and
> `pnpm run deploy`. Used because `pnpm login` and `pnpm deploy` are
> reserved pnpm built-ins and would otherwise shadow the script.

Wrangler prints the URL after deploy, e.g.:
```
https://mypersonalfitness-openai-proxy.<your-subdomain>.workers.dev
```

Copy that URL. Then in the app:
1. Open **Settings → AI Settings**
2. Paste the URL into **Proxy URL**
3. Save

The app will now send AI requests to `<proxy>/v1/responses` instead of `https://api.openai.com/v1/responses`. The proxy forwards them with CORS headers and your AI features work.

## Verifying it works

```bash
# Health check (no auth required)
curl https://your-worker.workers.dev/

# Should print: OpenAI CORS proxy: OK
```

From the app's browser DevTools console:
```js
await fetch('https://your-worker.workers.dev/v1/models', {
  headers: { Authorization: 'Bearer ' + YOUR_KEY }
}).then(r => r.json())
```

If you see a list of models, the proxy is working.

## Costs

Cloudflare Workers free tier: **100,000 requests/day**, 10ms CPU per request. A heavy day of personal use is maybe 50 requests. You will not hit limits.

## Removing the proxy

To stop using it, just clear the **Proxy URL** field in Settings. The app falls back to calling `api.openai.com` directly, which means AI features stop working in browsers (per the CORS issue above) but the app itself continues to work for everything non-AI.

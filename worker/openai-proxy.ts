/**
 * Cloudflare Worker: OpenAI CORS Proxy
 *
 * Forwards requests to api.openai.com and adds the CORS headers OpenAI
 * omits on /v1/responses (the Responses API, which supports web_search).
 *
 * The user's API key stays in the browser — this worker just relays the
 * `Authorization` header through. It never reads, stores, or logs keys.
 *
 * Deploy: `cd worker && pnpm wrangler deploy`
 * Then paste the worker URL into Settings → AI Settings → Proxy URL.
 */

const ALLOWED_PATH_PREFIX = '/v1/';
const UPSTREAM_ORIGIN = 'https://api.openai.com';

// Headers we strip from incoming requests before forwarding — these are
// hop-by-hop or Cloudflare-injected and would confuse OpenAI's edge.
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-real-ip',
]);

function buildCorsHeaders(request: Request): HeadersInit {
  // Echo the request's Origin so credentialed-mode browsers don't reject the
  // response. We allow any origin because this proxy is per-user (you deploy
  // your own), so origin restriction would just create friction.
  const origin = request.headers.get('Origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      request.headers.get('Access-Control-Request-Headers') ?? '*',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers':
      'x-request-id, openai-organization, openai-processing-ms, openai-version',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight — answer immediately, don't proxy upstream
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(request),
      });
    }

    // Health check at root
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('OpenAI CORS proxy: OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', ...buildCorsHeaders(request) },
      });
    }

    // Only forward /v1/* — block anything else so this isn't an open relay
    if (!url.pathname.startsWith(ALLOWED_PATH_PREFIX)) {
      return new Response(
        JSON.stringify({
          error: { message: 'Path not allowed; must start with /v1/' },
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...buildCorsHeaders(request),
          },
        },
      );
    }

    // Build upstream request
    const upstreamUrl = UPSTREAM_ORIGIN + url.pathname + url.search;
    const forwardedHeaders = new Headers();
    request.headers.forEach((value, key) => {
      if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
        forwardedHeaders.set(key, value);
      }
    });

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers: forwardedHeaders,
        body:
          request.method === 'GET' || request.method === 'HEAD'
            ? undefined
            : request.body,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Upstream fetch failed',
            detail: err instanceof Error ? err.message : String(err),
          },
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            ...buildCorsHeaders(request),
          },
        },
      );
    }

    // Return upstream response verbatim, but add CORS headers
    const responseHeaders = new Headers(upstreamResponse.headers);
    const corsHeaders = buildCorsHeaders(request);
    for (const [key, value] of Object.entries(corsHeaders)) {
      responseHeaders.set(key, value);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};

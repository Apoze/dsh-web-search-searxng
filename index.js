import { WebError } from "@deepseek-ai/dsh-web";

export const name = "web-search-searxng";
export const inject = ["web"];

const defaultEndpoint = "http://127.0.0.1:8080";
const trackingParameters = new Set([
  "dclid", "fbclid", "gclid", "mc_cid", "mc_eid", "msclkid", "_ga", "_gl",
]);
const frenchQuery = /[àâæçéèêëîïôœùûüÿ]|\b(?:actualités|avec|comment|dans|des|france|français|les|pour|sécurité|sur|une)\b/iu;
const packageQuery = /\bnpm\b/iu;
const npmSearchNoise = /\b(?:docs?|documentation|npm|package)\b/giu;
const scienceQuery = /\b(?:arxiv|pubmed|research papers?|scientific papers?|semantic scholar|scholarly)\b/iu;
const webPlatformQuery = /\b(?:accessibility|css|javascript|typescript|web api)\b/iu;

export class SearxngSearchProvider {
  id = "searxng";

  constructor(config = {}) {
    this.endpoint = config.endpoint ?? process.env.SEARXNG_URL ?? defaultEndpoint;
  }

  available() {
    return isHttpUrl(this.endpoint);
  }

  async search(request, signal) {
    if (signal?.aborted) throw aborted(signal);

    const url = new URL("search", `${this.endpoint.replace(/\/$/u, "")}/`);
    url.searchParams.set("q", packageQuery.test(request.query) ? withoutNpmSelector(request.query) : request.query);
    url.searchParams.set("format", "json");
    url.searchParams.set("categories", categoriesFor(request.query));
    url.searchParams.set("language", frenchQuery.test(request.query) ? "fr-FR" : "en-US");

    let response;
    try {
      const headers = { accept: "application/json" };
      if (isLoopback(url.hostname)) headers["x-real-ip"] = "127.0.0.1";
      response = await fetch(url, {
        headers,
        redirect: "error",
        signal,
      });
    } catch (error) {
      if (signal?.aborted || error instanceof DOMException && error.name === "AbortError") {
        throw aborted(signal, error);
      }
      throw new WebError(`SearXNG search request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
    }

    if (!response.ok) {
      throw new WebError(`SearXNG search failed (HTTP ${response.status})`, "WEB_PROVIDER_ERROR");
    }

    let body;
    try {
      body = await response.json();
    } catch (error) {
      if (signal?.aborted || error instanceof DOMException && error.name === "AbortError") {
        throw aborted(signal, error);
      }
      throw new WebError("SearXNG returned invalid JSON", "WEB_PROVIDER_ERROR", { cause: error });
    }

    if (!body || !Array.isArray(body.results)) {
      throw new WebError("SearXNG returned an invalid result payload", "WEB_PROVIDER_ERROR");
    }

    const seen = new Set();
    const sources = [];
    for (const result of [...(Array.isArray(body.answers) ? body.answers : []), ...body.results]) {
      if (!result || !isHttpUrl(result.url)) continue;
      const key = dedupeKey(result.url);
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({
        url: result.url,
        ...(nonEmpty(result.title) && { title: result.title }),
        ...(nonEmpty(result.answer ?? result.content) && { snippet: result.answer ?? result.content }),
        ...(nonEmpty(result.publishedDate) && { publishedAt: result.publishedDate }),
      });
    }

    if (sources.length === 0 && Array.isArray(body.unresponsive_engines) && body.unresponsive_engines.length > 0) {
      throw new WebError(
        `SearXNG returned no results and reported ${body.unresponsive_engines.length} unavailable engine(s)`,
        "WEB_PROVIDER_ERROR",
      );
    }

    return { sources, truncated: false };
  }
}

export function apply(ctx, config = {}) {
  ctx.web.registerSearchProvider(new SearxngSearchProvider(config));
}

function isHttpUrl(value) {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  return ["http:", "https:"].includes(new URL(value).protocol);
}

function nonEmpty(value) {
  return typeof value === "string" && value.length > 0;
}

function dedupeKey(value) {
  const url = new URL(value);
  for (const key of new Set(url.searchParams.keys())) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith("utm_") || trackingParameters.has(normalized)) url.searchParams.delete(key);
  }
  return url.toString();
}

function isLoopback(hostname) {
  return hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "localhost";
}

function categoriesFor(query) {
  if (scienceQuery.test(query)) return "science";
  if (packageQuery.test(query)) return "packages";
  if (webPlatformQuery.test(query)) return "general,it";
  return "general";
}

function withoutNpmSelector(query) {
  return query.replace(npmSearchNoise, " ").replace(/\s+/gu, " ").trim() || query;
}

function aborted(signal, fallback) {
  return new WebError("SearXNG search aborted", "WEB_ABORTED", {
    cause: signal?.aborted ? signal.reason : fallback,
  });
}

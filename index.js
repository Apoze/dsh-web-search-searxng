import { WebError } from "@deepseek-ai/dsh-web";

export const name = "web-search-searxng";
export const inject = ["web"];

const defaultEndpoint = "http://127.0.0.1:8080";

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
    url.searchParams.set("q", request.query);
    url.searchParams.set("format", "json");
    url.searchParams.set("categories", "general");

    let response;
    try {
      response = await fetch(url, {
        headers: { accept: "application/json" },
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
    for (const result of body.results) {
      if (!result || !isHttpUrl(result.url) || seen.has(result.url)) continue;
      seen.add(result.url);
      sources.push({
        url: result.url,
        ...(nonEmpty(result.title) && { title: result.title }),
        ...(nonEmpty(result.content) && { snippet: result.content }),
        ...(nonEmpty(result.publishedDate) && { publishedAt: result.publishedDate }),
      });
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

function aborted(signal, fallback) {
  return new WebError("SearXNG search aborted", "WEB_ABORTED", {
    cause: signal?.aborted ? signal.reason : fallback,
  });
}

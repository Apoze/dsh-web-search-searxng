import assert from "node:assert/strict";
import test from "node:test";
import { SearxngSearchProvider } from "../index.js";

test("normalizes, deduplicates, rejects bad payloads, and preserves cancellation", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url) => {
    assert.equal(url.searchParams.get("format"), "json");
    return Response.json({ results: [
      { url: "https://example.com/a", title: "A", content: "Résumé" },
      { url: "https://example.com/a", title: "duplicate" },
      { url: "file:///tmp/no", title: "unsafe" },
    ] });
  };
  const provider = new SearxngSearchProvider();
  assert.equal(provider.available(), true);
  assert.deepEqual(await provider.search({ query: "test" }), {
    sources: [{ url: "https://example.com/a", title: "A", snippet: "Résumé" }],
    truncated: false,
  });

  globalThis.fetch = async () => Response.json({ nope: [] });
  await assert.rejects(provider.search({ query: "test" }), (error) => error.code === "WEB_PROVIDER_ERROR");

  const controller = new AbortController();
  controller.abort("stop");
  await assert.rejects(provider.search({ query: "test" }, controller.signal), (error) => error.code === "WEB_ABORTED");
});

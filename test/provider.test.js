import assert from "node:assert/strict";
import test from "node:test";
import { SearxngSearchProvider } from "../index.js";

test("normalizes and deduplicates tracking URLs without changing returned URLs", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url, options) => {
    assert.equal(url.searchParams.get("format"), "json");
    assert.equal(url.searchParams.get("q"), "test");
    assert.equal(url.searchParams.has("language"), false);
    assert.equal(url.searchParams.has("categories"), false);
    assert.equal(options.headers["x-real-ip"], "127.0.0.1");
    return Response.json({ results: [
      { url: "https://example.com/a?utm_source=test&mode=full#part", title: "A", content: "Résumé" },
      { url: "https://example.com/a?mode=full&utm_medium=email#part", title: "duplicate" },
      { url: "https://example.com/a?mode=brief#part", title: "different" },
      { url: "https://example.com/a?mode=full#other", title: "other section" },
      { url: "file:///tmp/no", title: "unsafe" },
    ] });
  };
  const provider = new SearxngSearchProvider();
  assert.equal(provider.available(), true);
  assert.deepEqual(await provider.search({ query: "test" }), {
    sources: [
      { url: "https://example.com/a?utm_source=test&mode=full#part", title: "A", snippet: "Résumé" },
      { url: "https://example.com/a?mode=brief#part", title: "different" },
      { url: "https://example.com/a?mode=full#other", title: "other section" },
    ],
    truncated: false,
  });
});

test("passes every query and native SearXNG syntax through unchanged", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const queries = [
    "HTML accessibility",
    "npm @mozilla/readability",
    "PubMed clinical safety",
    "documentation sécurité des API",
    ":fr !science site:example.org résultat exact",
  ];
  globalThis.fetch = async (url) => {
    assert.equal(url.searchParams.get("q"), queries.shift());
    assert.equal(url.searchParams.has("categories"), false);
    assert.equal(url.searchParams.has("language"), false);
    return Response.json({ results: [] });
  };
  const provider = new SearxngSearchProvider();
  for (const query of [...queries]) await provider.search({ query });
  assert.equal(queries.length, 0);
});

test("distinguishes legitimate empty results from an engine outage", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const provider = new SearxngSearchProvider();
  globalThis.fetch = async () => Response.json({ results: [], unresponsive_engines: [] });
  assert.deepEqual(await provider.search({ query: "nothing" }), { sources: [], truncated: false });

  globalThis.fetch = async () => Response.json({
    results: [],
    unresponsive_engines: [["engine", "timeout"]],
  });
  await assert.rejects(provider.search({ query: "failure" }), (error) => error.code === "WEB_PROVIDER_ERROR");

  globalThis.fetch = async () => Response.json({
    results: [{ url: "https://example.com/ok" }],
    unresponsive_engines: [["other", "timeout"]],
  });
  assert.equal((await provider.search({ query: "partial" })).sources.length, 1);
});

test("keeps citeable SearXNG answers before regular results", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({
    answers: [{ url: "https://example.com/converter", answer: "100 EUR = 116 USD" }],
    results: [{ url: "https://example.com/rates", title: "Rates" }],
  });

  assert.deepEqual((await new SearxngSearchProvider().search({ query: "100 EUR to USD" })).sources, [
    { url: "https://example.com/converter", snippet: "100 EUR = 116 USD" },
    { url: "https://example.com/rates", title: "Rates" },
  ]);
});

test("rejects HTTP and malformed responses", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const provider = new SearxngSearchProvider();

  globalThis.fetch = async () => new Response("no", { status: 503 });
  await assert.rejects(provider.search({ query: "test" }), (error) => error.code === "WEB_PROVIDER_ERROR");

  globalThis.fetch = async () => new Response("{", { headers: { "content-type": "application/json" } });
  await assert.rejects(provider.search({ query: "test" }), (error) => error.code === "WEB_PROVIDER_ERROR");

  globalThis.fetch = async () => Response.json({ nope: [] });
  await assert.rejects(provider.search({ query: "test" }), (error) => error.code === "WEB_PROVIDER_ERROR");
});

test("does not spoof client headers for a non-loopback endpoint and preserves cancellation", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers["x-real-ip"], undefined);
    return Response.json({ results: [] });
  };
  await new SearxngSearchProvider({ endpoint: "https://search.example" }).search({ query: "test" });

  const controller = new AbortController();
  controller.abort("stop");
  await assert.rejects(
    new SearxngSearchProvider().search({ query: "test" }, controller.signal),
    (error) => error.code === "WEB_ABORTED",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { SearxngSearchProvider } from "../index.js";

test("normalizes and deduplicates tracking URLs without changing returned URLs", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url, options) => {
    assert.equal(url.searchParams.get("format"), "json");
    assert.equal(url.searchParams.get("language"), "en-US");
    assert.equal(url.searchParams.get("categories"), "general");
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

test("routes explicit web-platform and scientific searches without changing their query", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const expected = [
    ["HTML accessibility", "HTML accessibility", "general,it", "en-US"],
    ["GitHub project", "GitHub project", "general", "en-US"],
    ["npm @mozilla/readability", "@mozilla/readability", "packages", "en-US"],
    ["PubMed clinical safety", "PubMed clinical safety", "science", "en-US"],
    ["documentation sécurité des API", "documentation sécurité des API", "general", "fr-FR"],
  ];
  globalThis.fetch = async (url) => {
    const [, sentQuery, categories, language] = expected.shift();
    assert.equal(url.searchParams.get("q"), sentQuery);
    assert.equal(url.searchParams.get("categories"), categories);
    assert.equal(url.searchParams.get("language"), language);
    return Response.json({ results: [] });
  };
  const provider = new SearxngSearchProvider();
  for (const [query] of [...expected]) await provider.search({ query });
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

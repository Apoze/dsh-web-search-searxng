# SearXNG Web Search for DeepSeek Harness

A local, key-free [SearXNG](https://github.com/searxng/searxng) provider for the native DeepSeek Harness `web_search` tool.

This is an unofficial community plugin.

## What it does

- Sends the model's query to SearXNG without rewriting it.
- Preserves SearXNG ranking, answers, snippets, dates, and original URLs.
- Removes known tracking parameters only when deduplicating results.
- Distinguishes a legitimate empty result from a total engine failure.
- Preserves native SearXNG syntax such as `:fr`, `!science`, and `site:`.
- Requires no DeepSeek API key.

## Requirements

- DeepSeek Harness with the Web profile
- Node.js 22 or newer
- A SearXNG instance with JSON output enabled
- Default endpoint: `http://127.0.0.1:8080`

## Install

```sh
dsh plugin --profile web add "git+https://github.com/Apoze/dsh-web-search-searxng.git#v0.1.0"
```

Add this provider to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- id: web
  config:
    searchProvider: searxng

- id: web-search-deepseek
  disabled: true

- insert:
    - id: web-search-searxng
      name: dsh-web-search-searxng
      config:
        endpoint: http://127.0.0.1:8080
```

Restart DSH, then verify the composed profile:

```sh
dsh --profile web --dump-config
dsh web
```

Set `SEARXNG_URL` instead of the patch-level `endpoint` when environment-based configuration is preferred.

## Test

```sh
pnpm install --frozen-lockfile
pnpm test
```

## Privacy

The plugin talks only to the configured SearXNG endpoint. It sends no DeepSeek Search request and uses no DeepSeek API key.

## License

[MIT](LICENSE)

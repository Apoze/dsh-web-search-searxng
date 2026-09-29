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
dsh plugin --profile web add /path/to/built/dsh-web-search-searxng
```

Configure the installed bundle in `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- id: web
  config:
    searchProvider: searxng

- id: web-search-deepseek
  disabled: true

- id: web-search-searxng
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

## Compatibilité DSH 0.2.0-rc.1

Cette version cible les contrats V4 de DSH et Cordis 4.0.4. L’installation locale utilise le fork natif NInfer basé sur le tag officiel `dsh-v0.2.0-rc.1`. Les anciens plugins de récupération finale ne doivent pas être activés en parallèle avec `dsh-generation-recovery`.

Pour développer contre le fork natif : installer les dépendances, puis exécuter `DSH_NATIVE_ROOT=/chemin/du/fork node scripts/link-native-core.mjs` avant la compilation. Les liens restent locaux dans `node_modules` ; les manifests et fichiers de verrouillage restent portables.

## Gestionnaire de plugins DSH

Le paquet déclare un bundle natif (`dsh.bundle.patch`) : il apparaît dans **Plugins → Installed**, avec activation/désactivation et désinstallation du profil. Installer le dossier construit avec `dsh plugin --profile web add /chemin/du/paquet`. Aucune publication GitHub ou npm n’est nécessaire.

Le bundle est le seul propriétaire de l’entrée `web-search-searxng`. Ne pas conserver une ancienne directive `insert` pour cette même entrée : remplacer celle-ci par un patch `id`/`config`, sans `name`. Les réglages utilisateur restent hors du paquet. Les interrupteurs agissent sur le profil sélectionné ; ne pas désactiver pendant une génération.

Le bundle enregistre le fournisseur sans réécrire les choix de routage `web`. Conserver les autres champs de `web.config` lors d’une modification. Désactiver un fournisseur encore sélectionné rend cette fonction Web indisponible, sans fallback silencieux vers un service différent.

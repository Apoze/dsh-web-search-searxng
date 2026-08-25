# dsh-web-search-searxng

Fournisseur local SearXNG pour le contrat `WebSearchProvider` de DeepSeek Harness.

- Source indépendante de l’installation globale de DSH.
- Endpoint par défaut : `http://127.0.0.1:8080`.
- Surcharge possible : config `endpoint` ou variable `SEARXNG_URL`.
- Aucun appel à l’API DeepSeek Search et aucune clé DeepSeek.
- Le classement SearXNG et les URL originales sont conservés; seuls les traceurs connus servent à la déduplication.
- Les réponses citeables de SearXNG, notamment Currency, sont exposées avant les résultats ordinaires.
- Les requêtes explicitement Web-platform ou scientifiques activent aussi les catégories SearXNG correspondantes; les autres restent en `general`.
- Les recherches contenant `npm` utilisent le moteur npm natif dans une catégorie isolée `packages`.
- Les requêtes françaises utilisent `fr-FR`, les autres `en-US`; ce choix mesuré évite les erreurs de détection sur les requêtes courtes et les filtres `site:`.
- Une panne partielle d’un moteur n’annule pas les résultats des autres; une panne totale devient une erreur explicite.
- `X-Real-IP: 127.0.0.1` n’est envoyé qu’à un endpoint loopback.

```sh
npm test
```

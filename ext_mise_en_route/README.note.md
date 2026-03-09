# ext_mise_en_route — sandbox d'exécution (non contractuel)

Ce dossier sert à **tester Ghost CLI** et à démontrer des fonctionnalités d’extensions (ex: génération de documentation / initialisation projet / workflows).

## Important

- Ce dossier n’est **pas** la documentation officielle de Ghost.
- Les fichiers générés ici (ex: `README.md`) sont **runtime-dependent** et sont donc ignorés par Git.
- Les **ancres d'autorité** du projet Ghost sont situées dans :
  - `README.md` (racine)
  - `docs/` (documentation versionnée)

## Preuve “replayable”

Pour vérifier l’état runtime et les extensions actives :

```bash
ghost extension list
ghost gateway health
```

Pour (re)générer la documentation via l’extension **“Ghost Documentation Bot”** (alias `ghost-docs-extension`) :

```bash
# Se placer dans le dossier sandbox
cd ext_mise_en_route

# Lancer l'initialisation (génère README.md)
node ../ghost.js initialize
```

> *Note* : La commande `initialize` utilise l'IA (Claude 4.6 par défaut) pour analyser la structure du projet et générer un README professionnel.

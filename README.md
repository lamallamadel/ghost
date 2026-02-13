# 👻 Ghost CLI [![ghost audit passed](https://img.shields.io/badge/ghost%20audit-passed-success)](https://github.com/atlasia/ghost)

> Assistant Git Intelligent, Local & Sécurisé.

## 🚀 Installation

```bash
npm install -g atlasia-ghost
```

## 🧩 Version Management (Before Commits/Tags)

Ghost can manage semantic versions (SemVer) and enforce version bump rules through Git hooks.

### Quick start

1) Create a shared version config in your repo:
```bash
ghost version init
```

2) Install hooks in the current Git repository:
```bash
ghost version install-hooks
```

3) Bump version (manual) and create an annotated tag:
```bash
ghost version bump --bump minor --tag
```

4) Automatic bump based on Conventional Commits since last tag:
```bash
ghost version bump --from-commits --tag
```

### What the hooks do

- `pre-commit`: blocks commits when merge conflicts are present.
- `commit-msg`: reads the commit message, determines required bump (major/minor/patch) from Conventional Commits, and blocks the commit if the version file in the Git index is not bumped enough.

### CI / builder-friendly output

- Non-interactive mode:
```bash
ghost version bump --from-commits --tag --ci
```
- JSON output (for CI logs parsing):
```bash
ghost version bump --from-commits --tag --output json
```

### Shared configuration (.ghost-versionrc)

Commit `.ghost-versionrc` to your repository so both coders and builders use the same rules.

Minimal example:
```json
{
  "versionFiles": [{ "type": "package-json", "path": "package.json" }],
  "tagPrefix": "v",
  "requireVersionBump": true,
  "autoTagAfterBump": true,
  "notifications": { "webhookUrl": null }
}
```

## 🧯 Merge Conflict Detection & Assistance

Ghost can detect and help you resolve merge conflicts.

```bash
ghost merge status
ghost merge resolve
```

Non-interactive resolution (all conflicted files):
```bash
ghost merge resolve --strategy ours --ci
ghost merge resolve --strategy theirs --ci
```

## 🤝 Collaborative Workflow (Coders + Builders)

- Shared rules: commit `.ghostrc` and `.ghost-versionrc` to the repo.
- Branch protection (recommended): protect `main`/`master`, require PR reviews, and run CI checks that execute `npm test`.
- Automated notifications: configure `notifications.webhookUrl` in `.ghost-versionrc` to POST structured events after version bump/tag operations.

## 🛡️ Gestion des Secrets

Ghost intègre un scanner de sécurité avancé pour empêcher les commits de secrets (clés API, tokens, etc.).

### Lancer un audit manuel
Vous pouvez auditer l'ensemble de votre projet à tout moment :
```bash
ghost audit --verbose
```

### Ignorer des faux positifs (.ghostignore)
Si Ghost détecte un faux positif (ex: une longue chaîne de configuration non sensible), vous pouvez l'ajouter dans un fichier `.ghostignore` à la racine de votre projet.

Exemple de `.ghostignore` :
```text
# Ignorer une clé publique de test
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQE

# Ignorer un fichier entier
config/test_keys.js
```

## 📊 Console de Monitoring & MCP (Nouveau v0.3.2)

Ghost intègre désormais une console de débogage et de monitoring temps réel, inspirée de Gemini.

```bash
ghost console
# ou
ghost --console
```
Cela lance un serveur local sur `http://localhost:3000` affichant :
- 📈 Métriques en temps réel (Latence API, nombre de requêtes, erreurs)
- 📝 Logs structurés et alertes de sécurité
- 🔌 **Endpoint MCP** : Compatible avec le *Model Context Protocol* sur `/mcp` pour l'intégration avec les IDEs et agents IA.

### Important : `desktop/` et `npm run desktop:dev`
- `ghost console` / `ghost --console` fonctionne **après installation globale** (`npm install -g atlasia-ghost`) : c'est une console **web locale** (serveur HTTP) incluse dans le package NPM.
- `npm run desktop:dev` est **uniquement** une commande de **développement** de l'application Electron/React située dans `desktop/`.
  - Elle nécessite un **clone du repository** (`git clone`), puis `npm install` dans `desktop/`.
  - Cette application **n'est pas** installée via `npm install -g atlasia-ghost` (le package NPM ne publie que le CLI `ghost.js`).

## 📄 Licence

MIT - [Adel Lamallam](https://github.com/lamallamadel)

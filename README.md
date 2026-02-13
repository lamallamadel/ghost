# 👻 Ghost CLI [![ghost audit passed](https://img.shields.io/badge/ghost%20audit-passed-success)](https://github.com/atlasia/ghost)

> Assistant Git Intelligent, Local & Sécurisé.

## 🚀 Installation

```bash
npm install -g atlasia-ghost
```

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
ghost --console
```
Cela lance un serveur local sur `http://localhost:3000` affichant :
- 📈 Métriques en temps réel (Latence API, nombre de requêtes, erreurs)
- 📝 Logs structurés et alertes de sécurité
- 🔌 **Endpoint MCP** : Compatible avec le *Model Context Protocol* sur `/mcp` pour l'intégration avec les IDEs et agents IA.

## 📄 Licence

MIT - [Adel Lamallam](https://github.com/lamallamadel)

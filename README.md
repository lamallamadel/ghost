# 👻 Ghost CLI

Assistant Git Intelligent (Node.js Edition) - Zéro-dépendance, compatible Windows, Mac et Linux.

Ghost analyse vos changements Git (`staged`), vérifie l'absence de secrets (clés API, tokens) et propose un message de commit professionnel suivant la convention **Conventional Commits**.

## 🚀 Installation

Vous pouvez installer Ghost globalement via npm :

```bash
npm install -g atlasia-ghost
```

Ou l'utiliser directement avec npx :

```bash
npx atlasia-ghost
```

## ⚙️ Configuration

Au premier lancement, Ghost vous demandera une **clé API Groq** (gratuite).
Vous pouvez en obtenir une ici : [https://console.groq.com](https://console.groq.com)

La configuration est stockée dans `~/.ghost`.

## 🛠️ Utilisation

Préparez vos fichiers comme d'habitude :

```bash
git add .
ghost
```

### Options disponibles

| Option | Description |
| :--- | :--- |
| `--model <name>` | Utiliser un modèle spécifique (ex: `llama-3.1-8b-instant`) |
| `--provider <name>` | Choisir le fournisseur (`groq` [défaut], `openai`) |
| `--no-security` | Désactiver l'audit de sécurité (scan de secrets) |
| `--dry-run` | Générer le message sans effectuer le commit |
| `--help`, `-h` | Afficher l'aide |

## 📝 Personnalisation

### Sélection de fichiers
Ghost propose désormais une sélection interactive si plusieurs fichiers sont modifiés. Vous pouvez spécifier les fichiers à analyser (ex: `1,3,5`) ou tout analyser (`all`).

### Configuration locale (`.ghostrc`)
Vous pouvez personnaliser le comportement de Ghost par projet en créant un fichier `.ghostrc` à la racine :

```json
{
  "prompt": "Ton prompt système personnalisé pour l'IA ici",
  "provider": "openai"
}
```

## 🛡️ Audit de Sécurité
Ghost scanne automatiquement vos modifications pour détecter les secrets (clés API, tokens, etc.) avant de commiter. Il utilise une double approche :
1. **Regex ciblées** : Pour les formats connus (AWS, GitHub, Slack, etc.)
2. **Analyse d'Entropie** : Pour détecter les chaînes aléatoires suspectes.

Vous pouvez désactiver cette vérification avec `--no-security` (non recommandé).

## 📊 Console de Monitoring & MCP (Nouveau v0.3.1)

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

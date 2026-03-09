# Capabilities & Conflicts (runtime truth)

Ghost charge des extensions qui déclarent des **capabilities** (ex: `filesystem`, `network`, `command`, `git`, `hooks`, etc.).

**Source of truth :**
- l’avertissement affiché par la CLI au démarrage
- les commandes d’inspection ci-dessous (`ghost extension list`, `ghost gateway …`)

## What the warning means

Au démarrage, Ghost peut afficher :

> `[ExtensionLoader] Capability conflicts detected (first-loaded wins)`

Cela signifie que plusieurs extensions déclarent des capabilities qui se chevauchent.
La règle actuelle est explicite : **first-loaded wins**.

## Why this matters

Ce mécanisme affecte :
- le **déterminisme** (ordre de chargement)
- la **sécurité** (capabilities sensibles : filesystem/network/command)
- l’**auditabilité** (qui “own” quoi au runtime)

## How to inspect (reproducible)

```bash
ghost extension list
ghost gateway extensions
ghost gateway health
ghost gateway logs --verbose
ghost gateway spans 50
```

Inspecter une extension spécifique :

```bash
ghost extension info <id>
```

## Recommended next step (roadmap)

1) **Commande dédiée** : `ghost gateway conflicts`
   - Imprime la matrice : capability -> winner extension -> contenders -> reason.
2) **Override config** : Permettre de "pinner" les propriétaires des capacités dans `~/.ghost/config/ghostrc.json`.
3) **Ordre de chargement** : Rendre l’ordre de chargement explicite et stable (documenté).
4) **CI gate** : Refuser les conflits non résolus en mode production.

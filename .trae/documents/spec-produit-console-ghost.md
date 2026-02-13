## 1. Product Overview
Console Ghost est une interface “terminal augmentée” multi-onglets pour piloter Ghost et Git depuis un seul endroit.
Elle vise à rendre les opérations Git avancées (amend/rebase/cherry-pick) plus sûres via validations, prévisualisations et logs détaillés.

## 2. Core Features

### 2.1 Feature Module
Notre produit se compose des pages principales suivantes :
1. **Choix du dépôt** : sélectionner/valider un repo Git local, reprendre le dernier repo.
2. **Console** : UI multi-onglets, exécution de commandes, historique persistant, logs détaillés.
3. **Paramètres** : préférences UI, gestion sécurité/validations Git, diagnostics.

### 2.3 Page Details
| Page Name | Module Name | Feature description |
|---|---|---|
| Choix du dépôt | Sélection repo | Ouvrir un sélecteur de dossier, détecter `.git`, afficher chemin/branche active, refuser si repo invalide. |
| Choix du dépôt | Récents | Reprendre le dernier dépôt, lister dépôts récents, supprimer un récent. |
| Console | Navigation onglets | Afficher onglets (Commandes, Historique, Git, Logs), conserver l’état par onglet, permettre ouverture/fermeture d’un onglet “session”. |
| Console | Exécution commandes | Saisir une commande Ghost, exécuter, afficher stdout/stderr, statut (succès/échec), durée, annulation. |
| Console | Historique persistant | Enregistrer chaque commande (repo, timestamp, statut, sortie tronquée), rechercher/filtrer, rejouer une commande. |
| Console | Git — actions guidées | Lancer **amend**, **rebase interactif**, **cherry-pick** depuis formulaires guidés (commits cibles), avec prévisualisation des effets. |
| Console | Git — validations sécurité | Valider état du repo avant action (dirty state, branche, HEAD détaché, conflits), exiger confirmation explicite si destructif. |
| Console | Logs détaillés | Centraliser logs (commande, étapes, validation, diff/patch résumé, erreurs), exporter en fichier. |
| Paramètres | Thème & rendu | Choisir thème sombre, transparence (opacité), densité, taille police monospace. |
| Paramètres | Comportement | Définir limites (taille max sortie, rétention historique), niveau de verbosité logs, options de confirmation. |
| Paramètres | Diagnostics | Afficher version app, version Git détectée, chemins, et test de permissions d’exécution. |

## 3. Core Process
**Flux principal (Utilisateur)**
1) Tu choisis un dépôt Git local (ou un récent).
2) Tu arrives sur la Console, tu exécutes des commandes Ghost.
3) Chaque exécution est enregistrée dans l’historique et dans les logs.
4) Pour une opération Git (amend/rebase/cherry-pick), tu passes par l’onglet Git : l’app valide l’état du repo, te montre une prévisualisation, puis exécute et journalise toutes les étapes.
5) En cas d’erreur (conflit, hooks, droits), l’app affiche les détails et conserve un log exportable.

```mermaid
graph TD
  A["Choix du dépôt"] --> B["Console"]
  B --> C["Onglet Commandes"]
  B --> D["Onglet Historique"]
  B --> E["Onglet Git"]
  B --> F["Onglet Logs"]
  B --> G["Paramètres"]
  E --> F
  C --> D
  C --> F
  D --> C
  G --> B
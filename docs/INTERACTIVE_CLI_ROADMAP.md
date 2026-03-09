# Roadmap : Ghost Interactive Shell (REPL) 👻✨

## Vision
Transformer Ghost d'une CLI classique (stateless) en une **application console interactive et persistante**, inspirée des standards modernes (Gemini CLI, OpenCode, GitHub Copilot CLI). 

Au lieu de taper `ghost commit --dry-run`, l'utilisateur tape simplement `ghost` pour entrer dans l'environnement Ghost. Une ligne de commande personnalisée apparaît, permettant de dialoguer avec l'IA ou de déclencher des actions via des **Slash Commands** (`/`).

## Expérience Utilisateur (UX) Cible

1. **Entrée** : Taper `ghost` dans le terminal ouvre le mode interactif.
2. **Prompt** : Un prompt stylisé apparaît (ex: `ghost> ` ou `👻 `).
3. **Slash Menu** : Taper `/` déclenche l'affichage dynamique d'un menu déroulant listant toutes les commandes (provenant de la Standard Library).
4. **Navigation** : Utilisation des flèches Haut/Bas pour naviguer dans le menu.
5. **Aide Contextuelle** : La sélection d'une commande affiche instantanément sa description et des "Tips" sur la droite ou en dessous.
6. **Exécution** : Appuyer sur `Entrée` exécute la commande via l'architecture Gateway existante, affiche le résultat, puis redonne la main au prompt.

## Architecture & Stack Technique

Pour réaliser cela sans dépendances massives, nous utiliserons une combinaison de modules natifs Node.js et de gestion TTY :

1. **Moteur REPL** : Module natif Node.js `readline` ou `repl` configuré avec un évaluateur personnalisé.
2. **Rendu TTY** : Manipulation directe des flux `process.stdin` (mode raw) et `process.stdout` via des séquences d'échappement ANSI pour dessiner le menu de sélection par-dessus le texte existant.
3. **Agrégateur de Commandes** : Un service dans le `Gateway` qui compile toutes les capacités, commandes, et descriptions des 21 extensions chargées pour alimenter le menu d'auto-complétion.

## Plan d'Implémentation (Phases)

### Phase 1 : Fondations du Shell Interactif
- Intercepter l'exécution de `ghost.js` sans arguments.
- Lancer une instance `readline.createInterface`.
- Mettre en place la boucle principale (Read -> Eval -> Print -> Loop).
- Connecter l'évaluateur pour qu'il parse les entrées textuelles et les route vers la fonction `forwardToExtension` existante.

### Phase 2 : Registre Dynamique des Commandes
- Ajouter une méthode `getCommandRegistry()` au Gateway.
- Extraire dynamiquement les métadonnées (nom, description, sous-commandes) des manifests ou des interfaces d'extensions pour construire l'arbre des commandes disponibles.

### Phase 3 : Le Menu "Slash" (Le gros morceau visuel)
- Activer `process.stdin.setRawMode(true)` pour écouter chaque frappe de touche (keypress).
- Si la touche `/` est frappée en début de ligne :
  - Interrompre l'affichage standard.
  - Dessiner le menu interactif sous le curseur en utilisant les codes ANSI (sauvegarder la position du curseur, dessiner la liste en surbrillance, restaurer).
- Implémenter la navigation au clavier (flèches) et la filtration en temps réel (fuzzy search) au fur et à mesure que l'utilisateur tape après le `/`.

### Phase 4 : Polish & Suggestions Contextuelles
- Ajouter un panneau latéral ou inférieur lors de la sélection d'une commande dans le menu `/` pour afficher les "Tips" (ex: "Exécute un audit de sécurité conforme NIST SI-10").
- Gérer l'historique des commandes (flèche haut pour rappeler la commande précédente).
- Assurer un redimensionnement propre si la fenêtre du terminal change de taille.

## Bibliothèques recommandées (Alternatives au tout-natif)
Si développer le rendu ANSI natif est trop chronophage, nous pouvons utiliser des librairies modernes minimalistes :
- **`clack`** ou **`@clack/prompts`** : Pour des interfaces CLI magnifiques et modernes.
- **`ink`** : Pour construire des UI CLI avec React (plus lourd, mais surpuissant pour les menus complexes).
- **`prompts`** : Léger et très personnalisable.

## Impact sur l'architecture existante
**Minime**. L'architecture Gateway est déjà conçue pour être découplée de l'interface (séparation CLI / Gateway / Extensions). Le Shell Interactif agira simplement comme un nouveau client qui envoie des requêtes au Gateway, tout comme le fait actuellement l'analyseur d'arguments classique.

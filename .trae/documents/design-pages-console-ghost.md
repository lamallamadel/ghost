# Design des pages — Console Ghost (desktop-first)

## Global Styles (tokens)
- Thème: sombre, fond #0B0F14 (base) + surfaces #121826 / #161F2B
- Transparence: surfaces “glass” `rgba(18,24,38,0.55)` + blur (backdrop-filter)
- Texte: #E6EDF3 (primary), #9FB0C0 (secondary), erreurs #FF5A6A, succès #3DDC97, accent #7C5CFF
- Typo: monospace (console) 13–15px, UI 14–16px; line-height 1.4–1.6
- Boutons: primary (accent), secondary (outline), danger (rouge); hover +4% luminosité
- Liens: accent + underline au hover
- États: focus ring accent; badges statut (OK/KO/Running)
- Layout responsive: desktop-first (≥1200px). En dessous: sidebar en drawer, onglets scrollables.

## Page 1 — Choix du dépôt
### Layout
Grid 12 colonnes, conteneur centré (max 1100px), cartes en 2 colonnes.

### Meta Information
- Title: “Console Ghost — Choisir un dépôt”
- Description: “Sélectionne un dépôt Git local pour exécuter des commandes et opérations Git guidées.”

### Page Structure
- Header minimal (logo + nom)
- Corps: carte “Sélection” + carte “Récents”
- Footer: aide courte (chemin, droits, Git détecté)

### Sections & Components
1) **Carte Sélection**
- Champ chemin (readonly) + bouton “Choisir un dossier”
- Résultat validation: repo OK/KO, branche active, dirty state
- CTA: “Ouvrir la console” (désactivé si KO)
2) **Carte Récents**
- Liste de dépôts (nom, chemin, dernière ouverture)
- Actions: ouvrir, retirer des récents
3) **Bandeau erreurs**
- Afficher raisons: “Pas de .git”, “Git non trouvé”, “Permissions insuffisantes”

## Page 2 — Console (multi-onglets)
### Layout
- Shell 2 zones: sidebar gauche (navigation + repo) + main panel.
- Main panel: barre d’onglets + contenu onglet.
- Onglet “Commandes” utilise un layout vertical: sortie (scroll) + input sticky.

### Meta Information
- Title: “Console Ghost — Session”
- Description: “Exécute des commandes, consulte l’historique, réalise des opérations Git guidées.”

### Page Structure
- **Top bar**: repo courant + branche + dirty badge + bouton Paramètres
- **Tabs**: Commandes / Historique / Git / Logs (+ onglets “session” optionnels)

### Sections & Components
1) **Onglet Commandes**
- Zone sortie (stdout/stderr colorés, timestamps optionnels)
- Input commande (autocomplete simple basé sur historique), bouton Run, bouton Cancel
- Résumé exécution: durée, exit code, lien “Voir dans Logs”
2) **Onglet Historique**
- Barre recherche + filtres (statut, date, repo)
- Table: commande, date, statut, durée
- Actions: “Rejouer”, “Copier”, “Ouvrir logs liés”
3) **Onglet Git**
- Sous-onglets: Amend / Rebase / Cherry-pick
- Panneau validations (checklist) + bouton “Revalider”
- Prévisualisation: commits concernés (hash court + message), avertissements (destructif)
- Confirmation: modal avec résumé + case “Je confirme”
4) **Onglet Logs**
- Timeline/stream (niveau, scope, message)
- Filtres (level/scope) + export (fichier)

## Page 3 — Paramètres
### Layout
2 colonnes: “Apparence” / “Comportement & diagnostics”. Sur petit écran: accordéons.

### Meta Information
- Title: “Console Ghost — Paramètres”
- Description: “Personnalise le thème, la transparence, la rétention d’historique et les validations Git.”

### Sections & Components
1) **Apparence**
- Slider opacité (transparence), toggle blur, taille police console, densité UI
2) **Comportement**
- Rétention historique (jours / taille max), taille max sortie, verbosité logs
- Confirmations: toggles pour actions destructives
3) **Diagnostics**
- Git détecté (version), chemin binaire, test exécution
- Boutons: “Exporter logs”, “Ouvrir dossier données”
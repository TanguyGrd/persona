# Windows

Persona dispose de deux hôtes : l'extension Chrome / Edge et une première application de bureau
Windows basée sur Tauri 2. Ils réutilisent le même moteur, les mêmes avatars et la même scène.
Pour lancer l'application de bureau, rendez-vous directement à la [section 2](#2-application-de-bureau-windows-mvp).

## 1. Tester l'extension sur un PC Windows (aujourd'hui)

Le guide Chrome ci-dessous utilise la branche historique `claude/nifty-brahmagupta-53buim`.
Le MVP de bureau est développé sur `feat/windows-companion-mvp`, puis le menu sur
`feat/desktop-avatar-menu`. L’atelier multi-images courant est sur `feat/character-workshop-phase1` :
voir [son guide](PHASE1-WORKSHOP.md). Utilisez le checkout contenant la version choisie pour la section 2 ;
ne remplacez pas votre branche de travail ni vos modifications locales.

### Étape 1 — Installer les outils (une seule fois)

1. **Google Chrome** (ou Microsoft Edge) à jour.
2. **Node.js 22 LTS** : <https://nodejs.org/> → « Windows Installer (.msi) », options par défaut.
3. **Git** : <https://git-scm.com/download/win>, options par défaut (inclut Git Credential Manager, qui ouvrira
   une fenêtre de connexion GitHub si le dépôt est privé).
4. Ouvrez **PowerShell** (menu Démarrer → « PowerShell ») et vérifiez :

```powershell
node -v
```

```powershell
git --version
```

### Étape 2 — Récupérer le code de la branche

```powershell
cd $HOME\Documents
```

```powershell
git clone -b claude/nifty-brahmagupta-53buim https://github.com/TanguyGrd/persona.git
```

```powershell
cd persona
```

Sans Git : sur GitHub, choisissez la branche `claude/nifty-brahmagupta-53buim`, puis **Code → Download ZIP**,
décompressez-le et ouvrez PowerShell dans le dossier obtenu.

### Étape 3 — Compiler

```powershell
npm ci
```

```powershell
npm run build
```

Le dossier à charger dans Chrome est `Documents\persona\dist\extension` (il contient `manifest.json`).

> Si PowerShell affiche « l'exécution de scripts est désactivée sur ce système », lancez une fois
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` puis relancez la commande, ou utilisez l'Invite de
> commandes (`cmd`) à la place de PowerShell.

### Étape 4 — Charger l'extension dans Chrome

1. Dans la barre d'adresse : `chrome://extensions`
2. Activez **Mode développeur** (interrupteur en haut à droite).
3. Cliquez **Charger l'extension non empaquetée**.
4. Sélectionnez le dossier `Documents\persona\dist\extension` (celui qui contient `manifest.json`), puis
   **Sélectionner un dossier**.
5. La carte « Persona — compagnon animé » apparaît et un onglet de bienvenue s'ouvre.
6. Cliquez sur la pièce de puzzle de la barre d'outils, puis sur la punaise à côté de Persona pour épingler l'icône.

Dans **Edge** : `edge://extensions` → **Mode développeur** (colonne de gauche) → **Charger l'extension décompressée**.

### Étape 5 — Ce qu'il faut vérifier

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Regarder l'onglet de bienvenue, ou ouvrir un site (ex. <https://fr.wikipedia.org>) | Pip sort de derrière le bas de la fenêtre (ou saute / apparaît en étincelles), puis salue dans une bulle selon l'heure. |
| 2 | Attendre 30 secondes sans rien faire de spécial | Il respire, cligne des yeux, suit la souris du regard, se promène, fait coucou, saute, fait parfois une remarque. |
| 3 | Cliquer une fois sur lui | Il réagit (gigote, saute, tourne ou rougit), parfois avec une phrase. |
| 4 | Cliquer 4 fois rapidement | Sa tête tourne : « Doucement, doucement ! ». |
| 5 | Le glisser au milieu de la page et lâcher | Il pendouille en agitant les bras, puis retombe en bas. Rechargez la page : il revient au même endroit. |
| 6 | Le survoler, cliquer sur « – » | Il dit au revoir et disparaît ; une pastille « ▲ Pip » reste en bas à droite, aussi dans les autres onglets. Cliquez-la pour le faire revenir. |
| 7 | `Alt + Maj + P` | Masque / fait revenir le compagnon de l'onglet actif. |
| 8 | Icône Persona → décocher « Actif sur <nom du site> » | Il disparaît de ce site uniquement. Recochez pour le retrouver. |
| 9 | Icône Persona → décocher « Compagnon activé » | Il disparaît de tous les onglets. |
| 10 | Icône Persona → « Personnages et réglages » → Réglages → votre prénom | Les salutations suivantes peuvent vous appeler par votre prénom. |
| 11 | « Créer un personnage » : un nom + une description → « Générer le profil » | Un profil est proposé avec un niveau de confiance et la liste de ce qui est à vérifier ; « Créer et activer » le met sur les pages. |
| 12 | « Importer » : une image PNG/GIF/SVG à vous | Un nouveau personnage avec cet avatar apparaît sur les pages. |

Tout fonctionne hors ligne, sans compte ni clé API. Les sites internes (`chrome://…`, Chrome Web Store) et
les PDF ne peuvent pas afficher le compagnon : c'est une limite de Chrome.

### Mettre à jour après une modification

```powershell
git pull
```

```powershell
npm run build
```

Puis, dans `chrome://extensions`, cliquez sur la flèche circulaire de la carte Persona et rechargez vos onglets.
Pendant le développement, `npm run watch` recompile à chaque sauvegarde.

### Créer un zip (partage ou Chrome Web Store)

```powershell
npm run pack
```

Le fichier est créé dans `release\persona-extension-<version>.zip` (via `Compress-Archive`). Pour l'installer
ailleurs : décompressez-le dans un dossier, puis « Charger l'extension non empaquetée » sur ce dossier.

### Lancer les tests sous Windows

```powershell
npm test
```

```powershell
npx playwright install chromium
```

```powershell
npm run test:e2e
```

La deuxième commande télécharge une seule fois le Chromium utilisé par les tests de bout en bout.

### Raccourci clavier

`Alt + Maj + P` masque / affiche le compagnon sur l'onglet actif. Si un autre logiciel utilise déjà ce
raccourci, changez-le dans `chrome://extensions/shortcuts`.

### Désinstaller

`chrome://extensions` → carte Persona → **Supprimer**. Les réglages et personnages stockés sont effacés avec elle.

## 2. Application de bureau Windows (MVP)

L'hôte Tauri 2 est dans `src-tauri/`, son interface TypeScript dans `src/hosts/windows/`.
Le compagnon utilise `src/core`, `src/stage` et `characters/pip` : il ne nécessite aucun compte,
serveur, abonnement ou clé API.

### Prérequis Windows

Utilisez Windows 10/11 64 bits et un terminal PowerShell ou une invite de commandes :

1. **Node.js 22 ou version supérieure**, avec npm : <https://nodejs.org/>.
2. **Rust stable ≥ 1.90 via rustup**, avec la chaîne MSVC : <https://rustup.rs/>. Conservez le choix
   `stable-x86_64-pc-windows-msvc` proposé par défaut.
3. **Visual Studio 2022 Build Tools** : <https://visualstudio.microsoft.com/visual-cpp-build-tools/>.
   Dans l'installateur, sélectionnez **Développement Desktop en C++**, avec les outils MSVC et un
   **SDK Windows 10/11**. Redémarrez le terminal après installation.
4. **Microsoft Edge WebView2 Runtime** : normalement déjà installé sur Windows 10/11 ; sinon utilisez
   l'installateur Evergreen officiel : <https://developer.microsoft.com/microsoft-edge/webview2/>.

Vérifiez les outils :

```powershell
node --version
npm --version
rustc --version
cargo --version
rustup show active-toolchain
```

### Installer et lancer

Dans votre checkout de Persona, passez sur la branche du MVP :

```powershell
git fetch origin
git switch feat/windows-companion-mvp
```

Puis installez et lancez :

```powershell
npm ci
npm run desktop:dev
```

`desktop:dev` compile l'interface, démarre son serveur de développement et lance Tauri.
Le premier lancement compile les dépendances Rust et peut prendre plusieurs minutes.
Les changements TypeScript sont reconstruits pendant le développement ; relancez l'application pour
recharger la WebView (pas de HMR). Après un changement HTML/CSS, redémarrez aussi la commande. Les
changements Rust entraînent une recompilation native.

Le comportement implémenté est le suivant, à valider sur votre PC avec la liste de contrôle ci-dessous :

- Pip apparaît dans une fenêtre de **360 × 320** pixels logiques, transparente, sans bordure et toujours
  au premier plan. La fenêtre n'occupe pas tout l'écran.
- Les animations, bulles et réactions aux clics proviennent de la scène partagée. Un clic court fait
  réagir Pip ; un glisser sur le personnage, au-delà d'un petit seuil, déplace la fenêtre sur le bureau.
- Les zones transparentes en dehors du personnage, des bulles, des boutons et des réglages laissent
  passer les interactions vers les applications situées dessous. L'hôte natif surveille la position
  du curseur pour réactiver l'interaction sur ces zones ; ce comportement reste à vérifier sur Windows.
- Le bouton **–** masque le compagnon. L'icône Persona dans la **zone de notification** permet de
  l'afficher ou le masquer, d'ouvrir les réglages, de réinitialiser sa position et de **quitter**.
  Si l'icône est rangée, ouvrez le chevron de la zone de notification Windows.
- Les réglages du MVP proposent le prénom utilisé dans les répliques, le personnage disponible,
  la taille, la fréquence d'activité, les répliques et la réduction des mouvements.

L’hôte initial conservait réglages, profils et mémoire dans le `localStorage` de la WebView.
L’[atelier multi-images](PHASE1-WORKSHOP.md) les migre vers IndexedDB, via le `Repository` existant. La position de la fenêtre est conservée séparément dans le répertoire de
configuration de l'application. Les données de l'extension Chrome restent distinctes : aucune
synchronisation automatique n’est ajoutée. L’atelier de phase 1 ajoute la création locale d’avatar
à partir d’images et le transfert manuel de packs vers Chrome ; le rigging avancé reste à développer.
La commande de réinitialisation de position permet de récupérer une fenêtre déplacée hors écran.
Les données de développement et celles de l'application empaquetée utilisent des origines WebView
distinctes ; les réglages ne sont pas transférés automatiquement de l'une à l'autre.

### Compiler l'application et l'installeur

```powershell
npm run desktop:build
```

Cette commande construit la version optimisée et l'installeur **NSIS**. Les sorties Tauri sont sous
`src-tauri/target/release/`, et l'installeur sous `src-tauri/target/release/bundle/nsis/`.
Le binaire peut être lancé depuis son dossier de sortie ; l'installeur sert à une installation locale.
Ce MVP n'est pas signé : Windows peut afficher un avertissement SmartScreen. Aucun dépôt public,
publication automatique ou déploiement n'est effectué par les commandes de développement.

### Tests automatisés

Depuis la racine du dépôt :

```powershell
npm run typecheck
npm test
npm run desktop:frontend
npx playwright install chromium
npm run test:desktop
npm run desktop:test:native
```

`desktop:frontend` compile seulement l'interface de bureau. `test:desktop` vérifie l'adaptateur de bureau
et la scène dans un navigateur ; il ne prouve pas la transparence ni le passage des clics dans Windows.
Les tests Rust vérifient la logique native testable. `desktop:build` reste nécessaire pour vérifier la
compilation et l'empaquetage Windows.

Pour vérifier aussi l'extension existante :

```powershell
npx playwright install chromium
npm run test:e2e
npm run verify:package
```

Le workflow GitHub **Windows desktop** compile et teste le code sur un runner Windows puis conserve
un installeur non signé comme artefact de CI ; il ne publie aucune release et ne remplace pas les
vérifications visuelles ci-dessous. Son exécution et son succès doivent être vérifiés séparément.

### Validation manuelle sur Windows

Les vérifications natives ci-dessous sont nécessaires avant de considérer le MVP validé sur votre PC :

| Action | Résultat à vérifier |
|---|---|
| Lancer `npm run desktop:dev` | Pip est visible sur le bureau, le fond est transparent, sans bordure ni fenêtre opaque. |
| Ouvrir et déplacer une autre application | Pip reste au premier plan et son animation continue. |
| Attendre puis cliquer une fois sur Pip | Animation de repos, salutations et réaction au clic ; le clic ne déplace pas la fenêtre. |
| Glisser Pip vers plusieurs endroits | La fenêtre suit la souris et reste utilisable après le relâchement. |
| Cliquer ou sélectionner du texte sous les zones vides autour de Pip | L'application dessous reçoit l'interaction ; aucun grand rectangle invisible ne la bloque. |
| Survoler Pip et utiliser ses boutons ou la bulle | Les zones visibles restent interactives malgré le passage des clics autour. |
| Masquer puis afficher via la zone de notification | Le compagnon revient et réagit ; l'icône reste disponible pendant le masquage. |
| Modifier prénom, taille et mouvements réduits ; relancer | Les réglages sont conservés et les bulles restent lisibles. |
| Déplacer, quitter et relancer | La position est restaurée ; « Réinitialiser la position » récupère une fenêtre perdue. |
| Tester deux écrans et des échelles 100 %, 125 %, 150 % | Aucun décalage entre zones cliquables et dessin, déplacement et restauration corrects. |
| Débrancher un écran, puis relancer ou réinitialiser | Le compagnon peut revenir sur un écran disponible. |
| Choisir « Quitter » | La fenêtre et l'icône disparaissent ; aucun compagnon ne reste actif. |
| Installer puis lancer le NSIS sur un PC équipé de WebView2 | Installation et lancement fonctionnent indépendamment du serveur de développement. |

### État de validation et limites

L'implémentation est préparée dans un environnement cloud Linux, **sans session Windows disponible**.
Les animations et les tests de navigateur ne constituent pas une validation du comportement natif
Windows. Les résultats exacts des commandes exécutées sont consignés dans le compte rendu de livraison.
L'audit initial a confirmé la compilation et les 83 tests unitaires existants ; le téléchargement du
Chromium Playwright était refusé par la politique réseau (`cdn.playwright.dev`).

Ce MVP ne fournit pas encore de démarrage automatique avec Windows, de dissimulation automatique
pendant les jeux/présentations, de perchoirs sur les fenêtres, de synchronisation Chrome, d'agent IA,
de voix ou de paiement. La marche se déroule dans la petite scène de la fenêtre ; le déplacement
sur le bureau est manuel.

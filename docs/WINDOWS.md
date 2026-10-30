# Windows

Deux sujets : utiliser Persona **aujourd'hui** sous Windows (extension Chrome / Edge), et le **futur hôte
Windows** qui affichera le compagnon par-dessus toutes les applications.

## 1. Tester l'extension sur un PC Windows (aujourd'hui)

Tant que la Pull Request n'est pas fusionnée, le code est sur la branche **`claude/nifty-brahmagupta-53buim`**
(la branche `main` est encore vide). Toutes les commandes ci-dessous en tiennent compte.

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
npm install
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

## 2. Futur hôte Windows

Objectif : le compagnon vit sur le **bureau**, au-dessus de toutes les fenêtres, se pose sur la barre des
tâches ou le bord des fenêtres. À démarrer **après** validation de l'expérience Chrome.

### Ce qui est déjà réutilisable

| Brique | Réutilisation |
|---|---|
| `src/core/*` | Telle quelle (TypeScript sans API navigateur). |
| `src/stage/*` | Telle quelle dans une WebView : c'est du DOM pur. |
| `KeyValueStore` | À implémenter sur un fichier JSON dans `%APPDATA%\Persona\`. |
| `HostServices` (`src/core/host.ts`) | `openSettings`, `placeName` (nom de l'appli au premier plan), `disableHere` (exclure une appli). |

### Choix technique recommandé

**Tauri 2** (WebView2 déjà présent sur Windows 10/11) plutôt qu'Electron : installeur ~5–10 Mo au lieu
de ~100 Mo, consommation mémoire plus faible, ce qui compte pour une appli toujours ouverte.
Electron reste une option si l'on veut partager plus de code Node (capri-companion l'utilise).

### Étapes

1. Fenêtre plein écran **transparente, sans bordure, toujours au premier plan**, exclue de la barre des tâches
   et d'Alt+Tab (`WS_EX_TOOLWINDOW`).
2. **Clics traversants** : la fenêtre ignore la souris (`WS_EX_TRANSPARENT` / `set_ignore_cursor_events`)
   sauf au-dessus du personnage, de la bulle et de la barre d'outils. La scène connaît déjà ces zones
   (`.pc-hit`, `.pc-bubble`, `.pc-toolbar`) : il suffit de remonter leurs rectangles à l'hôte.
3. **Sol** : remplacer « bas de la fenêtre du navigateur » par la zone de travail (`SystemParametersInfo
   SPI_GETWORKAREA`), donc le haut de la barre des tâches ; multi-écrans via `EnumDisplayMonitors`.
4. **Perchoirs** (évolution du moteur) : nouvelle activité `perch` sur le bord supérieur de la fenêtre active
   (`GetForegroundWindow` + `DwmGetWindowAttribute`), en suivant ses déplacements.
5. **Discrétion** : se cacher automatiquement en plein écran (jeux, vidéos, présentations) et respecter
   « Ne pas déranger » / heures calmes.
6. **Démarrage** avec Windows (clé `Run` ou tâche planifiée), icône dans la zone de notification
   (masquer, réglages, quitter).
7. **Réglages et personnages** : réutiliser la page d'options (même code, stockage fichier) et proposer
   l'import d'un pack `.persona.json` exporté depuis l'extension.
8. **Distribution** : installeur MSIX ou NSIS **signé** (sinon SmartScreen avertit l'utilisateur).

### Synchronisation avec l'extension

Phase 1 : export / import de packs `.persona.json`. Phase 2 (premium) : compte et synchronisation des
personnages entre navigateur et bureau.

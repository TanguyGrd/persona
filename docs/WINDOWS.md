# Windows

Deux sujets : utiliser Persona **aujourd'hui** sous Windows (extension Chrome / Edge), et le **futur hôte
Windows** qui affichera le compagnon par-dessus toutes les applications.

## 1. Installer l'extension sous Windows (aujourd'hui)

### Prérequis

- Windows 10 ou 11.
- Google Chrome (ou Microsoft Edge, Brave, Opera — tout navigateur Chromium récent, version 116+).
- Pour compiler depuis les sources : [Node.js 20 ou 22 LTS](https://nodejs.org/) et [Git](https://git-scm.com/download/win).

### Compiler (PowerShell)

```powershell
git clone https://github.com/TanguyGrd/persona.git
```

```powershell
cd persona
```

```powershell
npm install
```

```powershell
npm run build
```

Le dossier prêt à charger est `persona\dist\extension`.

> Si PowerShell refuse `npm` (« l'exécution de scripts est désactivée »), lancez une fois :
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, ou utilisez l'Invite de commandes (`cmd`).

### Charger dans Chrome

1. Ouvrez `chrome://extensions`.
2. Activez **Mode développeur** (en haut à droite).
3. Cliquez **Charger l'extension non empaquetée** et choisissez le dossier `persona\dist\extension`.
4. Une page de bienvenue s'ouvre : Pip arrive en bas de la page et vous salue. Il apparaît aussi sur les
   onglets http/https déjà ouverts.
5. Épinglez l'icône Persona (pièce de puzzle → punaise) pour accéder rapidement au menu.

Dans **Edge** : `edge://extensions` → « Mode développeur » (en bas à gauche) → « Charger l'extension décompressée ».

### Mettre à jour après une modification

```powershell
npm run build
```

Puis, dans `chrome://extensions`, cliquez sur la flèche circulaire de la carte Persona. Pendant le
développement, `npm run watch` recompile à chaque sauvegarde.

### Créer un zip (partage ou Chrome Web Store)

```powershell
npm run pack
```

Le fichier est créé dans `release\persona-extension-<version>.zip` (via `Compress-Archive`).

### Tests sous Windows

```powershell
npm test
```

```powershell
npx playwright install chromium
```

```powershell
npm run test:e2e
```

La deuxième commande télécharge le Chromium utilisé par les tests de bout en bout (une seule fois).

### Raccourci clavier

`Alt + Maj + P` masque / affiche le compagnon sur l'onglet actif. Modifiable dans `chrome://extensions/shortcuts`.

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

# Phase 1 — Atelier de création

Cette tranche suit le cahier des charges Persona sans engager les phases de recherche IA, rigging,
agent ou paiement. Elle complète le menu déjà développé au lieu de remplacer le moteur.

## Audit et intégration

Audit des références distantes le 8 novembre 2026 :

| Référence | Commit audité | Contenu |
|---|---|---|
| `main` | `a20d9ad` | Base initiale vide ; ne contient pas le produit courant. |
| `claude/nifty-brahmagupta-53buim` | `64fbdfa` | Branche par défaut et `HEAD` distant : extension Chrome, moteur, profils, avatars et tests. |
| `feat/windows-companion-mvp` | `07ce736` | Hôte Windows Tauri 2 et rapport de validation. |
| `feat/desktop-avatar-menu` | `03fb04f` | Menu d'accueil, import d'une image et activation locale. |

La [PR #1](https://github.com/TanguyGrd/persona/pull/1) est ouverte en brouillon, de la branche Chrome
vers `main`. C'était la seule PR ouverte au moment de l'audit. Les données publiques de GitHub ont été
consultées pour l'état des PR, car l'API GitHub était refusée par la politique réseau.

`feat/desktop-avatar-menu` descend de `feat/windows-companion-mvp`, qui descend du code Chrome.
La nouvelle branche `feat/character-workshop-phase1` part du menu. Sa PR est prévue avec
`feat/desktop-avatar-menu` comme base : le diff porte ainsi sur l'atelier multi-images, sans mélanger
les travaux Windows précédents. Cette PR empilée dépend du menu ; les branches antérieures devront
être revues et intégrées dans leur ordre avant une livraison sur la branche principale. Aucune fusion
ni réécriture d'historique n'est effectuée automatiquement.

Les composants conservés sont `src/core` (moteur, profil, importeur et Repository), `src/stage`
(scène et réactions), `characters/pip` et le shell Tauri 2. Aucune ressource de Capri n'est intégrée.

## Parcours de cette livraison

Au premier lancement : **« Choisis ton personnage. Donne-lui vie. »**

1. Importer ou déposer entre **1 et 10 images**. La limite est de **8 Mio par fichier** et **32 Mio au
   total**. Les fichiers incompatibles ou illisibles donnent un message d'erreur.
2. Examiner les références, choisir l'image principale et retirer une référence si nécessaire.
3. Donner éventuellement un nom, un univers d'origine et une description de personnalité.
4. Vérifier la prévisualisation et créer le compagnon.
5. Retrouver le compagnon dans la galerie et l'activer sur le bureau.

La vue principale fournit l'avatar animé. Les autres vues sont conservées comme références pour les
futures analyses ; cette phase ne reconstruit pas un personnage ni des parties invisibles à partir
de plusieurs images. L'animation instantanée déplace l'image entière, sauf lorsqu'un SVG comporte déjà
les parties articulées reconnues par le moteur. Le fond n'est pas supprimé automatiquement.

La sélection automatique d'une personne dans une image de groupe, la segmentation et le réglage des
articulations ne sont pas livrés ici. L'utilisateur doit fournir une vue principale adaptée.

## Données et compatibilité Chrome

Les données du bureau sont conservées dans **IndexedDB**, afin de ne pas enfermer les références
multiples dans le petit quota de `localStorage`. Les données existantes de l'ancien hôte sont migrées
sans demander de recréer le compagnon. L'ancien stockage ne doit pas être effacé avant qu'une
migration réussie soit établie. La position de la fenêtre native reste dans son fichier de configuration
Tauri séparé.

Un pack exportable transporte le profil, l'avatar principal et les références. Son import dans Chrome
est **manuel** ; l'extension et le bureau restent des hôtes séparés. Il ne s'agit pas d'une synchronisation
ni d'un pont local authentifié. Les limites du pack, sa normalisation et les quotas de stockage de
l'hôte destinataire peuvent empêcher l'import d'un pack trop volumineux : l'erreur doit être affichée,
sans annoncer un import réussi.

Les interfaces de traitement d'avatar et de recherche d'identité préparent les phases suivantes.
Le traitement actuel reste local : aucune image n'est envoyée, aucune source externe n'est recherchée,
aucun résultat IA n'est inventé et aucun coût n'est engagé. L'univers saisi est une déclaration de
l'utilisateur, pas une identité vérifiée. La clé d'un futur fournisseur cloud devra rester côté serveur.

## Installer, lancer et vérifier

Dans un checkout de la branche `feat/character-workshop-phase1` :

```powershell
npm ci
npm run typecheck
npm test
npm run desktop:frontend
npx playwright install chromium
npm run test:desktop
```

Sur un PC Windows avec Rust stable MSVC ≥ 1.90, les Build Tools C++/SDK et WebView2 :

```powershell
npm run desktop:dev
npm run desktop:test:native
npm run desktop:build
```

Le build produit normalement un installeur NSIS sous `src-tauri/target/release/bundle/nsis/`.
La présence de la commande n'établit pas qu'un installeur a été produit. Le PC de l'utilisateur final
ne doit pas nécessiter Rust ou Node lorsqu'un installeur validé sera livré.

Pour l'extension :

```powershell
npm run build
npm run test:e2e
npm run verify:package
```

Dans le cloud, le navigateur système peut vérifier l'atelier avec :

```bash
PERSONA_TEST_CHROMIUM=/usr/bin/chromium npm run test:desktop
```

Cette suite exécute le frontend dans Chromium avec un pont IPC simulé. Elle n'exécute pas
Tauri sous Windows et ne prouve ni les clics traversants, ni le glisser natif, ni le tray.

## Résultats et démonstration de cette tranche

- `npm run typecheck` : réussi.
- `npm test` : **105 tests réussis**, dont limites de références/dimensions, sanitation,
  sauvegarde et nettoyage après échec, concurrence des réglages, packs et anciens profils.
- `PERSONA_TEST_CHROMIUM=/usr/bin/chromium npm run test:desktop` : **20 tests réussis**
  (13 tests du frontend, 5 tests IndexedDB et 2 tests de l'ancien adaptateur).
- `npm run build`, `npm run desktop:frontend`, `npm run pack` : réussis.
- `cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc
  --tests --locked --features tauri/custom-protocol -j 4` : réussi, avec ressources embarquées.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` : réussi.
- `npm run verify:package` : manifest et 12 fichiers référencés validés, puis échec au lancement du navigateur ; la validation complète du ZIP reste bloquée.
- `npm run test:e2e` : échec du hook de démarrage, **15 tests non exécutés** ; le Chromium
  Playwright1243 manque, son téléchargement ayant été refusé par le réseau. Le Chromium système156
  n'a pas chargé l'extension lors d'essais séparés. Aucun succès d'intégration Chrome native revendiqué.

La compatibilité des packs est vérifiée par export réellement téléchargé dans Chromium et
réimportation via l'importeur partagé utilisé par Chrome, avec de nouveaux IDs et toutes les vues.
Le code d'import/export de la page d'options Chrome est compilé et conserve ces vues.

Le test des images très larges a détecté puis vérifié deux corrections : dimension d'affichage adaptée
à la petite scène, et annulation des trajectoires calculées avant un redimensionnement. Les trois
boutons restent dans le viewport même pour un avatar très plat. L'image sauvegardée reste intacte.
Les rasters sont limités à 8192px par côté et 16 mégapixels pour borner le coût des aperçus.

[Capture de l'atelier](screenshots/phase1-workshop.png) ·
[Prévisualisation et création](screenshots/phase1-workshop-ready.png) ·
[Démonstration vidéo (7,44 secondes)](demos/phase1-workshop.webm).

Ces artefacts sont des captures **du frontend Chromium, avec IPC simulé**, pas une démonstration
Windows. Les SVG supplémentaires du test sont des dessins originaux élémentaires, pas des vues
reconstruites à partir de Pip. La vidéo n'atteste pas un rigging ni une analyse IA.

Pour réenregistrer :

```bash
PERSONA_TEST_CHROMIUM=/usr/bin/chromium PERSONA_RECORD_DEMO=1 npm run test:desktop -- tests/desktop/browser.test.ts
```

Playwright doit disposer de ffmpeg pour la vidéo. Dans ce cloud, le ffmpeg système a été utilisé
comme outil d'enregistrement à la place du binaire Playwright indisponible ; aucune vérification
TLS ni politique réseau n'a été désactivée.

## Vérifications manuelles Windows restantes

- Le premier lancement ouvre l'atelier lisible et le bouton de création reste accessible.
- Le dépôt depuis l'Explorateur accepte une ou plusieurs images ; aucune navigation vers le fichier
  ne remplace l'atelier.
- Les vignettes permettent de changer de vue principale et de retirer une référence.
- Après création puis redémarrage, nom, univers, profil, avatar et références sont conservés.
- Les anciens compagnons restent accessibles après migration.
- Le passage atelier/bureau restaure une fenêtre utilisable ; déplacement, tray et quitter restent
  fonctionnels, y compris à 125/150 % de DPI et avec plusieurs écrans.
- Le pack exporté est importable dans l'extension Chrome, et une erreur de taille/quota n'est pas
  présentée comme un succès.
- Le programme empaqueté démarre sans serveur de développement ni outil de compilation installé.

## Distribution et limites externes

Aucun paiement réel, abonnement, frais fournisseur, déploiement public, changement de visibilité
ou de licence n'est engagé. Aucun autre dépôt GitHub n'est modifié.

Lors des livraisons précédentes, GitHub Actions refusait de démarrer les jobs pour un problème de
facturation du compte et la machine Linux ne disposait pas de `link.exe`. Ces observations restent
historiques : il faut reconsulter la CI après le push de cette phase avant d'en déduire son état courant.
Une proposition de domaine `api.github.com` a été enregistrée dans le brouillon de configuration réseau ;
son application et l'accès à l'API doivent être vérifiés avant de déclarer la PR créée. Aucun de ces
blocages ne se résout en fusionnant les branches ou en prétendant qu'un build natif a réussi.

La prochaine phase pertinente est la recherche de personnage avec sources, ambiguïtés et correction
manuelle, puis la préparation 2D. Ces travaux ne doivent pas bloquer le mode instantané local livré ici.


## État GitHub après livraison

La branche `feat/character-workshop-phase1` a été poussée. La commande `gh pr create` avec base
`feat/desktop-avatar-menu` a été tentée, mais l'API a répondu `Forbidden`. **Aucune PR de phase 1
n'a été créée.** La [description prête à publier](PHASE1-PR.md) et la
[comparaison des branches](https://github.com/TanguyGrd/persona/compare/feat/desktop-avatar-menu...feat/character-workshop-phase1?expand=1)
sont disponibles. Le domaine `api.github.com` doit être appliqué dans les paramètres réseau pour
permettre une nouvelle tentative automatique, avec l'authentification existante.

Le [workflow Windows déclenché par ce push](https://github.com/TanguyGrd/persona/actions/runs/42516036920)
a échoué avant de démarrer un job. Annotation GitHub constatée : « The job was not started because
your account is locked due to a billing issue. » Le workflow CI existant est aussi en échec immédiat.
Il n'existe donc **aucun nouvel installeur Windows ni résultat de tests Windows** pour cette livraison.
Le propriétaire du compte doit résoudre ce blocage GitHub Actions ou utiliser un poste Windows
équipé pour compiler ; cela reste distinct des validations locales réussies ci-dessus.

## Mise à jour après résolution de la facturation

La relance autorisée après ajout de la carte a permis d’exécuter les jobs. Un défaut de fin de
trajectoire, détecté par la CI Chrome, a été corrigé dans `a2ed257` sans abaisser les assertions.
Deux tests de régression ont été ajoutés : 107 tests unitaires et 20 tests bureau passent localement.

Les workflows [Windows](https://github.com/TanguyGrd/persona/actions/runs/42518500894) et
[Chrome/Linux](https://github.com/TanguyGrd/persona/actions/runs/42518500958) ont maintenant réussi,
y compris compilation et packaging Windows, tests Chrome E2E et chargement du ZIP dans Chromium.
Un véritable installeur Windows non signé est disponible : [instructions et téléchargement](INSTALLER-WINDOWS.md).
Cela remplace les blocages de build/CI décrits historiquement plus haut, sans constituer une validation
visuelle du bureau Windows. Le blocage d’accès à l’API pour créer la PR reste distinct.

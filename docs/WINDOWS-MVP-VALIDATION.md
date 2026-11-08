# Validation du MVP Windows — 8 novembre 2026

Branche : `feat/windows-companion-mvp`, basée sur `64fbdfa` (la branche initiale du checkout cloud était
`work`, au même commit que le travail Chrome fourni). Aucun moteur ou personnage n'a été remplacé.
L'ancien hôte Windows ne contenait que de la documentation.

## Vérifications exécutées dans le cloud Linux

| Vérification | Résultat |
|---|---|
| Installation verrouillée `npm ci` | Réussie, Node 24.22.1 / npm 11.9.0. |
| `npm run typecheck` | Réussi. |
| `npm test` | 83 tests existants réussis, 8 fichiers. |
| `npm run build` | Extension et playground compilés. Le nettoyage conserve désormais `dist/windows`. |
| `npm run pack` | ZIP Chrome généré. |
| `npm run desktop:frontend` | Interface Windows et moteur partagé compilés avec esbuild. |
| `PERSONA_TEST_CHROMIUM=/usr/bin/chromium npm run test:desktop` | 9 tests réussis dans le véritable Chromium système, liaison native simulée. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Réussi. |
| `cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc --tests --locked -j 4` | Réussi, y compris les appels Windows et les tests compilés. |
| Même `cargo check`, avec `--features tauri/custom-protocol` | Réussi : vérifie aussi le contexte de production avec ressources embarquées. |
| Tests de `src-tauri/src/geometry.rs` | 3 réussis sous Linux via une petite crate temporaire utilisant le module réel et serde, sans WebView. |

Rust 1.99.1 et la cible Windows MSVC ont été installés dans le workspace. Le compilateur de ressources
`llvm-rc` provient d'un paquet Debian dont les métadonnées signées et les SHA256 ont été vérifiés.
Ces outils permettent de vérifier les types Windows ; ils ne fournissent pas une machine Windows.

## Blocages et vérifications non effectuées

- Le téléchargement du Chromium Playwright verrouillé échoue avec HTTP 403 « Domain forbidden »
  depuis `cdn.playwright.dev`. `npm run test:e2e` échoue dans le hook de démarrage : **15 tests Chrome
  non exécutés**. Le navigateur système ne remplace pas cette version pour la validation de l'extension.
- `npm run verify:package` valide le manifest et les 12 fichiers référencés, puis échoue faute de ce
  navigateur. La validation complète du ZIP n'est donc pas réussie.
- Un prétest de liaison ciblant Windows échoue avec **`link.exe not found`**. Les Build Tools MSVC et
  une session Windows sont absents. Aucun `.exe` ni installeur Windows n'a été produit ici ; aucun
  comportement natif n'a été exécuté ou vérifié visuellement.
- Les tests Chromium valident la scène et les demandes IPC, pas le tray, les clics traversants, la
  transparence WebView2, le déplacement natif, le premier plan ou le multi-écran. Ces points restent à
  vérifier avec la checklist de [WINDOWS.md](WINDOWS.md#validation-manuelle-sur-windows).

## Livraison et suite

Le workflow `.github/workflows/windows.yml` est prévu pour compiler et tester sur Windows et conserver
un installeur NSIS non signé comme artefact de CI. Sa présence n'établit pas qu'une exécution distante a
réussi. Il ne publie aucune release. La procédure d'installation des outils, de lancement et de build
sur votre PC se trouve dans [WINDOWS.md](WINDOWS.md#2-application-de-bureau-windows-mvp).

Le critère « Pip utilisable sur un vrai bureau Windows » reste à confirmer sur Windows. Aucun paiement,
agent IA avancé, accès au contenu des applications, démarrage automatique ou synchronisation Chrome
n'a été ajouté.

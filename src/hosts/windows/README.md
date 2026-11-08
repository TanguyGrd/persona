# Hôte Windows — MVP Tauri 2

Cette interface réutilise `src/core`, `src/stage`, les personnages de `characters/` et le `Repository`
existant. Le shell natif est dans `src-tauri/` : fenêtre transparente et sans bordure de 360 × 320,
premier plan, déplacement natif, passage des clics hors des zones interactives et zone de notification.

Depuis la racine du dépôt :

```powershell
npm ci
npm run desktop:dev
```

Autres commandes : `npm run desktop:frontend` pour compiler l'interface seule,
`npm run desktop:build` pour compiler et empaqueter avec NSIS, `npm run test:desktop` pour les tests
d'adaptateur dans le navigateur, et `cargo test --manifest-path src-tauri/Cargo.toml` pour les tests Rust.

Les réglages, profils et souvenirs sont persistés par un `KeyValueStore` sur le `localStorage`
de la WebView ; la position native est stockée séparément dans la configuration de l'application.
Aucune donnée Chrome n'est synchronisée automatiquement.

Voir le [guide Windows](../../../docs/WINDOWS.md#2-application-de-bureau-windows-mvp) pour les prérequis
Node/Rust/MSVC/WebView2, le lancement, l'installeur, les limites et la validation manuelle.
Le comportement natif Windows nécessite une validation sur Windows ; les tests Linux et navigateur
ne valident pas la transparence, le premier plan ou les clics traversants.

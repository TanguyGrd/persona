# Windows Host (à venir)

Objectif : afficher le compagnon **par-dessus toutes les fenêtres** de Windows, pas seulement dans Chrome.

Ce dossier ne contient pas encore de code : l'expérience Chrome doit d'abord être validée (voir la mission).
L'architecture est prête pour lui :

- `src/core` (profil, moteur, avatars, réglages) ne dépend d'aucune API de navigateur ;
- `src/stage` (la scène) ne dépend que du DOM : elle tourne telle quelle dans une WebView ;
- `src/hosts/playground` montre déjà la scène sans Chrome, avec un stockage `localStorage`.

Plan d'implémentation proposé : voir [`docs/WINDOWS.md`](../../../docs/WINDOWS.md#2-futur-hôte-windows).

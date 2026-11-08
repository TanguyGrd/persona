# Menu et création de compagnon

Ce document décrit le menu initial de `feat/desktop-avatar-menu`. La suite sur
`feat/character-workshop-phase1` apporte l’atelier multi-images et son stockage IndexedDB : voir
[PHASE1-WORKSHOP.md](PHASE1-WORKSHOP.md).

L'expérience visée pour l'utilisateur est un installeur `.exe`, puis un menu de création au lancement.
Rust, Node et les outils C++ servent à fabriquer ce programme ; ils ne doivent pas être demandés à
l'utilisateur de la version distribuée. L'installeur NSIS reste construit par `npm run desktop:build`
ou par le workflow Windows. Aucun installeur n'est fourni tant que le build Windows n'a pas réussi.

## Implémenté

- Menu d'accueil à la première ouverture, galerie des compagnons et choix de Pip.
- Menu accessible ensuite via les réglages et « Mes compagnons · Créer » dans la zone de notification.
- Fenêtre de menu agrandie (jusqu'à 760 × 640 logiques), puis retour à la petite scène et à sa position.
- Image déposée ou choisie, aperçu, nom et description de personnalité, puis « Créer et jouer ».
- PNG, JPEG, WebP, GIF, SVG via l'importeur et sa sanitation existants ; limite 8 Mo.
- Profil construit par les règles locales existantes, sauvegarde locale et activation immédiate.
- Dans cette première version, une seule vue était acceptée. Cette restriction est remplacée par la
  sélection de 1 à 10 références dans la [phase 1 de l’atelier](PHASE1-WORKSHOP.md).

Une image ordinaire reçoit les mouvements globaux de la scène (respiration, saut, réaction). Elle n'est
pas transformée en personnage articulé. Le fond n'est pas supprimé automatiquement : préférer un PNG
transparent. Les fichiers ne sont pas envoyés sur un service externe.

## Génération IA : choix confirmé, intégration manquante

Le choix utilisateur est une **IA en ligne intégrée, sans clé à saisir dans l'application**.
Cela nécessite un backend avec un fournisseur d'images/animation et un financement de ses appels.
Aucun serveur ni fournisseur n'est configuré ici. La clé du fournisseur devra rester côté serveur,
jamais dans le binaire Tauri. Aucun abonnement, achat, compte cloud ou déploiement n'a été effectué.

L’atelier actuel accepte une vue principale et des références complémentaires sans les fusionner.
Le futur flux IA devra annoncer le coût
avant génération, permettre l'annulation, montrer le résultat et produire un avatar/sprite compatible
avec l'importeur existant. Les images ne devront partir qu'après une action explicite de génération.
Les mots « génération IA » ne désignent donc pas le générateur local de personnalité actuel.

## Vérifications

`npm run typecheck`, `npm test`, `npm run desktop:frontend` et les tests `test:desktop` avec Chromium
système sont exécutables dans le cloud. La suite navigateur utilise un pont natif simulé : elle vérifie
premier accueil, création à partir d'une image, persistance après rechargement et refus de plusieurs
vues, en plus des tests précédents.

Le code Rust est vérifié pour Windows MSVC (tests et ressources embarquées). La fenêtre agrandie,
le drag-and-drop réel depuis l'Explorateur et l'exécutable restent à tester sur Windows. Le défaut
`link.exe` absent et le blocage de facturation GitHub Actions documentés dans
[le rapport du MVP](WINDOWS-MVP-VALIDATION.md) empêchaient encore la production d'un `.exe` au début
de cette évolution.

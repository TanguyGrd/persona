# Persona 0.2 — déplacements et réglages du personnage

Branche : `feat/desktop-context-and-character-tuning`, issue de la phase1 sans fusion.
Cette tranche répond aux retours sur la marche confinée à la petite scène, les répliques génériques,
les champs d’identité et les réglages souhaités sous forme de jauges.

## Changements implémentés

- La scène peut déléguer ses marches à l’hôte. Windows déplace alors la vraie fenêtre du compagnon
  dans la zone de travail de son écran, au lieu de déplacer uniquement le dessin dans la WebView.
  L’interpolation native vise un échantillonnage toutes les 16ms ; le frontend n’envoie pas les images
  de l’animation par IPC. Cela ne constitue pas une mesure de fluidité sur un PC utilisateur.
- Une option séparée autorise la géométrie des fenêtres. Après activation et enregistrement, cliquer
  sur une autre fenêtre : un bord compatible peut être choisi automatiquement après un délai. Le bouton
  **Se poser sur la dernière fenêtre** permet aussi de le demander. Le compagnon rejoint son
  bord supérieur, peut y marcher, suit les déplacements du bord et retourne au bas de la zone de
  travail si ce bord devient indisponible. Un bord trop haut ou trop étroit est refusé.
- Le positionnement repose sur le rectangle Win32/DWM, pas sur une capture d’écran : aucun titre,
  contenu de fenêtre, fichier, icône du bureau, microphone ou appel Discord n’est lu.
- Le déplacement s’interrompt lors d’une prise à la souris, d’un masquage ou de l’ouverture d’un menu.
  Les mouvements réduits désactivent les marches natives automatiques. Le déplacement manuel reste
  le déplacement système existant ; il n’ajoute pas encore de balancement ou de physique de grappin.
- L’atelier commence par les images. Le nom et l’univers sont des corrections facultatives dans
  **Aider à identifier · liens de référence**. Cinq liens HTTPS au maximum peuvent être conservés.
  Ils ne sont ni consultés ni considérés comme des sources vérifiées par ce mode instantané.
- Taille, activité et paroles utilisent des jauges. La taille visible conserve les proportions et reste bornée
  pour laisser de la place aux sauts et aux bulles dans la petite fenêtre. L’activité et les paroles ont trois niveaux réels,
  affichés avec leur libellé ; la jauge ne prétend pas fournir cent comportements distincts.
- Un profil choisi explicitement pour Terry McGinnis / Batman Beyond est proposé dans les réglages
  d’un avatar importé. Il conserve avatar, références et mémoire. Ses répliques sont locales,
  originales et prioritaires : elles ne sont plus mélangées aléatoirement aux répliques de mascotte.
  Ce choix confirmé par l’utilisateur n’est pas une reconnaissance d’image ni un profil recherché
  en ligne. Aucun asset protégé de Batman n’est ajouté au programme.
- Une personnalité inconnue reçoit un ton calme provisoire, et les remarques génériques affirmant
  une marche non exécutée ont été retirées du répertoire français/anglais.

## Limites explicites

La position sur un rebord n’est pas une pose assise articulée. Une simple image continue à bouger
comme une image entière. Le prototype utilise les fenêtres compatibles du même écran ; il ne modélise
pas l’occlusion, tous les bureaux virtuels, les jeux plein écran, les icônes ou les transports entre
plusieurs moniteurs. Il n’exécute ni grappin, toile, vol, interaction forcée avec les icônes ni pouvoir.

L’IA de reconnaissance d’image, la recherche des origines depuis Wikipédia et la conversation
personnalisée en direct ne sont pas connectées. Leur service serveur et ses accès fournisseur restent
à mettre en place, sans clé dans le client. Le logiciel affiche cette indisponibilité : le nom de fichier
n’est pas une reconnaissance visuelle et une URL conservée n’est pas une source consultée.

Discord n’est pas intégré. Rejoindre un salon et transmettre un message nécessitera un outil autorisé,
un aperçu et une confirmation avant envoi. Écouter ou retransmettre un appel nécessitera également
les permissions adaptées et l’accord explicite des participants concernés. Aucun accès de ce type
n’est effectué par cette tranche, et aucun secret de compte Discord n’est demandé.

## Validation

```powershell
npm ci
npm run typecheck
npm test
npx playwright install chromium
npm run test:desktop
npm run desktop:frontend
npm run desktop:test:native
npm run desktop:build
```

Dans le cloud Linux : `PERSONA_TEST_CHROMIUM=/usr/bin/chromium npm run test:desktop`.
Le frontend et le pont de commandes sont testés dans Chromium avec IPC simulé, pas une session
Windows native. Le code Win32 est vérifié par la compilation croisée Windows MSVC ; les tests
purs de géométrie/interpolation sont compilés avec le binaire de tests puis exécutables sur le runner
Windows. Les résultats finaux de CI et le lien d’installeur seront ajoutés après leur exécution.

Vérifier sur un PC Windows : marcher sur le bureau, interrompre au clic, ouvrir/fermer les menus,
masquer/réafficher, sélectionner une fenêtre, se poser sur son bord, la déplacer/réduire/fermer,
refuser un bord sans place et changer de DPI. Vérifier la conservation de l’avatar existant après
mise à jour et l’absence de mouvements natifs quand ils sont désactivés. Une session manuelle reste
nécessaire avant de qualifier ces mouvements d’aussi fluides que la référence utilisateur.

## Résultats locaux

- TypeScript et builds frontend Chrome/bureau : réussis.
- 119 tests unitaires : réussis, dont la marche déléguée sans déplacer l’acteur hors de sa petite
  scène, les répliques exclusives d’une personnalité choisie et la conservation des liens non vérifiés.
- 26 tests bureau : réussis (Chromium + pont simulé, contrôleur natif simulé, stockage).
- `cargo check --target x86_64-pc-windows-msvc --tests --locked --features tauri/custom-protocol` :
  réussi. Le code Win32/DWM et les tests supplémentaires sont bien vérifiés pour Windows.
- Quatre nouveaux tests Rust couvrent interpolation, géométrie de rebord/DPI et interruption, avec distinction clic court/glisser.
  Leur exécution réelle nécessite le runner Windows ; ils ne constituent pas des tests UI natifs.

Les captures ajoutées à cette livraison proviennent de Chromium, et ne montrent pas une vraie
fenêtre du bureau suivie par le compagnon. Les mouvements, la posture et les effets de pouvoirs
ne sont pas générés à partir de l’image dans ces tests.

[Atelier centré sur les images](screenshots/v02-images-first.png) ·
[Jauges de réglage](screenshots/v02-gauges.png).
Ces deux captures proviennent du frontend Chromium avec pont natif simulé.

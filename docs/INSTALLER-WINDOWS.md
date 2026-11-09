# Installer Persona sur Windows

## Bêta technique 0.4.0 — agent et service Persona

[Télécharger le ZIP de l’installeur Windows 0.4.0](https://github.com/TanguyGrd/persona/actions/runs/42704968854/artifacts/13713403919).
Connectez-vous à GitHub si demandé. Sinon ouvrez le
[build Windows réussi](https://github.com/TanguyGrd/persona/actions/runs/42704968854), puis
**Artifacts → persona-windows-unsigned**.

1. Quittez l’ancienne Persona depuis son icône près de l’horloge → **Quitter Persona**.
2. Téléchargez et décompressez le ZIP.
3. Lancez le fichier `.exe` contenu et suivez l’installation, puis ouvrez Persona.

Aucun outil de développement (Rust, Node.js, Git) n’est requis pour cette version installée.
L’installeur peut devoir télécharger WebView2 si ce composant Windows est absent.
Cette bêta n’est pas signée : Windows peut indiquer un éditeur inconnu.

## Essayer les changements

**Cette version contient le code de l’agent et de son serveur, mais aucun fournisseur IA
hébergé/financé n’est activé par défaut.** Installer l’EXE seul ne suffit pas à activer la
conversation IA. Les [instructions du service](AGENT-SERVICE.md) concernent l’opérateur
Persona ; aucune clé de fournisseur n’est demandée dans l’interface du compagnon.

- Le **Journal des actions** distingue demande, résultat confirmé et résultat inconnu.
- **Arrêter** ou Échap interrompt l’agent et la lecture vocale. L’essai d’Échap depuis
  une autre application reste à valider sous Windows.
- Essayez aussi **Ouvre Discord**, **Ouvre la calculatrice**, **Ouvre le bloc-notes** ou
  **Fais-moi un coucou** sans service connecté. L’ouverture des applications est implémentée
  et compilée, mais reste à vérifier interactivement sur un PC Windows. Aucun appel vocal
  ni message n’est envoyé par la commande Discord.
- **Lire les réponses** utilise facultativement une voix système. L’API est intégrée,
  les tests simulent le son ; une écoute réelle sous Windows reste à effectuer.

- Cliquez brièvement sur le personnage : une bulle avec champ de saisie apparaît.
  Entrée envoie ; Échap ou × ferme. Un glissement déclenche le déplacement natif.
- Écrivez **Mets la vidéo en pause** ou utilisez le bouton ⏸. La commande passe par le média
  sélectionné par Windows. La réponse distingue un succès confirmé, un refus, l’absence
  de lecteur et une demande non confirmée. **Essai sur un vrai lecteur Windows encore à faire.**
- Sans service configuré, la bulle affiche **IA non connectée**. Avec un service raccordé,
  elle utilise le profil du personnage et ses outils. Les vocaux Discord restent indisponibles.
- Pour une animation déjà préparée, ouvrez **Mes compagnons · Créer → J’ai déjà une animation
  ou un pack Persona**, puis importez ensemble la planche PNG/WebP et son JSON, ou un pack seul.
  Un cycle de plusieurs poses `walk` est nécessaire pour articuler la marche.
- Une image avec décor reste rectangulaire. Utilisez un personnage détouré et recadré,
  en PNG/WebP avec transparence. Convertir une photo opaque en PNG ne suffit pas.

- L’atelier commence par les images, sans identité obligatoire. La section **Aider à identifier**
  permet de conserver des liens de référence. Ils ne sont pas encore consultés par une IA.
- Les réglages de taille, d’activité et de paroles sont des jauges.
- La marche autonome peut déplacer la vraie fenêtre du compagnon sur son écran.
- Pour les rebords : activez **Utiliser les bords des fenêtres** et enregistrez. Cliquez ensuite sur
  une fenêtre non maximisée avec suffisamment de place au-dessus. Un bord compatible peut être
  choisi automatiquement ; le bouton **Se poser** permet aussi de le demander. Les fenêtres trop
  hautes ou trop étroites ne conviennent pas. Seules leurs positions et tailles sont utilisées.
- Pour l’essai Terry McGinnis confirmé dans la conversation : choisissez votre avatar importé dans
  les réglages, puis **Profil de répliques → Terry McGinnis → Enregistrer**. Ce profil local manuel
  conserve l’avatar et ses références. Ce n’est pas une identification par l’image.

Les déplacements/rebords sont un prototype à vérifier visuellement sur un PC Windows. Une image
simple n’obtient pas une vraie pose assise ou des jambes articulées. La reconnaissance visuelle IA,
la recherche depuis les liens, le rigging, les grappins/toiles, les interactions avec les icônes et les
appels Discord ne sont pas connectés. Sans service raccordé, les dialogues restent locaux. Aucun appel payant n’a été effectué dans cette validation.

## Provenance et validation

- Code : `de4a92f` de `feat/desktop-connected-agent`, version 0.4.0.
- [Workflow Windows réussi](https://github.com/TanguyGrd/persona/actions/runs/42704968854) : tests
  du frontend/stockage/contrôleur, tests Rust, compilation optimisée, NSIS, dépôt de l’artefact.
- [Workflow Chrome/Linux réussi](https://github.com/TanguyGrd/persona/actions/runs/42704968566) :
  typage, tests unitaires, suite Chrome E2E et vérification du ZIP dans Chromium.
- Tests : 127 unitaires, 40 bureau, 7 serveur HTTP, 12 Rust, suite Chrome E2E de 15 tests. Le pont bureau des tests
  Chromium est simulé ; ce n’est pas une validation interactive native de Windows.
- Artefact : 2,34 MB, SHA256 publié par GitHub :
  `5aa3fd4e06e4154fbd677ff31b02e2ab2013cdafd0b66403ac4ae6895786d79f`.

Aucune release publique ni fusion n’a été effectuée : ce ZIP est un artefact de CI soumis à la durée
de conservation GitHub. [Guide, commandes et limites de 0.4](AGENT-SERVICE.md).
La [bêta 0.3 précédente](https://github.com/TanguyGrd/persona/actions/runs/42690431986) reste disponible avec [son guide](DESKTOP-CHAT-V03.md).
La [bêta 0.2 précédente](https://github.com/TanguyGrd/persona/actions/runs/42529343181) et
[ses limites](DESKTOP-CONTEXT-V02.md) restent documentées.
La [première version 0.1](https://github.com/TanguyGrd/persona/actions/runs/42518500894) reste historique.

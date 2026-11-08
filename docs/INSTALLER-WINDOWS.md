# Installer Persona sur Windows

## Version de test du 8 novembre 2026

[Télécharger le ZIP de l’installeur Windows](https://github.com/TanguyGrd/persona/actions/runs/42518500894/artifacts/13632861371).
Connectez-vous à GitHub si le téléchargement le demande. Si le lien direct ne s’ouvre pas,
[ouvrez le build réussi](https://github.com/TanguyGrd/persona/actions/runs/42518500894), puis cliquez
sur **persona-windows-unsigned** dans **Artifacts**, en bas de page.

1. Téléchargez le ZIP et décompressez-le.
2. Ouvrez le fichier `.exe` qu’il contient et suivez l’installation.
3. Lancez Persona : l’atelier permet d’essayer Pip ou d’importer vos images.

**Aucun outil de développement (Rust, Node.js, Git) n’est requis pour cette version installée.**
L’installeur peut devoir télécharger WebView2 si ce composant Windows est absent.

Cette version de test n’est pas signée : Windows peut indiquer un éditeur inconnu.
Son build et ses tests automatisés ont réussi ; l’affichage et les interactions sur un PC Windows
réel restent à vérifier avec les retours utilisateurs. La génération IA et le rigging ne sont pas encore
connectés : les références sont conservées et l’avatar principal utilise le mode instantané local.

## Provenance et validation

- Code : commit `a2ed257` de `feat/character-workshop-phase1`.
- [Build Windows réussi](https://github.com/TanguyGrd/persona/actions/runs/42518500894) : tests du
  frontend et du stockage, tests Rust natifs, compilation optimisée, packaging NSIS et dépôt de l’artefact.
- [CI Chrome/Linux réussie](https://github.com/TanguyGrd/persona/actions/runs/42518500958) : typage,
  tests unitaires, suite Chrome E2E et vérification complète du ZIP dans Chromium.
- Tests locaux après correction : 107 tests unitaires et 20 tests bureau réussis.
- ZIP d’artefact : `persona-windows-unsigned`, 1,96 MB ; SHA256 publié par GitHub :
  `93275a44589c5562100daade2e06b70cb4a9e78ed3849b69aff5ac67fa8bb8aa`.

Le blocage de facturation constaté auparavant n’empêche plus les jobs de démarrer.
La première relance a révélé un défaut réel de fin de trajectoire : il a été corrigé et deux tests
reproduisant la fin d’un mouvement entre deux images ont été ajoutés. Les tests Chrome concernés
et la vérification du paquet ont ensuite réussi.

Aucune release publique ni fusion n’a été effectuée : ce téléchargement est un artefact de CI,
qui reste soumis à la durée de conservation de GitHub Actions.

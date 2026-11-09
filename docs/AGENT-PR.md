# Brouillon de Pull Request — agent Persona 0.4

Branche : `feat/desktop-connected-agent`. Base proposée : `feat/desktop-chat-and-media`.
Code vérifié : `de4a92f`. Aucune fusion ni release publique.

[Ouvrir la comparaison pour créer la PR](https://github.com/TanguyGrd/persona/compare/feat/desktop-chat-and-media...feat/desktop-connected-agent?expand=1).

La création automatique avec `gh pr create --draft` a échoué : `api.github.com/graphql`
est refusé par le proxy réseau (CONNECT 403). L’accès Git HTTPS fonctionne et la branche
a été poussée. Le domaine API est déjà proposé dans le brouillon d’environnement, mais
la politique appliquée ne l’autorise pas encore. Il n’est pas nécessaire de demander
un nouveau jeton GitHub sans avoir d’abord appliqué et vérifié ce changement d’accès.

## Titre

Connect Persona desktop chat to an authenticated agent service

## Description prête à reprendre

La bulle Windows de Persona n’avait qu’un sélecteur de commandes locales. Cette branche
la relie à un serveur IA compatible Chat Completions qui garde la clé du fournisseur côté
serveur. La demande passe par un cycle modèle → outils validés → observations → réponse,
avec contexte du personnage, historique court, journal et arrêt.

Le client utilise une connexion d’appareil stockée dans le coffre Windows. Les outils
couvrent un salut dans la scène existante, la pause/reprise du média Windows, trois
applications autorisées et l’ouverture de pages/recherches dans une fenêtre Persona
distincte. Les pages distantes sont exclues des commandes applicatives. La lecture des
réponses par voix système est optionnelle. Les zones vides autour de la bulle laissent
passer les clics ; un déplacement avec la bulle ouverte actualise la position restaurée.

Le fournisseur et l’hébergement ne sont pas activés : aucun appel IA payant ni déploiement
n’a été lancé. Les vocaux Discord, l’automatisation DOM et la préparation automatique des
images ne sont pas implémentés. Le tableau de suivi dans `docs/AGENT-SERVICE.md` décrit
les fonctions de Capri adaptées et celles restantes. Deux utilitaires textuels vocaux
proviennent de Capri Companion sous MIT, avec notice embarquée ; aucun asset ou code de
Capri Desktop non commercial n’est repris.

Validation : typage, 127 tests unitaires, 40 tests bureau, 7 tests du serveur HTTP,
12 tests Rust et 15 tests Chrome E2E. Les workflows
[Windows](https://github.com/TanguyGrd/persona/actions/runs/42704968854) et
[Chrome/Linux](https://github.com/TanguyGrd/persona/actions/runs/42704968566) ont réussi,
y compris l’installeur NSIS, le paquet serveur et la vérification du ZIP Chrome.

Les tests bureau simulent l’IPC Windows et la voix ; les tests HTTP utilisent un
fournisseur IA simulé. Un démarrage séparé du serveur compilé a vérifié le raccordement
et la révocation d’appareil sans fournisseur. La [démo](demos/v04-agent-frontend.webm)
indique explicitement les simulations. Les essais interactifs natifs et un appel d’un
modèle réellement financé restent à effectuer.

# Persona 0.4 — agent connecté et adaptation du concept Capri

Branche : `feat/desktop-connected-agent`, issue de la bêta 0.3. Aucun déploiement public,
paiement, abonnement ni appel réel à un fournisseur IA n’a été effectué.

## Ce que cette tranche ajoute

La bulle sait maintenant utiliser un service IA au lieu de se limiter au sélecteur local
de commandes. Le service conserve la clé du fournisseur ; le compagnon Windows reçoit
seulement une connexion d’appareil, stockée dans le coffre d’identifiants Windows.

Le cycle est : demande → modèle → outils validés → résultat observé → réponse du modèle.
Le profil actif (nom, univers déclaré, biographie, langue, ton, traits) fournit le contexte
du personnage. Il n’y a pas de reconnaissance par image dans cette tranche.

Outils disponibles :

| Outil | Opération et observation |
|---|---|
| `companion_wave` | Déclenche un salut dans la scène existante. Respecte le masquage du compagnon. Une image fixe ne gagne pas de bras articulés. |
| `media_pause` / `media_play` | Pause/reprise via le média sélectionné par Windows. Distingue l’état confirmé, déjà atteint, absent, refusé et non confirmé. |
| `open_application` | Calculatrice, bloc-notes ou application Discord installée. Rapporte une demande d’ouverture acceptée, pas une présence vérifiée à l’écran. |
| `open_page` | Navigation HTTPS dans une fenêtre WebView2 Persona distincte, avec répertoire de données séparé. Le chargement du site et son contenu ne sont pas vérifiés. |
| `search_web` | Ouvre une page de recherche Google dans cette fenêtre. Ne lit pas les résultats et ne prétend pas les avoir vérifiés. |

Les outils n’offrent ni shell, ni chemin exécutable libre, ni lecture/clic/saisie de page,
ni achat, ni message à autrui, ni entrée de mots de passe, ni capture d’écran ou d’audio.
Les commandes sensibles demandées dans la vision produit restent donc à implémenter avec
leurs confirmations ; elles ne sont pas simulées.

Le journal montre les actions demandées et leurs résultats séparément de la réponse IA.
Les zones vides de la fenêtre de discussion utilisent les rectangles interactifs pour
laisser passer les clics. Un déplacement natif pendant que la bulle est ouverte met à jour
la position à restaurer quand elle se referme ; sa géométrie est testée, son usage Windows
reste dans la liste des essais manuels.
Le bouton **Arrêter** annule le prochain travail et la requête modèle en cours ; il ne
défait pas une action terminée. **Échap** est aussi observé par le code Windows même quand
une autre application a le focus, sans intercepter cette touche pour les autres applications.
Le test du signal d’arrêt couvre le frontend ; cette observation globale reste à essayer
manuellement sous Windows.

La boucle est limitée à quatre réponses du modèle et six outils par demande. Tout lot
d’outils est validé avant sa première exécution. Un outil inconnu ou des arguments hors
schéma font échouer le lot. Les effets déjà observés et les résultats incertains restent
dans le contexte après un arrêt. L’historique garde quatre tours complets **en mémoire**,
par session du personnage ; il n’est pas encore conservé après redémarrage.

La lecture des réponses utilise facultativement une voix système via Web Speech. Elle
est désactivée par défaut, ne lit pas le microphone et ne route pas sa sortie vers Discord.
L’animation de la bouche suit les événements de parole quand le dessin le permet.
Le support sonore effectif dépend des voix exposées par WebView2 sur le PC et reste à
vérifier sur un poste Windows. Les tests emploient une voix simulée.

## Statut réel de l’IA

**Le serveur, le relais Windows et la boucle d’outils sont implémentés. Aucun service IA
hébergé ni fournisseur financé n’est connecté à l’EXE fourni par défaut.** L’environnement
de développement ne possède aucune clé de fournisseur ni hébergement autorisé.

Le statut « Service configuré » indique qu’un opérateur a configuré le fournisseur, pas
que ses identifiants ont déjà réussi un appel. Une erreur fournisseur est affichée sans
exécuter de commande locale de remplacement ou effectuer de nouvelle tentative payante.

Sans service connecté, les commandes exactes **Mets la vidéo en pause**, **Ouvre Discord**,
**Ouvre la calculatrice**, **Ouvre le bloc-notes** et **Fais-moi un coucou** restent utilisables
par le chemin local. Ouvrir Discord ne rejoint aucun appel et n’envoie aucun message.

## Adaptation du concept et périmètre restant

| Concept de Capri | Persona actuel | Travail restant |
|---|---|---|
| Compagnon présent sur le bureau | Pip, avatars existants, fenêtre transparente, déplacements et bords de fenêtres repris | Validation visuelle Windows/DPI ; interactions avec les icônes et pouvoirs |
| Parler au personnage | Bulle, contexte du profil, historique court, serveur IA et boucle d’outils | Activer un fournisseur et un hébergement autorisés ; tester les réponses d’un vrai modèle |
| Actions sur le PC | Registre fermé, résultats séparés, limites et interruption | Automatisation des applications et pages, confirmations des actions sensibles |
| Son propre navigateur | Fenêtre de navigation avec données séparées ; pages distantes privées d’accès aux commandes Persona | Observation des pages et outils DOM contrôlés ; ce n’est pas un bac à sable système |
| Voix | Lecture système optionnelle et interruption | Validation sonore Windows, microphone, transcription, mot d’éveil, conversation vocale |
| Appels Discord | Ouverture de l’application | Rejoindre un vocal, parler, capter et retransmettre une réponse : non implémentés |
| Animation du personnage | SVG articulé Pip et cycles importés, dont marche | Détourage, rigging et poses automatiques à partir des images ; mouvements réalistes de Terry |
| Personnalité et mémoire | Profil actif transmis, dialogues locaux existants, quatre tours de session | Identification visuelle, recherche sourcée, mémoire durable et synchronisation Windows/Chrome |
| Coût du service | Quota de requêtes par appareil, réservation avant appel, consommation en tokens si le fournisseur la rapporte | Budget monétaire, tarification, facturation et paiements : hors de cette tranche |

Cette tranche ne constitue donc pas une reproduction à 100 % de Capri. Elle remplace
une partie manquante concrète — l’agent et son service — et donne une base vérifiable aux
étapes suivantes. Les autres lignes restent explicitement incomplètes.

## Sources, licences et réutilisation

Références inspectées le 9 novembre 2026 :

- [Capri Desktop](https://github.com/lachydotmcg/capri-desktop), commit
  `b8401512124ec5c7d84c11cc92da9341755b9455` : README, licence, organisation des composants
  `Brain`, `Agent` et appels. Licence PolyForm Noncommercial : aucun code ni asset copié.
- [Capri Companion](https://github.com/TheAgencyMGE/capri-companion), commit
  `c094ec1e74941c075cf0a2ce5ab340a58a3c6344` : architecture conversation/outils/voix étudiée.
  Ses utilitaires `SentenceChunker` et `speakable` sont adaptés sous MIT ; la notice complète
  est dans [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md), également embarquée par Tauri.
  Aucun dessin, modèle, voix ni personnalité Capri n’est repris.

## Démarrage du serveur — développement/opérateur

Ces instructions concernent l’opérateur Persona. L’utilisateur du compagnon n’a pas de
clé de fournisseur à saisir. Node.js 22+ est nécessaire pour le serveur et le développement,
pas pour utiliser l’EXE Windows installé.

```bash
npm ci
npm run agent:build
npm run agent:serve
```

Sans configuration, le serveur écoute uniquement sur `127.0.0.1:4318`. `GET /health`
répond `{"configured":false}` et les appels modèle sont refusés. Un code de connexion à
usage unique, valable dix minutes, est écrit dans `.persona-service/pairing-code.txt`.
Le répertoire est ignoré par Git. Le service ne lance aucun appel IA au démarrage.

Pour un fournisseur réellement autorisé, renseigner **côté serveur**, via les secrets de
l’hébergeur ou un fichier privé chargé avec `node --env-file=...` :

| Variable | Rôle |
|---|---|
| `PERSONA_PROVIDER_URL` | Base Chat Completions compatible OpenAI, par défaut `https://api.openai.com/v1` |
| `PERSONA_MODEL` | Modèle compatible avec les outils structurés et `max_tokens`, choisi par l’opérateur |
| `PERSONA_API_KEY` | Clé privée du fournisseur, jamais dans l’application cliente ni le dépôt |
| `PERSONA_SERVICE_DATA` | Répertoire persistant du registre d’appareils et quotas |
| `PERSONA_DEVICE_DAILY_LIMIT` | Requêtes modèle par appareil et par jour UTC, 30 par défaut |
| `PERSONA_PAIRING_CODE` | Facultatif : code opérateur de 12 à 80 caractères, une seule connexion ; sinon généré |
| `PERSONA_SERVICE_HOST`, `PORT` | Interface et port du serveur ; boucle locale/4318 par défaut |

Les URL de fournisseur doivent utiliser HTTPS. HTTP sans clé n’est accepté qu’en boucle
locale pour un serveur de modèle compatible ou les tests. Les redirections sont refusées
pour ne pas transférer les identifiants. Les paramètres proxy et certificats hérités sont
respectés via Undici. Les réponses sont bornées à 128 ko, les requêtes à 64 ko et 48 messages,
avec un délai fournisseur de 25 secondes et 800 tokens de sortie maximum par appel.

Chaque appel réserve le quota **avant** de contacter le fournisseur, y compris si cet appel
est ensuite interrompu : une annulation peut malgré tout être facturée par le fournisseur.
Le quota compte des appels, pas des euros, des crédits achetés ou des tâches complètes.
Aucune tarification ni garantie de plafond monétaire n’est inventée.

Avant toute mise en ligne, il reste à choisir et autoriser l’hébergement, le modèle et
son budget, configurer HTTPS et les secrets, et vérifier un appel réel. Le mécanisme
d’inscription actuel est un raccordement pilote par code opérateur, pas une gestion de
comptes grand public. Aucun déploiement n’est déclenché par les workflows du dépôt.

## Raccorder le client Windows — développement/opérateur

Pour le développement local, démarrer le serveur puis lancer dans un autre terminal Windows :

```powershell
$env:PERSONA_SERVICE_URL = 'http://127.0.0.1:4318'
npm run desktop:dev
```

Pour un EXE distribué, renseigner l’URL HTTPS autorisée dans la variable GitHub Actions
**`PERSONA_SERVICE_URL`** avant son build. Elle est incorporée à la compilation Windows.
Ce n’est pas une clé. Ne jamais y mettre `PERSONA_API_KEY`. Une valeur vide conserve le
mode local. Pour un raccordement pilote sans recompilation, l’opérateur peut aussi fournir
`agent-service.json` contenant uniquement `{"url":"https://…"}` dans le dossier de
configuration Tauri de l’application (`%APPDATA%\com.persona.companion` habituellement).

Dans la bulle : **Connexion Persona → code fourni par Persona → Connecter cet appareil**.
Le code n’est pas une clé du fournisseur. Le client stocke uniquement son jeton d’appareil
dans le coffre Windows. Le serveur ne conserve que son empreinte. Le bouton **Déconnecter**
supprime l’identifiant local et tente de révoquer la connexion côté serveur ; si le serveur
est injoignable, la suppression locale réussit mais la révocation distante reste à vérifier.

La fenêtre distante `agent-browser` n’a pas de capacité IPC. Un contrôle global du
dispatch rejette en plus toutes les commandes applicatives venant d’une autre fenêtre
ou d’une origine distante, y compris les commandes antérieures à l’agent. La CSP du
compagnon reste limitée à ses fichiers locaux et à l’IPC.

## Vérification et démonstration

```bash
npm run typecheck
npm test
npm run test:service
npx playwright install chromium
npm run test:desktop
npm run agent:build
npm run desktop:frontend
npm run pack
npm run test:e2e
npm run verify:package
```

Sous Windows avec les [prérequis Tauri](WINDOWS.md) : `npm run desktop:test:native`, puis
`npm run desktop:build`. L’installeur est dans `src-tauri/target/release/bundle/nsis/`.
Le serveur compilé est dans `dist/agent-service/` ; il reste séparé de l’EXE.

Les tests serveur utilisent de vrais échanges HTTP sur la boucle locale avec un
**fournisseur modèle simulé**. Ils couvrent le cycle complet, les observations d’outils,
l’authentification, la révocation, le quota persistant, l’arrêt, les délais et les erreurs.
Les tests bureau utilisent Chromium avec IPC Windows et fournisseur simulés ; la scène,
les contrôles et l’animation de salut sont réellement exécutés dans le navigateur.
La voix est simulée. Aucune de ces vérifications ne démontre une réponse d’un modèle
financé, un appel vocal Discord ou le contrôle d’un vrai lecteur Windows.

Une vérification séparée du serveur compilé a exercé `/health`, le raccordement à usage
unique, le statut non configuré et la révocation, sans appel de fournisseur.

Essais natifs restant : installation de 0.4, clics à travers les zones vides avec la
bulle ouverte, médias réels en lecture/pause, applications installées/absentes, navigation
et séparation des données WebView2, coffre Windows et code de connexion, Échap pendant
une tâche depuis une autre application, son réel et arrêt de la voix.

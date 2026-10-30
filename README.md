# Persona — compagnon animé

Un petit compagnon virtuel, vivant et personnalisable, qui apparaît sur vos pages web, vous salue et vit
sa vie en bas de la fenêtre. **Gratuit, sans compte, sans abonnement, sans clé API** : les animations et les
répliques tournent entièrement sur votre appareil.

<p>
  <img src="docs/screenshot-greeting.png" alt="Pip salue l’utilisateur dans une bulle, en bas à droite d’une page web" width="380">
  <img src="docs/screenshot-dragging.png" alt="Pip traîné à la souris au milieu de la page, bras qui gigotent" width="300">
</p>

MVP actuel : **extension Chrome (Manifest V3)**. Hôte Windows (au-dessus de toutes les fenêtres) prévu
ensuite, sur la même base.

## Ce que fait le compagnon

- **Entrée en scène** : il sort de derrière le bord de la fenêtre, arrive en sautant ou apparaît dans des étincelles.
- **Salutation** dans une bulle, selon sa **personnalité** (ton), sa **langue** (fr, en, es, de), **l'heure**
  (matin, après-midi, soir, nuit) et le week-end. S'il vous a vu il y a peu, il dit juste « re-coucou » (ou rien
  si vous ouvrez plusieurs pages d'affilée).
- **Il vit sa vie** : respire, cligne des yeux, suit le curseur du regard, regarde autour de lui, fait coucou,
  se promène, saute, fait des remarques, s'endort quand vous ne faites rien et se réveille à votre retour.
  Un personnage énergique bouge plus, un personnage bavard parle plus.
- **Réactions** : cliquez dessus (gigote, saute, tourne sur lui-même, rougit) ; cliquez trop et la tête lui tourne.
- **Déplacer** : glissez-le, il pendouille puis retombe en bas de la fenêtre. Sa position est mémorisée.
  Au clavier : Tab pour le sélectionner, flèches pour le déplacer, Entrée pour interagir.
- **Masquer** : bouton « – » au survol, ou `Alt + Maj + P`. Une petite pastille permet de le faire revenir.
- **Désactiver** : partout ou sur un site, depuis l'icône Persona de la barre d'outils.
- **Personnages** : créer un profil à partir d'une description, importer un avatar, exporter / importer des packs.

## Installer (développement)

Prérequis : Node.js 20+ et Chrome 116+ (ou Edge, Brave…).

```bash
npm install
```

```bash
npm run build
```

Puis dans Chrome : `chrome://extensions` → **Mode développeur** → **Charger l'extension non empaquetée** →
dossier `dist/extension`. Une page de bienvenue s'ouvre et Pip y apparaît ; il est aussi injecté dans les
onglets http/https déjà ouverts.

Instructions détaillées pour Windows (PowerShell, Edge, zip, tests) : [`docs/WINDOWS.md`](docs/WINDOWS.md).

| Commande | Rôle |
|---|---|
| `npm run build` | Compile l'extension (`dist/extension`) et le bac à sable web (`dist/playground`). |
| `npm run watch` | Recompile à chaque modification. |
| `npm run typecheck` | Vérifie les types TypeScript. |
| `npm test` | Tests unitaires (Vitest). |
| `npm run test:e2e` | Tests de bout en bout dans un vrai Chromium avec l'extension chargée (Playwright). Captures dans `test-results/`. |
| `npm run pack` | Zip prêt à distribuer dans `release/`. |
| `npm run icons` | Régénère les icônes à partir du SVG de Pip. |

Les tests e2e ont besoin du Chromium de Playwright : `npx playwright install chromium` (une fois).

## Personnages

Le personnage de démonstration **Pip** est un esprit-pousse original créé pour ce projet
(`characters/pip/`). Dans **Personnages et réglages** (icône Persona → lien en bas) :

- **Créer** : nom + description → profil déduit localement (ton, traits, langue), avec un **niveau de
  confiance et la liste des incertitudes** (aucune recherche en ligne effectuée, langue devinée, ton non
  identifié…). Corrigez à la main, testez une phrase, enregistrez. Le résultat est mis en cache.
- **Importer** : PNG, JPEG, WebP, GIF (animés joués), SVG (articulé ou non), sprite sheet + JSON (grille
  Persona, Aseprite, TexturePacker), pack `.persona.json`. Détails : [`docs/AVATAR-FORMATS.md`](docs/AVATAR-FORMATS.md).
- **Éditer** : nom, langue, ton, énergie / sociabilité / espièglerie, entrée en scène, phrases personnalisées
  par situation et par moment de la journée (`{user}`, `{,user}`, `{day}`, `{time}`, `{site}`).

## Architecture

Le moteur n'est lié à aucun personnage ni à Chrome :

| Brique | Dossier |
|---|---|
| Character Profile (identité, langue, traits, répliques) | `src/core/profile` |
| Animation Engine (comportement, déterministe) | `src/core/animation` |
| Avatar Assets (formats, import, sécurité SVG) | `src/core/avatar` |
| Chrome Host (content script, popup, options, service worker) | `src/hosts/chrome` |
| Windows Host (à venir) | `src/hosts/windows`, [`docs/WINDOWS.md`](docs/WINDOWS.md) |
| Agent Interface (contrat des futures tâches IA, inactif) | `src/core/agent` |
| Scène web partagée par les hôtes | `src/stage` |

Plus de détails : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Vie privée et permissions

- Tout est stocké dans `chrome.storage.local` ; rien n'est envoyé sur le réseau.
- `host_permissions` http/https : afficher le compagnon dans les pages et l'injecter dans les onglets déjà
  ouverts à l'installation. Le compagnon ne lit pas le contenu des pages (seul le nom du site peut apparaître
  dans une réplique).
- Fonctionne aussi sur les sites à politique de sécurité stricte (CSP) : styles via feuilles construites dans
  un shadow root, images décodées localement sur un canvas.
- Pages non couvertes : pages internes du navigateur, Chrome Web Store, PDF, `file://`.

## Références et licences

Les projets [capri-desktop](https://github.com/lachydotmcg/capri-desktop) (PolyForm Noncommercial) et
[capri-companion](https://github.com/TheAgencyMGE/capri-companion) (code MIT, modèle de personnage dérivé d'une
œuvre protégée) ont été audités : **aucun code ni asset n'en est repris**. Voir
[`docs/AUDIT-REFERENCES.md`](docs/AUDIT-REFERENCES.md).

Aucune licence n'est encore choisie pour ce dépôt : tous droits réservés tant que ce n'est pas décidé.

## Feuille de route

Free : compagnon et animations (ce MVP). Ensuite : hôte Windows ; Pay As You Go : tâches d'agent IA et
profils enrichis par IA ; Premium : voix, IA locale, personnalisation avancée. Aucun paiement n'est
implémenté — les paliers sont seulement étiquetés dans `src/core/agent/agent.ts`.

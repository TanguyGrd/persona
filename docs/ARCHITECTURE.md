# Architecture

```
characters/            Données des personnages intégrés (Pip). Aucun code moteur.
src/core/              Cœur indépendant de toute plateforme (TypeScript pur)
  profile/             Character Profile : identité, langue, ton, traits, phrases
  animation/           Animation Engine : machine à états du comportement (Brain)
  avatar/              Avatar Assets : formats, import, sanitation SVG, sprite sheets
  settings/            Réglages + Repository (persistance via un KeyValueStore abstrait)
  agent/               Agent Interface : contrat pour les futures tâches IA (rien d'actif)
  host.ts              Contrat d'un hôte (Chrome, Windows)
src/stage/             Scène web : rendu DOM, bulles, glisser-déposer, clavier
src/hosts/chrome/      Chrome Host : manifest MV3, content script, service worker, popup, options
src/hosts/playground/  Hôte web minimal (localStorage) — démo et base du futur hôte Windows
src/hosts/windows/     Windows Host : plan et contrat (pas encore implémenté)
```

## Les six briques

| Brique | Où | Rôle | Dépend de |
|---|---|---|---|
| **Character Profile** | `src/core/profile` | Qui est le personnage : nom, bio, langue, ton, traits (énergie, sociabilité, espièglerie), phrases perso, entrée en scène, méta (source, confiance, incertitudes, crédits). Choix des répliques par règles locales. | rien |
| **Animation Engine** | `src/core/animation/brain.ts` | Ce que fait le personnage et combien de temps : entrée, repos, regard, coucou, marche, saut, parole, réactions aux clics, traîné, chute, sommeil, sortie. Déterministe (RNG injecté), piloté par les traits du profil. | traits du profil |
| **Avatar Assets** | `src/core/avatar` | À quoi il ressemble : SVG articulé (`data-part`), SVG simple, image (PNG/JPEG/WebP/GIF animé), sprite sheet (grille Persona, Aseprite, TexturePacker), pack `.persona.json`. | rien |
| **Chrome Host** | `src/hosts/chrome` | Affichage dans les pages, stockage `chrome.storage.local`, popup, options, raccourci clavier. | core + stage |
| **Windows Host** | `src/hosts/windows` (à venir) | Fenêtre transparente au-dessus des applications. Réutilise `core` + `stage`. | core + stage |
| **Agent Interface** | `src/core/agent/agent.ts` | Contrat `AgentProvider` (tâches, évènements, palier free/payg/premium). `NO_AGENT` par défaut. | rien |

Règles de dépendance : `core` n'importe jamais `stage` ni `hosts` ; `stage` n'importe jamais `chrome.*` ;
le moteur ne connaît aucun personnage par son nom (Pip est une donnée comme une autre).

## Cycle de vie dans une page

1. `content.ts` vérifie que la page est compatible (document HTML de premier niveau en http/https), que le
   compagnon est activé et que le site n'est pas exclu.
2. Il charge réglages, personnage actif (profil + avatar) et mémoire de parole, puis crée un `Companion`.
3. `Companion` crée un élément `<persona-companion>` avec un shadow root (styles isolés, feuille construite
   compatible avec les CSP strictes), monte la vue d'avatar adaptée et demande au `Brain` une entrée en scène.
4. À chaque directive (`activity`, `durationMs`, `mood`, `say`…), la scène joue le trajet (arcs de saut,
   marche, chute), positionne la bulle et planifie la suivante. Les clics, glisser-déposer, clavier et
   l'inactivité de l'utilisateur sont transmis au `Brain`.
5. Les changements de stockage (réglages, personnage, masquage) sont appliqués à chaud dans tous les onglets.

## Répliques gratuites

`composeLine()` choisit une ligne selon : situation (salutation, clic, trop de clics, remarque, réveil,
lâcher, au revoir, retour), **langue** (fr, en, es, de), **ton** (enjoué, calme, espiègle, timide, ronchon),
**créneau horaire** (matin, après-midi, soir, nuit) et week-end. Les phrases du profil passent en priorité,
les répétitions récentes sont évitées, les variables (`{user}`, `{,user}`, `{day}`, `{time}`, `{site}`)
sont remplies localement. `planGreeting()` évite de saluer en boucle quand on ouvre plusieurs pages.

## Profils générés

`LocalProfileGenerator` déduit ton, traits et langue d'une description (lexique fr/en/es/de), calcule une
confiance et liste les **incertitudes** (aucune recherche en ligne, langue devinée, ton non identifié…).
L'éditeur les affiche et invite à corriger. `CachedProfileGenerator` met le résultat en cache : un futur
générateur IA payant (même interface `ProfileGenerator`) ne sera appelé qu'une fois par personnage.

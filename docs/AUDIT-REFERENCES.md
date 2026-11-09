# Audit des projets de référence

Mise à jour du 9 novembre 2026 : l’agent de la branche `feat/desktop-connected-agent`
réutilise désormais les seuls utilitaires textuels `SentenceChunker` et `speakable`
de Capri Companion sous MIT, avec notice embarquée. Aucun asset ni code de Capri Desktop
non commercial n’est repris. Le détail historique ci-dessous décrit l’état du 30 octobre ;
voir [l’audit et le périmètre de 0.4](AGENT-SERVICE.md#sources-licences-et-réutilisation).

Date de l’audit : 30 octobre 2026. Dépôts clonés en lecture seule, hors de ce dépôt.

## 1. `lachydotmcg/capri-desktop`

| Élément | Constat |
|---|---|
| Licence | **PolyForm Noncommercial 1.0.0** (`LICENSE.md`) + « Required Notice » d’attribution. |
| Code | C# / .NET (WPF), application Windows. Usage commercial **interdit**. |
| Assets | Sprites PNG (`assets/sprites/*`), voix `.wav`, images README : art du personnage par un·e artiste anonyme, couverts par la même licence non commerciale. Le personnage Capri vient de *Cyberpunk: Edgerunners* (© CD PROJEKT RED / Studio Trigger / Netflix) — projet de fan non officiel. |
| Police | Share Tech Mono (OFL) — seule pièce réutilisable, et nous n’en avons pas besoin. |

**Décision : rien n’est repris** — ni code, ni sprites, ni sons, ni textes. Le projet a servi uniquement de
référence fonctionnelle : un compagnon qui s’installe sur les fenêtres, cligne des yeux, parle dans une bulle,
se laisse attraper et « gigote » quand on le traîne, s’endort quand on ne fait rien.

## 2. `TheAgencyMGE/capri-companion`

| Élément | Constat |
|---|---|
| Licence du code | **MIT** (`LICENSE`), mais la licence précise qu’elle ne couvre **que le code source**. |
| Modèle du personnage | `assets/capri/model.json` est **tracé à partir d’images d’Edgerunners 2** (voir `assets/capri/SOURCES.md`) : œuvre dérivée d’une propriété de CD PROJEKT / Trigger / Netflix, explicitement « non-commercial fan project ». **Inutilisable** commercialement. |
| Code | Electron + TypeScript : machine à états de comportement, gestion des fenêtres Win32 (koffi), IA (Gemini / Claude), voix. Fortement couplé à Capri (noms, poses, persona). |
| Dépendances | electron, koffi, zod, @google/genai — toutes sous licences permissives, mais nous n’en avons pas besoin pour l’extension. |

**Décision : aucune ligne de code copiée.** Le code MIT aurait pu être réutilisé avec sa notice, mais il est
couplé au personnage, à Electron et à des fournisseurs d’IA. Nous avons préféré un moteur neuf, plus petit et
indépendant de tout personnage. Idées générales retenues (non protégeables) : machine à états
« idle → action → idle » déterministe avec une source aléatoire injectée, comportement plus calme pendant
les heures de silence, réplique hors-ligne quand aucun modèle n’est branché.

## 3. Ce que livre Persona

- Code : 100 % original, écrit pour ce dépôt.
- Personnage de démo **Pip** (`characters/pip/`) : dessin SVG et textes originaux, utilisables commercialement par le projet.
- Icônes : rendues à partir du SVG de Pip (`npm run icons`).
- Aucun asset tiers embarqué. Dépendances de build/test uniquement (TypeScript, esbuild, Vitest, happy-dom, Playwright).

## 4. Points de vigilance pour la suite

- Les avatars **importés par les utilisateurs** peuvent être protégés (personnages de jeux, d’animés…).
  L’import est local et privé ; toute future galerie/boutique devra exiger une licence et un crédit (les champs
  `credits` et `license` existent déjà sur les avatars et les profils).
- Les profils générés pour des personnages existants : le générateur local ne fait **aucune recherche en ligne**
  et le signale explicitement dans les incertitudes. Un futur générateur IA devra citer ses sources et garder
  ce mécanisme d’incertitudes + correction manuelle.

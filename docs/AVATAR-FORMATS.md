# Formats d'avatars

Un avatar est indépendant du profil (personnalité) et du moteur (comportement). **Tous les formats
supportent toutes les animations** : la scène applique à l'avatar entier la respiration, la marche
(balancement), les sauts (arcs + écrasement à l'atterrissage), le « pendouillage » quand on le traîne, les
réactions (gigotement, tour sur soi, tête qui tourne), l'entrée et la sortie. Les formats plus riches
ajoutent des animations par partie ou par image.

| Format | Fichiers | Animations propres |
|---|---|---|
| Image fixe | `.png`, `.jpg`, `.webp`, `.gif` | Animations globales uniquement. |
| GIF / WebP animé | `.gif`, `.webp` | Les images de l'animation sont jouées en boucle (API `ImageDecoder`). |
| SVG simple | `.svg` | Animations globales. |
| **SVG articulé** | `.svg` avec `data-part` | Clignement, regard qui suit la souris, bouche qui parle, bras qui saluent / balancent, humeurs. |
| Sprite sheet | image + `.json` | Une animation par activité (repos, marche, saut, coucou, réaction, sommeil…). |
| Pack Persona | `.persona.json` | Profil + avatar, export / import depuis la page d'options. |

Taille maximale : 8 Mo par fichier. Les fichiers restent dans `chrome.storage.local` sur l'appareil.

## SVG articulé (convention `persona-rig@1`)

Ajoutez des attributs `data-part` aux groupes de votre SVG. Seul `body` est obligatoire, plus au moins un
œil, la bouche ou un bras pour que le SVG soit reconnu comme articulé.

| `data-part` | Effet |
|---|---|
| `body` | Groupe principal. |
| `eye-left`, `eye-right` | Clignent, se ferment (sommeil), s'agrandissent (surprise). |
| `pupil-left`, `pupil-right` | Suivent le curseur, regardent autour, tournent (tête qui tourne). |
| `mouth` / `mouth-open` | Bouche fermée / ouverte, alternées pendant la parole. |
| `arm-left`, `arm-right` | Coucou (bras droit), balancement en marchant, bras levés en sautant, gigotent quand on le traîne. |
| `feet` | Petits pas pendant la marche. |
| `cheeks` | Rougissent (réaction timide). |
| `sprout` (ou tout accessoire) | Se balance doucement. |

`data-origin="x% y%"` fixe le point de rotation d'une partie (ex. l'épaule d'un bras : `data-origin="10% 20%"`).
Le dessin de référence est `characters/pip/avatar.svg`.

Sécurité : à l'import, le SVG est réduit à une liste blanche — pas de script, de gestionnaire d'évènement,
de `foreignObject`, de `<style>`, ni de référence externe (seules les références internes `#id` et les
images `data:image/...` sont gardées).

## Sprite sheet — grille Persona

Sélectionnez l'image **et** le JSON ensemble dans la page d'options.

```json
{
  "format": "persona-spritesheet",
  "version": 1,
  "frameWidth": 64,
  "frameHeight": 64,
  "facing": "right",
  "animations": {
    "idle":  { "frames": [0, 1, 2, 3], "fps": 6 },
    "walk":  { "from": 4, "to": 9, "fps": 12 },
    "jump":  { "frames": [10, 11, 12], "fps": 10, "loop": false },
    "wave":  [13, 14, 15, 14],
    "sleep": { "frames": [16, 17], "fps": 2 }
  }
}
```

Les frames sont numérotées de gauche à droite puis de haut en bas. `facing` indique dans quel sens regarde
le dessin : le personnage est retourné automatiquement quand il marche dans l'autre sens.

Noms reconnus (fr/en) : `idle/repos/stand`, `walk/run/marche`, `jump/hop/saut`, `wave/hello/coucou/salut`,
`react/happy/laugh/click`, `sleep/nap/dodo`, `talk/speak/parle`, `dangle/drag/grab`, `fall/chute`,
`look/regard`, `enter/appear/spawn`. Une animation absente est remplacée par la plus proche (ex. `wave` →
`react` → `idle`).

## Sprite sheet — exports Aseprite et TexturePacker

Les exports JSON d'**Aseprite** (`File → Export Sprite Sheet`, format *Hash* ou *Array*, avec *Tags*) sont
lus directement : chaque tag devient une animation, la durée des frames donne la vitesse, les directions
`reverse` et `pingpong` sont respectées. Les exports **TexturePacker** sans tags sont regroupés par nom de
frame (`walk_01.png`, `walk_02.png` → `walk`).

## Pack Persona (`.persona.json`)

```json
{ "format": "persona-pack", "version": 1, "profile": { ... }, "avatar": { ... } }
```

Produit par le bouton **Exporter** d'un personnage. À l'import, le profil et l'avatar reçoivent de nouveaux
identifiants, le SVG est à nouveau nettoyé et les images sont vérifiées.

## Droits

N'importez que des images dont vous détenez les droits. Les champs `credits` et `license` d'un avatar
sont conservés dans les packs : renseignez-les avant de partager un personnage.

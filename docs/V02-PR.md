Les déplacements Windows étaient confinés à la petite scène et les répliques personnalisées pouvaient être mélangées à des remarques génériques de mascotte. Cette tranche délègue les marches à la vraie fenêtre native et ajoute un prototype opt-in de rebords de fenêtres.

- Interpolation native, limites de l’écran, suspension pendant menus/capture/masquage, cadence de trajectoire native sans IPC par image.
- Géométrie Win32/DWM uniquement après option explicite : poser le compagnon sur un bord compatible, suivre son déplacement, marcher sur le bord et retomber vers le bureau quand il disparaît. Aucune capture d’écran, lecture de contenu/titre ou écoute audio.
- Images d’abord dans l’atelier ; identité facultative et liens HTTPS conservés comme non vérifiés. Aucune fausse identification par nom de fichier.
- Jauges taille/activité/paroles. Profil Terry McGinnis confirmé manuellement et répliques locales prioritaires, sans mélange aux répliques de mascotte. Aucun asset Batman distribué.
- Version0.2.0, migration conservée et réglages bureau séparés des profils.

Tests locaux : typage,119 unitaires, 26 bureau (frontend/contrôleur/stockage), builds frontend, vérification Rust Windows MSVC avec ressources embarquées. Quatre nouveaux tests Rust purs (sept au total avec la géométrie existante) ont réussi sur le runner Windows. Le comportement visuel réel des perchoirs et la fluidité native restent à tester sur PC ; les tests frontend simulent l’IPC.

La reconnaissance IA des images, la recherche des origines depuis les liens, le rigging, les grappins/toiles, l’interaction avec les icônes et Discord ne sont pas connectés. Aucun accès fournisseur, coût IA, action Discord ni déploiement public n’est activé. Limites, tests et captures : docs/DESKTOP-CONTEXT-V02.md.

PR empilée sur feat/character-workshop-phase1, sans fusion automatique.


Ouverture automatique tentée, mais l’API GitHub répond `Forbidden`. Aucune PR créée ; le texte ci-dessus est un brouillon prêt à publier.

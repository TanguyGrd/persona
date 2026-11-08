L’atelier Windows accepte désormais 1 à 10 images au lieu de refuser les vues supplémentaires. L’utilisateur choisit la vue principale, renseigne éventuellement nom/univers/personnalité, vérifie l’aperçu et active un compagnon instantané. Les autres vues sont conservées comme références, sans fausse reconstruction IA.

Cette PR est empilée sur `feat/desktop-avatar-menu` : elle conserve les travaux Tauri et Chrome précédents sans les fusionner ni repartir de `main`, encore vide.

- Persistance IndexedDB avec migration atomique du stockage antérieur, limites de fichiers et de dimensions, erreurs visibles et nettoyage après échec.
- Profil local et provenance utilisateur, réglages sérialisés pour éviter qu’une position rétablisse l’ancien personnage lors de l’activation.
- Export/import manuel du pack Persona, références comprises, avec le même importeur dans Chrome. Aucune synchronisation automatique ni permission supplémentaire.
- Aperçu et scène adaptés aux images très larges ; trajectoires périmées annulées au redimensionnement et boutons maintenus dans la petite fenêtre.

Validation exécutée : TypeScript ; 105 tests unitaires ; 20 tests bureau dans Chromium système (13 frontend, 5 IndexedDB, 2 ancien adaptateur) ; build Chrome/playground et bureau ; ZIP Chrome ; vérification Rust Windows MSVC avec tests et ressources embarquées ; rustfmt.

Les 15 tests e2e Chrome ne se sont pas exécutés, le hook de démarrage échoue faute du Chromium Playwright dont le téléchargement est refusé. Le navigateur système ne charge pas cette extension. Les tests bureau et la vidéo simulent l’IPC : aucun comportement natif Windows ni installeur `.exe` n’a été validé ici (éditeur de liens MSVC absent). L’état de GitHub Actions est à consulter séparément.

Captures et démonstration de 7,44 s : `docs/screenshots/phase1-workshop.png`, `docs/screenshots/phase1-workshop-ready.png`, `docs/demos/phase1-workshop.webm`. Audit, commandes et limites : `docs/PHASE1-WORKSHOP.md`.

Recherche avec sources, sélection de sujet dans une photo de groupe, segmentation, rigging, agents, crédits et paiements restent dans les phases suivantes. Aucun appel IA, coût réel, déploiement public, ressource Capri, changement de licence ou fusion n’est introduit.

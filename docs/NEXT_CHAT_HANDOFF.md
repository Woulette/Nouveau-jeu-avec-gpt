# Relais pour le prochain chat — Nouveau MMO RPG

Dernière mise à jour : 14 juillet 2026.

## Projet à continuer

- Dépôt GitHub : `Woulette/Nouveau-jeu-avec-gpt`
- Branche de travail et de déploiement : `main`
- Jeu public : <https://nouveau-jeu-avec-gpt.vercel.app>
- Stack : Next.js 16, React 19, Phaser 3, TypeScript, Vitest et WebSocket avec moteur local de secours.
- Document de référence : `docs/GAME_DESIGN.md`.

Ne jamais modifier VoidSector ni un autre jeu. Ce dépôt et cette URL sont les seules cibles.

## Décisions impératives

- Jeu mobile uniquement en paysage ; le portrait demande de tourner le téléphone.
- Le joueur commence Aventurier niveau 1 sans rang ni compétence.
- Au niveau 10, le Maître du QG permet un choix définitif : Épéiste, Archer ou Magicien. Le choix donne le rang E, remet les maîtrises offensives provisoires à zéro, attribue 25 points à la voie choisie et conserve Défense.
- Le soin hors combat commence exactement 2 secondes après le dernier coup donné ou reçu. Il rend +1 PV toutes les 500 ms : affichage de 1 en 1, total 2 PV/s.
- La caméra utilise 85 % du zoom paysage de référence.
- Les fonds du HUD touchent les bords physiques. Le contenu respecte les safe areas iPhone ; ne jamais supprimer cette protection.
- Inventaire + équipement restent dans une seule fenêtre ; Statistiques et Carte des failles sont séparées.
- Les six statistiques tiennent sur une page sans scroll, en lignes verticales Base / Combat / Équipement / Total.
- Les assets définitifs sont traités séparément. Les variantes procédurales actuelles servent à rendre le nouveau contenu testable.

## Fonctionnalités implémentées dans la dernière passe

### Soin hors combat

- `PLAYER_COMBAT_TIMEOUT_MS = 2_000`.
- Premier tick +1 à `dernierImpact + 2 000 ms`, puis +1 chaque 500 ms.
- Un coup sortant comme un coup entrant redémarre le même délai.
- Les ticks retardés ne sont jamais agrégés en un gros saut visible : un seul `+1` est appliqué, puis le rythme de 500 ms reprend ; un mort ne se soigne pas.

### Éveil du Maître du QG

- Le Maître situé en `{15,13}` possède une vraie zone tactile.
- Toucher le PNJ fait approcher automatiquement le joueur, puis le serveur ouvre un dialogue `level-required`, `eligible` ou `completed`.
- Dialogue moderne avec trois cartes, explication des voies et confirmation explicite de l’irréversibilité.
- Validation autoritaire : niveau 10 minimum, personnage vivant, zone extérieure, distance correcte, voie encore vierge.
- Choix Épéiste / Archer / Magicien, rang E, 25 points sur la bonne maîtrise, Défense conservée.
- Le rang, la classe et la voie sont sauvegardés. L’anti-régression empêche de perdre l’éveil, de baisser de rang ou de changer de voie après rechargement.

### Monde ouvert agrandi

- Carte passée de 64 × 48 à **112 × 72** cases, toutes les destinations importantes restant reliées à la ville.
- Six régions : Prairies éveillées E, Bois d’Ambre D, Marais de Cendre C, Plateaux Brisés B, Lande de l’Éclipse A, Frontière Abyssale S.
- Quinze monstres extérieurs et au moins dix espèces/variantes. Les nouvelles créatures possèdent des PV, dégâts, Défense, détection, XP et butins croissants.
- Nouvelles ressources : Résine d’Ambre, Cendre de mana, Cœur de basalte, Éclat d’éclipse et Fragment abyssal.
- Rendu différencié par biome et teintes de créatures provisoires, avec routes, repères et pierres autour de chaque portail.

### Failles E à S

- Noyau générique `RIFT_RANKS` et `RIFT_RANK_CONFIG` pour E, D, C, B, A et S.
- Six portails stables : E `{54,8}`, D `{72,12}`, C `{96,12}`, B `{73,38}`, A `{96,40}`, S `{88,61}`.
- Un monde neuf expose les six rangs ; maximum six failles actives. Une apparition future recrée en priorité un rang absent.
- Même logique trois salles pour chaque rang, mais noms, niveaux, PV, dégâts, Défense, vitesse, XP, butin et récompense finale sont mis à l’échelle.
- Le détail de chaque portail affiche la puissance conseillée, la puissance actuelle et un avertissement `Danger` ou `Prêt` ; le journal fait défiler toutes les failles, y compris les huit entrées possibles pendant une migration.
- Le rang exact traverse snapshots, instance, événements, affichage, boss échappé et sauvegarde locale.
- Persistance des failles `v2` multirang avec migration transparente du format `v1` E : aucune date, position, PV de boss ni prochaine apparition ne doit être remise à zéro.
- Une ancienne sauvegarde possédant plusieurs failles E les conserve toutes et reçoit quand même D à S. Elle peut donc afficher temporairement jusqu’à huit portails, puis revient à la limite normale de six à mesure que les doublons E historiques sont résolus.

### HUD mobile iPhone/Android

- Zoom final 85 %.
- Carte joueur compacte collée au coin haut-gauche ; identité courte `Niv. · Classe · Rang`.
- Puissance au bord haut-droit, hotbar au bord bas, Menu au coin bas-droit.
- Les surfaces vont jusqu’au verre ; le texte et les zones tactiles utilisent `env(safe-area-inset-*)`.
- XP déplacée en haut-centre. Butin déplacé en haut et doublon toast supprimé.
- Les jauges de progression des statistiques font 7 px et restent visibles sans scroll.
- QA finale réussie sur iPhone 874×402 avec safe areas 62/62/17, Android 740×360 et ordinateur 1280×720 : surfaces aux quatre bords, dialogue entièrement lisible, zones tactiles de 44 px minimum et aucune erreur navigateur.

## Sauvegarde et architecture à connaître

- Sauvegarde joueur navigateur `v2` : niveau, XP, maîtrises, PV/PM, position extérieure, inventaire, équipement, or, rang, voie et classe.
- Sauvegarde du cycle de failles distincte, désormais `v2` multirang.
- Le royaume local accepte la sauvegarde navigateur ; le serveur MMO en ligne ne la prend pas comme autorité.
- Une instance interrompue reprend depuis le dernier état extérieur sûr. Le portail extérieur et son délai continuent.
- Le monde en ligne reste en mémoire dans cette tranche ; comptes, base durable et synchronisation multi-appareils restent à construire.

## Fichiers principaux

- `game/server/realm.ts` : autorité monde/combat/soin/éveil/failles.
- `game/shared/awakening.ts` et `game/server/awakening-realm.test.ts` : contrat du Maître du QG.
- `game/shared/world.ts` : carte 112 × 72, régions, portails et monstres extérieurs.
- `game/shared/rifts.ts` et `game/server/rift-content.ts` : config E à S et contenu des salles.
- `game/shared/rift-persistence.ts` : format `v2` et migration `v1`.
- `game/shared/save.ts` : sauvegarde joueur et protection de l’éveil.
- `game/client/WorldScene.ts` : rendu, interactions PNJ/portails, notifications et zoom.
- `components/AwakeningDialog.tsx` : choix de spécialité.
- `components/Hud.tsx` et `components/Hud.module.css` : HUD, inventaire, stats et carte.
- `components/GameShell.tsx` : état React et dialogue d’éveil.

## Validation à préserver

- Dernière validation complète : TypeScript, ESLint, build de production et **110 tests sur 110** réussis.
- Parcours navigateur final validé : clic Maître du QG niveau 10, sélection Archer, rang E et 25 points Distance persistants, puis affichage simultané des six marqueurs E à S.
- Exécuter avant publication : `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Refaire le parcours navigateur sur au moins 874×402 iPhone simulé, 740×360 Android et 1280×720 desktop.
- Vérifier réellement : affichage six portails, clic Maître du QG niveau 10, choix de classe, rang E persistant, inventaire, Statistiques sans scroll et absence d’erreurs console.
- Après push de `main`, attendre et vérifier le contenu réellement servi par Vercel.

## Prochaines priorités

1. Concevoir les quatre premières compétences actives des trois voies, mana et temps de recharge.
2. Tester puis rééquilibrer les nouveaux monstres et les multiplicateurs de failles D à S.
3. Ajouter les promotions D et supérieures avec seuils de niveau et de puissance.
4. Ajouter comptes et base de données pour une vraie persistance MMO multi-appareils.
5. Remplacer progressivement les variantes procédurales par les assets définitifs validés par l’utilisateur.

Toute décision validée doit être ajoutée à `docs/GAME_DESIGN.md`, puis le code et ce relais doivent être poussés sur GitHub et vérifiés sur Vercel.

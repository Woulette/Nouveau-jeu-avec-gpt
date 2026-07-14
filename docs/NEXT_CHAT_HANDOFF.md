# Relais pour le prochain chat — Nouveau MMO RPG

Dernière mise à jour : 14 juillet 2026.

## Projet à continuer

- Dépôt GitHub : `Woulette/Nouveau-jeu-avec-gpt`
- Branche de travail et de déploiement : `main`
- Jeu public : <https://nouveau-jeu-avec-gpt.vercel.app>
- Stack : Next.js 16, React 19, Phaser 3, TypeScript, Vitest et WebSocket avec moteur local de secours.
- Document de référence complet : `docs/GAME_DESIGN.md`.

Ne pas travailler sur un autre dépôt ou un autre jeu. Les projets VoidSector et Chroniques de Solenne ne font pas partie de cette demande.

## Décisions de conception impératives

- Jeu mobile en paysage uniquement ; le portrait affiche une invitation à tourner le téléphone.
- Déplacement tactile par cases et combat en temps réel : toucher un monstre fait avancer automatiquement le joueur jusqu'à sa portée puis attaquer.
- Le joueur commence Aventurier niveau 1, **sans rang** et sans compétence. Le futur éveil au QG au niveau 10 permettra de choisir définitivement Épéiste, Archer ou Magicien et donnera le rang E.
- Six statistiques : Corps-à-corps, Distance, Magie, Défense, Énergie et Vitesse. Les quatre maîtrises de combat ont une XP indépendante du niveau général.
- Toute attaque qui inflige ou reçoit réellement des dégâts donne de l'XP de maîtrise, même contre un monstre de niveau très inférieur.
- Hors combat : +2 PV par seconde complète. Une attaque donnée ou reçue remet le délai à zéro ; après un dernier impact à `t=0`, le premier +2 arrive à `t=6 s`.
- Inventaire et équipement restent dans une fenêtre combinée ; les Statistiques et la Carte des failles sont deux fenêtres séparées, toutes sans défilement structurel en paysage.

## Fonctionnalités désormais implémentées

### Interface mobile et caméra

- Nouveau thème nocturne ardoise-jade commun au HUD, aux panneaux, à la carte et aux écrans de résultat ; l'ancien CSS empilé de prototype a été remplacé par une feuille cohérente.
- Caméra paysage réglée à 90 % du zoom précédent (`1,08` au lieu de `1,2` sur les formats testés), sans appliquer de zoom CSS à l'interface.
- Inventaire entièrement reconstruit en trois zones fixes : équipement autour du mannequin, grille 5 × 4 minimum avec capacité/filtres/or, puis inspecteur d'objet persistant.
- Filtres Tout, Équipement, Consommables et Ressources fonctionnels, avec compteur et libellés courts sur les écrans les plus étroits.
- Portefeuille d'or ajouté au modèle autoritaire, aux snapshots et à la sauvegarde locale ; une ancienne sauvegarde `v2` sans ce champ migre automatiquement avec `0` or.
- Les six statistiques sont maintenant six lignes verticales, chacune avec les colonnes Base, Combat, Équipement et Total. La page entière tient sans défilement en paysage.
- La petite potion de départ est utilisable : le monde vérifie la possession et les PV, rend 35 PV, consomme une unité et refuse de la gaspiller à pleine vie.
- Aucun asset graphique n'a été remplacé dans cette passe ; l'utilisateur prévoit de traiter les assets séparément.

### Sauvegarde et hors ligne

- Sauvegarde navigateur versionnée `v2` : niveau, XP, maîtrises, PV/PM, position extérieure, inventaire, équipement et or.
- Sauvegarde régulière et lors de la fermeture de la page.
- Protection anti-régression : un personnage serveur recréé au niveau 1 ne peut pas écraser une sauvegarde locale plus avancée.
- Choix En ligne/Hors ligne dans le menu. Le mode hors ligne démarre un royaume local immédiatement.
- Cache hors ligne : une première visite en production précharge le graphe complet des fichiers du jeu et attend l'accusé « prêt » ; les réouvertures suivantes peuvent alors fonctionner sans réseau.
- Sécurité actuelle : la sauvegarde navigateur n'est restaurée que par le royaume local explicitement autorisé. Elle n'est jamais acceptée comme autorité par le serveur MMO en ligne.
- Limite connue : une instance de faille interrompue reprend depuis la dernière sauvegarde extérieure sûre. La synchronisation entre appareils attend les comptes et une base de données.

### Failles dynamiques

- Une faille E de test apparaît immédiatement. D'autres peuvent apparaître toutes les 15 à 45 minutes, avec trois actives au maximum.
- Chaque faille a une échéance réelle de 24 heures.
- Après l'échéance, un Gardien agressif sort dans le monde. Il faut tuer ce boss extérieur puis terminer l'intérieur.
- Si l'échéance arrive pendant une instance, le joueur est éjecté. La fermeture reste bloquée tant que le Gardien extérieur vit, y compris si l'intérieur avait déjà été engagé.
- Une faille fermée disparaît définitivement, sans cooldown d'une heure.
- En local/hors ligne, dates d'apparition et d'expiration, prochaine apparition, portails et Gardien extérieur avec ses PV/sa position sont sauvegardés dans un format versionné : un reload ne remet pas le délai à zéro.
- En ligne, le cycle reste pour l'instant en mémoire et sera rendu durable avec la future base de données MMO.
- Le menu Carte affiche le joueur, les marqueurs de failles et un Journal. Un marqueur donne rang, âge, temps restant, position et état.

### Donjon E

- Toucher le portail fait marcher le joueur jusqu'à l'entrée puis charge une instance individuelle.
- Trois salles physiques : deux vagues puis le Gardien de la Brèche.
- Impossible de franchir un sceau tant que la salle actuelle contient un monstre vivant.
- Le boss final ferme la faille et ramène le joueur dans le monde ouvert.
- Fenêtre finale : « Portail rang E terminé », XP totale, équipement/ressources, durée.
- Récompense garantie de test : 3 Poussières dimensionnelles + 1 Lame-croc de faille, en plus du butin aléatoire.

## État de validation de cette version

- 74 tests automatisés réussis, dont la migration d'une sauvegarde sans or, la consommation autoritaire d'une potion, le cycle local persistant sur 24 h, la restauration du Gardien extérieur, le blocage de fermeture et le parcours serveur des trois salles.
- TypeScript, ESLint et build Next.js de production réussis.
- Test navigateur mobile en `740×360`, `844×390`, `932×430` et portrait `390×844` : panneau contenu dans le viewport, vingt slots visibles sans rangée cachée, tris exacts, équipement/déséquipement, portefeuille, six lignes de statistiques sans scroll et aucune erreur applicative ou requête échouée.
- Entrée réelle dans le portail vérifiée visuellement : le décor de faille, les deux monstres de la première salle et le premier sceau apparaissent correctement.

## Fichiers principaux

- `game/server/realm.ts` : autorité de monde, combat, régénération, sauvegarde locale autorisée et cycle complet des failles.
- `game/server/rift-content.ts` : monstres des trois salles et Gardien extérieur.
- `game/shared/rifts.ts` : temps 24 h, carte intérieure, état et récompenses des instances.
- `game/shared/rift-persistence.ts` et `game/client/rift-storage.ts` : cycle versionné des portails et Gardien extérieur durable en local/hors ligne.
- `game/shared/save.ts` et `game/client/storage.ts` : format de sauvegarde et stockage navigateur.
- `game/client/WorldSocket.ts` : modes en ligne/local/hors ligne et heartbeat.
- `game/client/WorldScene.ts` : rendu du monde, portails, intérieur de faille et événements.
- `components/Hud.tsx` et `components/Hud.module.css` : inventaire, statistiques, carte/journal et bilan de portail.
- `public/sw.js` : cache hors ligne de l'application.

## Prochaines priorités logiques

1. Tester l'équilibrage de la faille E avec un vrai Aventurier autour du niveau 10 et ajuster PV/dégâts/butin selon le ressenti mobile.
2. Implémenter le PNJ du QG, le choix irréversible au niveau 10, le rang E et les premières compétences des trois voies.
3. Ajouter comptes et base de données pour une sauvegarde MMO sécurisée et multi-appareils.
4. Transformer les instances individuelles en instances de groupe lorsque les groupes MMO seront conçus.

Toute nouvelle décision validée avec l'utilisateur doit être ajoutée à `docs/GAME_DESIGN.md` avant la fin du travail, puis la version doit être enregistrée sur GitHub et vérifiée sur Vercel.

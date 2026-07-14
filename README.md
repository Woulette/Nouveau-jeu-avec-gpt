# Nouveau MMO RPG — prototype

Première tranche verticale d'un MMORPG fantasy 2D sur cases, pensée pour mobile et déployée sur Vercel.

## Commandes

```bash
npm install
npm run dev
npm run test
npm run typecheck
npm run build
```

## Principes du prototype

- déplacement tactile sur grille ;
- ciblage et attaque automatique à portée ;
- monstres en patrouille, avec comportements neutres (riposte), défensifs et agressifs ;
- progression générale et entraînement séparés ;
- aventurier non classé avant le niveau 10 et l'éveil au quartier général ;
- Maître du QG interactif avec choix irréversible Épéiste, Archer ou Magicien et rang E ;
- monde ouvert 112 × 72, six régions reliées et quinze créatures extérieures ;
- failles jouables de rang E à S, avec difficulté, contenu et récompenses mis à l'échelle ;
- régénération hors combat après deux secondes, visible par pas de +1 et totalisant 2 PV/s ;
- inventaire et équipement autoritaires avec six slots et bonus de combat réels ;
- inventaire filtrable, mannequin équipé, fiche objet et statistiques compactes sans défilement ;
- statistique Vitesse, de 100 à 300, gagnant un point tous les dix niveaux ;
- interface de jeu réservée au paysage, avec écran de rotation en portrait ;
- rotation de l'appareil sans étirement du canvas ;
- présence multijoueur expérimentale par WebSocket Vercel avec repli local ;
- interface tactile à zoom 85 %, bord-à-bord et protégée par les zones sûres iPhone.

Le document complet est disponible dans [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md).

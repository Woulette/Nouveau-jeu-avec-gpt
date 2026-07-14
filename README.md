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
- inventaire et équipement autoritaires avec six slots et bonus de combat réels ;
- inventaire filtrable, mannequin équipé, fiche objet et statistiques compactes sans défilement ;
- statistique Vitesse, de 100 à 300, gagnant un point tous les dix niveaux ;
- interface de jeu réservée au paysage, avec écran de rotation en portrait ;
- rotation de l'appareil sans étirement du canvas ;
- présence multijoueur expérimentale par WebSocket Vercel avec repli local ;
- interface tactile optimisée pour les écrans mobiles courts.

Le document complet est disponible dans [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md).

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
- monstres en patrouille, avec comportements passifs, défensifs et agressifs ;
- progression générale et entraînement séparés ;
- inventaire et équipement autoritaires avec quatre slots et bonus de combat réels ;
- mannequin, statistiques détaillées et retour de butin compacts sur mobile ;
- rotation portrait/paysage sans étirement du canvas ;
- présence multijoueur expérimentale par WebSocket Vercel avec repli local ;
- paysage prioritaire, portrait utilisable.

Le document complet est disponible dans [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md).

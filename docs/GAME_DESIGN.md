# Document de conception du jeu

> Document central du projet. Toute décision validée doit être ajoutée ici. Les anciens calculs concernant les rangs et les milliers de points de SP ont été abandonnés le 14 juillet 2026 afin de repartir sur une base plus simple.

## 1. Vision actuelle

Le projet est un MMORPG 2D en temps réel principalement pensé pour mobile. Le niveau général est conçu comme une progression ouverte, sans plafond final fixe : les niveaux deviennent progressivement plus longs à obtenir, même après le dernier rang. Le jeu combine :

- un monde ouvert partagé, découpé sur une grille, et des commandes tactiles simples ;
- trois voies de combat permanentes possédant leurs propres évolutions de classe ;
- une progression générale longue ;
- des donjons, des monstres, des équipements et des évolutions à obtenir en jouant.

La première version doit rester directement jouable depuis un navigateur mobile grâce au déploiement Vercel. Le fonctionnement multijoueur ne doit pas empêcher de tester le cœur du jeu lorsqu'une connexion au serveur de monde n'est pas disponible.

L'univers, les personnages, les noms, les graphismes et les mécaniques finales doivent posséder une identité originale.

### Direction visuelle actuelle

- vue 2D de dessus ou en légère perspective ;
- pixel art fantasy semi-sombre, lisible malgré une ambiance mystérieuse ;
- personnages, monstres, bâtiments et effets originaux, sans reprendre directement ceux d'une œuvre ou d'un jeu existant ;
- silhouettes, couleurs de danger et zones d'interaction suffisamment claires sur un petit écran ;
- priorité à la fluidité et à la lisibilité plutôt qu'à une accumulation d'effets visuels.

## 2. Progression générale du joueur

Le personnage possède un niveau général et cinq statistiques universelles. Il n'attribue plus manuellement des points à chaque niveau : les statistiques progressent automatiquement et, pour certaines, grâce à leur propre entraînement au combat.

| Statistique | Fonction actuelle |
| --- | --- |
| Corps-à-corps | Augmente les dégâts des attaques et compétences de mêlée |
| Distance | Augmente les dégâts des attaques et compétences à distance |
| Magie | Augmente les dégâts des sorts |
| Défense | Réduit les dégâts reçus |
| Énergie | Augmente les points de vie et les points de mana |

### Valeurs de départ et progression générale

Le personnage commence Aventurier niveau général 1 avec :

- 1 en Corps-à-corps ;
- 1 en Distance ;
- 1 en Magie ;
- 1 en Défense ;
- 1 en Énergie.

À chaque niveau général gagné, il reçoit automatiquement :

- +1 en Corps-à-corps de base ;
- +1 en Distance de base ;
- +1 en Magie de base ;
- +1 en Défense de base ;
- +1 en Énergie de base.

L'Énergie de base, et donc la progression principale des PV et des PM, augmente uniquement grâce au niveau général. Elle ne possède pas d'expérience d'entraînement au combat dans le système actuel. Les équipements peuvent toutefois lui ajouter un bonus séparé tant qu'ils sont portés.

### Entraînement indépendant des statistiques

Corps-à-corps, Distance, Magie et Défense peuvent également progresser en étant utilisés :

- attaquer au contact des ennemis valides accorde de l'XP d'entraînement de Corps-à-corps ;
- attaquer à distance des ennemis valides accorde de l'XP d'entraînement de Distance ;
- utiliser des attaques magiques valides accorde de l'XP d'entraînement de Magie ;
- recevoir des dégâts valides accorde de l'XP d'entraînement de Défense ;
- lorsque la jauge d'une statistique est remplie, son niveau d'entraînement augmente et accorde +1 supplémentaire à cette statistique.

Chaque statistique entraînable possède donc deux composantes distinctes :

**Statistique totale affichée = valeur obtenue par le niveau général + bonus obtenu par l'entraînement + bonus des équipements portés**

Exemple :

- un personnage niveau général 10 possède 10 de Corps-à-corps de base ;
- il a gagné 4 niveaux d'entraînement de Corps-à-corps en combattant ;
- son Corps-à-corps total est donc de 14.

### Séparation absolue des deux progressions

La progression générale et l'entraînement ne doivent jamais modifier leurs compteurs respectifs :

- gagner un niveau général ajoute +1 à la valeur de base ;
- cela ne remet pas à zéro l'XP d'entraînement en cours ;
- cela n'augmente pas le seuil d'XP du prochain niveau d'entraînement ;
- gagner un niveau d'entraînement ajoute seulement +1 au bonus entraîné ;
- cela ne donne pas d'XP générale et ne modifie pas le niveau général.

Exemple : si le Corps-à-corps entraîné possède 70/100 XP et que le personnage gagne un niveau général, il reste exactement à 70/100 XP. Seule sa valeur de base reçoit +1.

Équiper ou retirer un objet ne modifie jamais le niveau général, le niveau d'entraînement ni l'XP d'entraînement en cours. Le bonus d'objet constitue une troisième composante indépendante et réversible.

Les courbes d'XP générale et de chaque entraînement seront calculées séparément.

### Protection contre l'entraînement artificiel

Les conditions exactes restent à équilibrer, mais l'entraînement devra seulement compter lors de combats valides. Il faudra empêcher qu'un joueur améliore une maîtrise offensive en frappant sans risque un ennemi beaucoup trop faible ou sa Défense en restant volontairement sous les attaques d'une créature inoffensive. Les règles anti-abus seront définies avec le système de combat.

### Rangs officiels et indice de puissance

Les rangs appartiennent au joueur et représentent sa puissance globale. Ils ne sont pas accordés automatiquement par le niveau général.

Ordre actuel :

**E → D → C → B → A → S → SS → SSS → Ω Oméga**

Chaque promotion possède deux conditions distinctes :

1. un niveau général minimum, qui débloque la possibilité d'obtenir le rang ;
2. un indice de puissance minimum, qui prouve que le personnage est réellement assez puissant.

Le niveau est donc seulement un prérequis. Un joueur ayant le niveau nécessaire mais une puissance insuffisante reste à son ancien rang.

L'indice de puissance est calculé à partir des éléments permanents du personnage :

- niveau général ;
- Corps-à-corps, Distance ou Magie selon la voie ;
- Défense et Énergie ;
- équipement ;
- évolution de classe ;
- améliorations permanentes pertinentes.

Les effets temporaires, consommables et bonus d'événement ne doivent pas permettre d'obtenir artificiellement un rang.

Première tranche envisagée : le rang E correspond au début de la progression et couvre approximativement les niveaux 1 à 20. Les niveaux minimums et indices de puissance requis pour les rangs D à Oméga restent à équilibrer.

Une fois obtenu, un rang devrait rester acquis même si le joueur retire temporairement son équipement. L'indice actuel peut diminuer, mais la promotion validée n'est pas annulée.

Chaque passage de rang donne un bonus permanent aux dégâts, aux PV et à la Défense, accélère l'entraînement des maîtrises et débloque les équipements du rang correspondant.

### Bonus de puissance par rang

| Rang | Bonus aux dégâts, PV et Défense |
| --- | ---: |
| Sans rang | 0 % |
| E | +5 % |
| D | +10 % |
| C | +15 % |
| B | +25 % |
| A | +35 % |
| S | +50 % |
| SS | +65 % |
| SSS | +80 % |
| Ω Oméga | +100 % |

Ces valeurs remplacent le bonus du rang précédent : elles ne se multiplient pas entre elles au fil des promotions. Par exemple, Oméga donne un bonus total de +100 %, soit des dégâts, des PV et une Défense doublés par rapport aux valeurs précédant le bonus de rang.

Cette courbe est validée comme base de conception, mais les pourcentages resteront ajustables après les tests d'équilibrage.

### Multiplicateurs d'XP d'entraînement

Le rang accélère l'XP obtenue en entraînant Corps-à-corps, Distance, Magie et Défense. L'Énergie reste liée uniquement au niveau général.

| Rang | Multiplicateur d'XP d'entraînement |
| --- | ---: |
| E | ×1 |
| D | ×2 |
| C | ×3 |
| B | ×4 |
| A | ×6 |
| S | ×8 |
| SS | ×12 |
| SSS | ×16 |
| Ω Oméga | ×20 |

Cette courbe contrôlée remplace l'idée d'un doublement cumulatif à chaque rang, qui aurait atteint ×256 au rang Oméga.

Exemple : une action donnant 10 XP de base accorde 10 XP au rang E, 20 XP au rang D, 80 XP au rang S et 200 XP au rang Oméga.

L'XP nécessaire pour améliorer une maîtrise augmente fortement avec son niveau. Les multiplicateurs des derniers rangs compensent donc une progression devenue très lente sans rendre instantané le passage d'une maîtrise 500 à 501.

### Équipements conditionnés par le rang

Chaque équipement possède un rang minimal d'utilisation. Un joueur peut obtenir un objet de rang supérieur dans une faille dangereuse, mais il ne peut pas l'équiper avant d'avoir atteint le rang demandé.

Exemples :

- équipement D utilisable à partir du rang D ;
- équipement S utilisable à partir du rang S ;
- équipements SS, SSS et Oméga réservés aux rangs correspondants.

Un objet de haut rang obtenu en avance devient ainsi un objectif visible pour le joueur.

Important : les bonus directs accordés par le rang ne doivent pas être inclus dans l'indice utilisé pour obtenir le rang suivant. Autrement, une promotion pourrait augmenter automatiquement l'indice et déclencher une chaîne de promotions sans nouvelle progression réelle. En revanche, les statistiques réellement gagnées ensuite et les nouveaux équipements équipés comptent normalement dans l'indice.

### Équipement autoritaire de la première tranche

Le personnage possède quatre emplacements réels : **Coiffe, Arme, Armure et Bottes**. Le panneau d'équipement montre le personnage au centre et place chaque emplacement à proximité de la partie du corps correspondante. L'objet porté apparaît également sur le mannequin sous forme d'icône afin que le changement soit immédiatement visible.

La première tenue de test comprend une coiffe, une dague, une tunique et des bottes d'aventurier. Les monstres peuvent ensuite donner des objets plus puissants, par exemple la Coiffe du Sanglier ou la Lame-croc de faille.

L'inventaire et l'équipement appartiennent au joueur autoritaire de la zone :

- le serveur vérifie que l'objet est réellement possédé ;
- il vérifie le type d'objet, le slot et le rang minimal ;
- remplacer un objet conserve l'ancien dans l'inventaire ;
- les bonus portés modifient réellement les dégâts, la Défense, l'Énergie, les PV, les PM et l'indice de puissance ;
- les objets restent présents lors d'une reconnexion au même serveur de zone.

Cette autorité est actuellement conservée en mémoire avec le personnage. La persistance durable entre redéploiements fera partie de l'étape consacrée aux comptes et à la base de données.

### Accès aux failles

Le rang d'une faille indique sa difficulté et sa puissance recommandée, mais n'interdit pas automatiquement son entrée.

Un joueur E peut tenter une faille D ou supérieure à ses risques et périls. L'interface doit afficher clairement :

- le rang de la faille ;
- la puissance recommandée ;
- la puissance actuelle du joueur ;
- un avertissement lorsque le danger est très supérieur à ses capacités.

Les récompenses nécessitent une participation réelle afin d'éviter qu'un joueur trop faible soit récompensé en restant inactif dans un groupe.

## 3. Début du jeu

- Le personnage commence au niveau général 1.
- Il est Aventurier de rang E.
- Il combat initialement au corps-à-corps avec son attaque principale, sans compétence active.
- Il progresse dans les premières zones, entraîne ses statistiques et apprend le fonctionnement du jeu.
- Lorsqu'il remplit les conditions de niveau et de puissance du rang D, il choisit définitivement sa voie de combat.

## 4. Éléments — décision actuelle

Les éléments Feu, Eau, Lumière et Ténèbres ont été envisagés puis retirés du système fondamental. Aucun système élémentaire n'est actuellement validé.

Les identités des classes reposeront d'abord sur leurs armes, leurs rôles, leurs compétences et leurs effets. Des thèmes comme le feu, la lumière ou les ténèbres pourront exister visuellement ou narrativement sans constituer obligatoirement des statistiques ou une roue de forces et faiblesses.

## 5. Classes évolutives liées aux rangs

Le système de SP et le niveau distinct de Perfectionnement sont abandonnés. La classe évolue directement lorsque le joueur obtient un nouveau rang.

| Rang | Corps-à-corps | Distance | Magie |
| --- | --- | --- | --- |
| E | Aventurier | Aventurier | Aventurier |
| D | Épéiste | Archer | Magicien |
| C | Chevalier | Rôdeur | Sorcier |
| B | Champion | Tireur d'élite | Arcaniste |
| A | Maître-lame | Maître-archer | Archimage |
| S | Souverain des Lames | Souverain de l'Arc | Souverain des Arcanes |

### Choix permanent au rang D

Lorsque l'Aventurier devient admissible au rang D, il choisit définitivement Corps-à-corps, Distance ou Magie. Il devient alors Épéiste, Archer ou Magicien.

Au moment du choix :

- l'entraînement offensif provisoire de Corps-à-corps gagné comme Aventurier est retiré ;
- son XP d'entraînement provisoire de Corps-à-corps est remise à zéro ;
- la Défense entraînée est conservée ;
- l'Énergie et les valeurs provenant du niveau général sont conservées ;
- le joueur reçoit une seule fois 25 points dans la maîtrise offensive choisie.

L'interface doit présenter clairement les trois styles et demander une confirmation explicite, car le choix est irréversible pour ce personnage.

### Évolutions suivantes

À partir du rang C, la voie suit une chaîne linéaire : aucun nouveau choix de branche n'est demandé. Chaque promotion fait automatiquement évoluer la classe vers sa forme supérieure.

Chaque évolution apporte :

- une nouvelle identité visuelle ;
- de nouvelles compétences plus puissantes ;
- un bonus passif propre à la classe ;
- l'accès aux équipements du nouveau rang.

Toutes les anciennes compétences restent disponibles. Les nouvelles peuvent infliger davantage de dégâts ou produire des effets plus puissants, mais leur coût en mana et leur temps de recharge peuvent être supérieurs afin que les anciennes compétences conservent une utilité.

Le joueur compose une barre de quatre emplacements au maximum à partir de toutes les compétences débloquées.

Les rangs SS, SSS et Oméga ne changent pas encore le nom de la classe S. Ils représenteront provisoirement des Ascensions du Souverain, avec améliorations de compétences, bonus et apparence. Leur fonctionnement détaillé sera conçu plus tard.

## 6. Combat — direction actuelle

Le jeu utilise un combat 2D en temps réel adapté au mobile.

### Déplacement et ciblage

- Le monde utilise un déplacement par cases.
- Le joueur touche une case du sol pour y déplacer son personnage.
- Le jeu calcule un chemin sur la grille et contourne les cases bloquées par le décor.
- La première implémentation utilise des déplacements orthogonaux entre cases voisines ; cette règle pourra être réévaluée après les tests de sensation de jeu.
- Il n'existe pas de bouton d'esquive dans la première version.
- Toucher un monstre le sélectionne comme cible.
- Le personnage calcule automatiquement le chemin nécessaire pour atteindre sa portée d'attaque.
- Une classe de Corps-à-corps s'approche jusqu'à être au contact puis attaque.
- Une classe Distance ou Magie s'approche uniquement jusqu'à sa portée maximale utile.
- Si la cible est déjà à portée, le personnage ne se déplace pas et attaque depuis sa position actuelle.
- Le suivi doit utiliser la position actuelle de la cible et réévaluer correctement la portée afin d'éviter que le personnage et le monstre tournent l'un autour de l'autre.
- Si la cible se déplace, le chemin et la case d'attaque doivent être recalculés sans forcer un personnage déjà à portée à se rapprocher davantage.

L'attaque principale se déclenche automatiquement sur la cible valide une fois à portée. Les compétences équipées sont activées manuellement.

### Comportement des monstres

Tous les monstres ne sont pas agressifs. Le comportement dépend de leur type :

- passif : n'attaque jamais en premier ;
- défensif : riposte lorsqu'il est attaqué ;
- agressif : détecte et poursuit le joueur dans une zone définie.

Lorsqu'ils ne combattent pas, les monstres patrouillent périodiquement dans un petit rayon autour de leur point d'apparition. Une poursuite interrompue les fait revenir vers cette zone avant de reprendre leur patrouille.

Les distances de détection, de poursuite, d'abandon et d'attaque devront être configurables par type de monstre.

### Compétences

- L'Aventurier de rang E ne possède aucune compétence active.
- Il combat seulement avec son attaque principale de Corps-à-corps.
- Les compétences sont débloquées lors du passage au rang D et du choix entre Épéiste, Archer et Magicien.
- Le joueur peut équiper au maximum quatre compétences.
- Les quatre emplacements sont placés en bas et au centre de l'écran.
- La barre doit rester compacte afin de préserver la visibilité du monde sur mobile.

### Orientation et interface

- Le jeu doit fonctionner en portrait et en paysage.
- L'expérience principale et l'interface sont optimisées en priorité pour le paysage.
- L'interface doit utiliser le moins d'espace permanent possible.
- Inventaire, équipement, statistiques et autres panneaux sont regroupés dans un menu compact.
- Toucher le bouton du menu déroule les catégories disponibles ; le joueur choisit ensuite le panneau à ouvrir.
- Les panneaux secondaires doivent pouvoir se refermer rapidement et ne pas masquer inutilement le combat.
- Le panneau d'équipement utilise un mannequin central et quatre slots spatiaux clairement identifiés.
- Les statistiques montrent pour chaque valeur le détail Base, Combat, Équipement et la progression d'entraînement.
- Un butin ramassé automatiquement affiche pendant quelques secondes son icône, son nom et sa quantité juste au-dessus de la barre de compétences.
- Une rotation portrait-paysage doit redimensionner le canvas à la taille exacte de l'écran sans étirer l'image ni conserver l'ancienne orientation.

### Monde et contenu initial

Le premier prototype doit prévoir une petite ville, une zone extérieure, plusieurs types de monstres, de l'XP générale, de l'XP d'entraînement, du butin, de l'équipement, un inventaire, des statistiques, un boss et une première faille. Les valeurs précises pourront être proposées pendant l'implémentation puis ajustées après test.

## 7. Fonctionnement MMO et test mobile

Le multijoueur fait partie de la fondation du projet et non d'une conversion prévue seulement à la fin.

### Première architecture jouable

- les joueurs connectés à la même zone partagent un même état de monde et peuvent se voir se déplacer ;
- le client envoie des intentions de déplacement, de ciblage et d'utilisation de compétence ;
- le serveur de zone valide les positions, les combats, les dégâts, les monstres, l'XP, le butin, l'inventaire et l'équipement, puis diffuse des instantanés du monde ;
- les monstres appartiennent au monde partagé : leur position, leur comportement et leurs PV doivent être cohérents entre les joueurs ;
- la première tranche peut utiliser un serveur de zone en mémoire pour valider rapidement les sensations de jeu ;
- si la connexion au monde partagé échoue, une simulation locale permet tout de même de tester le déplacement, le ciblage, le combat et l'interface depuis Vercel.

Cette solution locale est un filet de test, pas le mode MMO final. La persistance durable des personnages, l'authentification, la reprise après redémarrage, la communication entre plusieurs instances serveur et la protection renforcée contre la triche nécessiteront ensuite une base de données et une infrastructure partagée.

### Contraintes de synchronisation

- le serveur reste l'autorité sur les résultats importants ;
- les commandes tactiles doivent paraître immédiates malgré le réseau ;
- les autres joueurs et monstres doivent se déplacer de manière fluide entre deux mises à jour serveur ;
- une reconnexion ne doit pas créer de doublon ni effacer la progression persistée ;
- les messages réseau doivent rester compacts pour fonctionner correctement sur une connexion mobile.

Les fonctions sociales complètes — compte permanent, pseudonyme réservé, chat, groupes, guildes, échanges et matchmaking — font partie des étapes ultérieures et ne doivent pas bloquer la première zone jouable.

## 8. Première tranche jouable

La première tranche a pour objectif de permettre, sur téléphone comme sur ordinateur :

1. d'ouvrir le jeu depuis l'URL Vercel ;
2. d'arriver Aventurier E niveau 1 dans une petite ville ;
3. de se déplacer sur la grille en touchant le sol ;
4. de quitter la ville pour une zone extérieure ;
5. de rencontrer des monstres passifs, défensifs et agressifs ;
6. de toucher un monstre afin de l'approcher automatiquement jusqu'à la portée correcte et de lancer l'attaque principale ;
7. de gagner de l'XP générale et de l'XP d'entraînement séparées ;
8. de recevoir du butin, de l'ajouter à l'inventaire et d'équiper les objets compatibles ;
9. de consulter ses statistiques, son équipement et son inventaire dans le menu compact ;
10. d'affronter un boss et de repérer ou d'ouvrir une première faille ;
11. de voir au minimum les déplacements des autres joueurs présents dans la même zone lorsque le serveur MMO est disponible.

Dans cette tranche, les quatre emplacements de compétence sont visibles mais verrouillés pour l'Aventurier. Le passage au rang D et le choix de voie peuvent être introduits dès que la boucle de base est stable.

## 9. Roadmap de développement

### Étape 1 — Socle jouable actuel

- carte sur grille, collisions, caméra et commandes tactiles ;
- ville, zone extérieure et direction pixel art originale ;
- ciblage, déplacement automatique à portée et attaque principale ;
- comportements passif, défensif et agressif des monstres ;
- PV, PM, niveau, XP, butin, inventaire, équipement et statistiques ;
- interface mobile compacte, paysage prioritaire et portrait utilisable ;
- première synchronisation multijoueur et mode de test local ;
- sauvegardes régulières du code sur GitHub et version testable sur Vercel.

### Étape 2 — Progression de rang D

- formule définitive de l'indice de puissance et seuils E/D ;
- présentation et confirmation du choix irréversible Épéiste, Archer ou Magicien ;
- conversion de l'entraînement provisoire de l'Aventurier et attribution des 25 points ;
- premières compétences actives, portée propre à chaque voie, mana et temps de recharge ;
- premier équipement D et première boucle complète de faille.

### Étape 3 — Monde persistant

- comptes et personnages persistants ;
- stockage durable des niveaux, maîtrises, rangs, objets et équipement ;
- reprise après déconnexion et synchronisation entre instances ;
- règles anti-abus pour l'entraînement et validation serveur renforcée ;
- chat, groupes et participation équitable aux récompenses.

### Étape 4 — Progression longue et contenu

- seuils et épreuves des rangs C, B, A et S ;
- évolutions de classe, passifs et nouvelles compétences conservant les anciennes ;
- failles de plusieurs rangs, boss, tables de butin et équipements correspondants ;
- Ascensions SS, SSS et Oméga ;
- nouvelles régions, activités MMO, économie, guildes et événements ;
- équilibrage continu de la progression ouverte au-delà du rang Oméga.

## 10. Points encore à équilibrer

Les fondations sont suffisamment définies pour construire et tester. Les sujets suivants restent volontairement ajustables :

1. les formules exactes transformant les cinq statistiques en PV, PM, dégâts, réduction et indice de puissance ;
2. les courbes séparées d'XP générale et de chaque maîtrise entraînée ;
3. les règles précises contre l'entraînement artificiel ou automatique abusif ;
4. les niveaux minimums et indices de puissance correspondant aux rangs D à Oméga ;
5. les récompenses non statistiques de chaque rang : titres, coffres, contrats et effets visuels ;
6. les compétences et bonus passifs détaillés de chaque classe, du rang D au rang S ;
7. l'épreuve narrative permettant de choisir sa première voie ;
8. les détails des Ascensions SS, SSS et Oméga ;
9. le rythme exact des trente premières minutes et l'équilibrage des commandes en portrait.

## 11. État du projet

- Phase actuelle : première tranche jouable en cours d'implémentation.
- État du 14 juillet 2026 : interface équipement/statistiques refondue, butin lisible, mort et réapparition jouables, monstres en patrouille, équipement autoritaire actif et rotation mobile corrigée.
- Les fondations validées sont le déplacement tactile sur cases, le combat automatique à portée, les cinq statistiques, les rangs liés à la puissance et au niveau minimum, les trois voies permanentes, l'interface mobile compacte et l'intégration MMO progressive.
- Les valeurs d'équilibrage provisoires peuvent être modifiées après les essais sans changer ces fondations.
- Chaque version stable doit être enregistrée sur GitHub et rendue testable sur Vercel afin que le projet reste accessible depuis mobile.
- Ce document reste la référence centrale et doit être actualisé après chaque décision majeure.

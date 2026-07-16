# Document de conception du jeu

> Document central du projet. Toute décision validée doit être ajoutée ici. Les anciens calculs concernant les rangs et les milliers de points de SP ont été abandonnés le 14 juillet 2026 afin de repartir sur une base plus simple.

## 1. Vision actuelle

Le projet est un MMORPG 2D en temps réel principalement pensé pour mobile et joué obligatoirement en **orientation paysage**. Le niveau général est conçu comme une progression ouverte, sans plafond final fixe : les niveaux deviennent progressivement plus longs à obtenir, même après le dernier rang. Le jeu combine :

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
- composition de l'interface conçue uniquement pour le format paysage ; en portrait, le jeu demande de tourner l'appareil au lieu de déformer ou de réorganiser l'écran de jeu.
- interface nocturne moderne à dominante ardoise, avec accents jade pour les actions, bleu pour le mana et or pour la monnaie ; les panneaux emploient une hiérarchie nette et des contrastes lisibles au lieu de l'ancien empilement de cartes de prototype.

## 2. Progression générale du joueur

Le personnage possède un niveau général et six statistiques universelles. Il n'attribue plus manuellement des points à chaque niveau : les statistiques progressent automatiquement et, pour certaines, grâce à leur propre entraînement au combat.

| Statistique | Fonction actuelle |
| --- | --- |
| Corps-à-corps | Augmente les dégâts des attaques et compétences de mêlée |
| Distance | Augmente les dégâts des attaques et compétences à distance |
| Magie | Augmente les dégâts des sorts |
| Défense | Réduit les dégâts reçus |
| Énergie | Augmente les points de vie et les points de mana |
| Vitesse | Détermine la vitesse de déplacement du personnage |

### Valeurs de départ et progression générale

Le personnage commence Aventurier niveau général 1 avec :

- 1 en Corps-à-corps ;
- 1 en Distance ;
- 1 en Magie ;
- 1 en Défense ;
- 1 en Énergie ;
- 100 en Vitesse.

À chaque niveau général gagné, il reçoit automatiquement :

- +1 en Corps-à-corps de base ;
- +1 en Distance de base ;
- +1 en Magie de base ;
- +1 en Défense de base ;
- +1 en Énergie de base.

La Vitesse suit une règle séparée : elle commence à **100**, gagne **+1 tous les 10 niveaux généraux** et ne peut jamais dépasser **300**. Sa valeur issue du niveau est donc :

**Vitesse = min(300, 100 + partie entière du niveau général / 10)**

Exemples : niveau 1 = 100, niveau 10 = 101, niveau 100 = 110 et niveau 2 000 = 300. Dans la décision actuelle, la Vitesse ne possède pas d'XP d'entraînement au combat.

La Vitesse agit réellement sur le déplacement autoritaire. La cadence de départ reste de 200 ms par case à 100 en Vitesse, puis suit la formule **intervalle par case = 20 000 / Vitesse**. À 300, le délai théorique est donc d'environ 66,7 ms par case. Le serveur conserve les fractions de temps entre ses ticks afin que même un passage de 100 à 101 produise progressivement un gain réel au lieu d'être annulé par l'arrondi.

L'Énergie de base, et donc la progression principale des PV et des PM, augmente uniquement grâce au niveau général. Elle ne possède pas d'expérience d'entraînement au combat dans le système actuel. Les équipements peuvent toutefois lui ajouter un bonus séparé tant qu'ils sont portés.

### Entraînement indépendant des statistiques

Corps-à-corps, Distance, Magie et Défense peuvent également progresser en étant utilisés :

- attaquer au contact et infliger réellement des dégâts accorde de l'XP d'entraînement de Corps-à-corps, quels que soient le niveau du joueur et celui du monstre ;
- attaquer à distance et infliger réellement des dégâts accordera de l'XP d'entraînement de Distance selon la même règle, sans blocage lié au niveau de la cible ;
- utiliser une attaque magique qui inflige réellement des dégâts accordera de l'XP d'entraînement de Magie selon la même règle ;
- recevoir des dégâts accorde de l'XP d'entraînement de Défense, quels que soient le niveau du joueur et celui du monstre ;
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

### Entraînement sans pénalité de niveau et protection future

Une créature de niveau inférieur continue volontairement à faire progresser les maîtrises : aucune comparaison de niveau ne supprime l'XP de Corps-à-corps, Distance, Magie ou Défense. Cette règle permet au joueur d'entraîner longtemps la statistique réellement utilisée sans que l'ancien contenu devienne totalement inutile.

Les protections futures contre l'automatisation ne devront donc pas reposer sur le niveau du monstre. Elles pourront contrôler la réalité des dégâts, la cadence maximale des actions, l'activité du joueur et les comportements répétitifs anormaux, sans retirer l'XP d'un combat normal contre une cible faible.

### Rangs officiels et indice de puissance

Les rangs appartiennent au joueur et représentent sa puissance globale. **L'Aventurier commence sans aucun rang** : l'interface ne doit donc afficher ni « rang E » ni bonus de rang avant son éveil officiel.

Le niveau général 10 débloque seulement le droit de se présenter au QG de la ville. Atteindre ce niveau ne donne automatiquement ni classe ni rang. Le joueur doit parler au PNJ du QG, accomplir son éveil et confirmer définitivement sa voie Corps-à-corps, Distance ou Magie. Il devient alors Épéiste, Archer ou Magicien et reçoit son premier rang officiel, **E**.

Ordre actuel :

**E → D → C → B → A → S → SS → SSS → Ω Oméga**

Après cet éveil initial, chaque promotion vers D puis les rangs supérieurs possède deux conditions distinctes :

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

Le rang E commence donc uniquement après l'éveil au QG, jamais pendant les niveaux d'Aventurier non classé. Les niveaux minimums et indices de puissance requis pour les promotions D à Oméga restent à équilibrer.

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
| Sans rang | ×1 |
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

Les objets d'apprentissage explicitement marqués **sans rang** peuvent être utilisés par l'Aventurier avant son éveil. Un équipement de rang E exige que l'éveil au QG soit terminé, même si le joueur a déjà atteint le niveau 10.

Exemples :

- équipement D utilisable à partir du rang D ;
- équipement S utilisable à partir du rang S ;
- équipements SS, SSS et Oméga réservés aux rangs correspondants.

Un objet de haut rang obtenu en avance devient ainsi un objectif visible pour le joueur.

Important : les bonus directs accordés par le rang ne doivent pas être inclus dans l'indice utilisé pour obtenir le rang suivant. Autrement, une promotion pourrait augmenter automatiquement l'indice et déclencher une chaîne de promotions sans nouvelle progression réelle. En revanche, les statistiques réellement gagnées ensuite et les nouveaux équipements équipés comptent normalement dans l'indice.

### Inventaire et équipement autoritaires de la première tranche

L'inventaire et l'équipement partagent désormais **une seule fenêtre**, sans onglet interne séparant les deux vues. Son organisation s'inspire de la lisibilité fonctionnelle des inventaires de MMORPG sans reprendre leurs graphismes :

- à gauche, un mannequin du personnage entouré de six emplacements placés près de la partie du corps correspondante : **Coiffe, Armure, Pantalon, Bottes, Anneau et Arme/Corps-à-corps** ;
- au centre, une vraie grille carrée de vingt emplacements minimum, la capacité utilisée, le portefeuille d'or et quatre filtres immédiatement accessibles : **Tout, Équipements, Consommables et Ressources** ;
- à droite, une fiche d'objet persistante qui ne déforme pas la grille et indique au minimum son nom, son type, sa quantité, sa description, ses bonus ou effets, son rang requis et l'action disponible, par exemple Équiper, Retirer ou Utiliser ;
- l'objet porté apparaît sur le slot correspondant autour du mannequin afin que le changement soit immédiatement visible.

Les trois zones doivent tenir côte à côte dans la zone sûre de l'écran paysage. Les emplacements vides restent visibles et identifiables, et la grille initiale complète ne doit pas cacher sa dernière rangée. La fenêtre ne doit pas obliger le joueur à ouvrir une page d'équipement distincte.

La première tenue de test remplit les six emplacements avec une coiffe, une dague, une tunique, un pantalon, des bottes d'aventurier et un anneau de cuivre. Les monstres peuvent ensuite donner des objets plus puissants, par exemple la Coiffe du Sanglier ou la Lame-croc de faille.

L'inventaire et l'équipement appartiennent au joueur autoritaire de la zone :

- le serveur vérifie que l'objet est réellement possédé ;
- il vérifie le type d'objet, le slot et le rang minimal ;
- remplacer un objet conserve l'ancien dans l'inventaire ;
- les bonus portés modifient réellement les dégâts, la Défense, l'Énergie, les PV, les PM et l'indice de puissance ;
- un consommable utilisable est validé par l'autorité du monde avant d'appliquer son effet et de diminuer sa quantité ; la petite potion de départ rend actuellement 35 PV sans pouvoir être gaspillée lorsque les PV sont déjà au maximum ;
- les objets restent présents lors d'une reconnexion au même serveur de zone.

Cette autorité est conservée par le serveur de zone pendant la session. Le prototype possède en plus une sauvegarde locale versionnée du personnage dans le navigateur : niveau, XP générale, maîtrises, PV, PM, position extérieure, inventaire, équipement et or. Les anciennes sauvegardes `v2` sans champ d'or restent compatibles et démarrent à zéro. Cette sauvegarde permet de reprendre la progression sur le même appareil en mode local ou hors ligne. Un garde anti-régression empêche qu'un personnage en ligne recréé au niveau 1 après la perte d'un serveur en mémoire écrase silencieusement une sauvegarde locale plus avancée. Une sauvegarde MMO sécurisée, partagée entre appareils et résistante aux redéploiements nécessitera toujours un compte et une base de données serveur.

### Accès aux failles

Le rang d'une faille indique sa difficulté et sa puissance recommandée, mais n'interdit pas automatiquement son entrée.

Un joueur E peut tenter une faille D ou supérieure à ses risques et périls. L'interface doit afficher clairement :

- le rang de la faille ;
- la puissance recommandée ;
- la puissance actuelle du joueur ;
- un avertissement lorsque le danger est très supérieur à ses capacités.

Les récompenses nécessitent une participation réelle afin d'éviter qu'un joueur trop faible soit récompensé en restant inactif dans un groupe.

### Cycle des failles dynamiques

- Le Val d’Aube étendu possède six emplacements de portail stables, un pour chacun des rangs **E, D, C, B, A et S**. Un monde neuf crée immédiatement ces six failles afin que toute la progression soit visible et testable.
- Après la fermeture ou l’expiration d’un portail, les apparitions suivantes utilisent provisoirement un intervalle aléatoire de 15 à 45 minutes et un maximum de six failles simultanées. Le système recrée en priorité un rang absent avant de dupliquer un rang déjà actif.
- Une faille reste ouverte pendant **24 heures réelles** à partir de son apparition.
- Si elle n'est pas fermée avant l'échéance, son Gardien sort dans le monde ouvert, devient agressif et attaque les joueurs proches.
- Dans ce cas, le Gardien extérieur doit d'abord être vaincu, puis l'intérieur de la faille doit encore être terminé pour la refermer définitivement.
- Si l'échéance survient pendant une instance, le joueur est renvoyé dans le monde ouvert. Le serveur refuse également toute fermeture tardive tant que le Gardien extérieur est vivant : terminer l'intérieur ne peut jamais le supprimer ni contourner cette étape.
- Une faille terminée disparaît immédiatement. Elle n'entre dans aucun temps de recharge d'une heure et ne peut pas être relancée ; une nouvelle faille apparaîtra plus tard à un emplacement disponible.
- En mode local ou hors ligne, le cycle est sauvegardé séparément dans un format `v2` : rangs, identifiants, positions, dates d'apparition et d'expiration, prochaine apparition planifiée ainsi que position et PV d'un Gardien échappé. Les anciennes sauvegardes de failles `v1` de rang E migrent sans réinitialiser leurs dates ni leur boss extérieur. Si elles contenaient plusieurs failles E, ces portails historiques sont conservés pendant que D à S sont ajoutées : le monde peut monter temporairement à huit portails, puis revient naturellement à la limite normale de six à mesure que ces doublons sont résolus.
- Le monde partagé en ligne utilise encore un royaume en mémoire dans cette tranche. Ses failles restent cohérentes tant que ce royaume vit, mais une persistance réelle après redémarrage ou redéploiement attend la base de données MMO.

### Failles E à S jouables

Chaque rang réutilise la même logique d’instance individuelle à trois salles reliées, avec des noms de créatures, niveaux, PV, Défense, dégâts, cadence, XP et récompenses qui augmentent selon le rang :

1. une première vague de créatures distordues ;
2. une deuxième vague plus dangereuse ;
3. le Gardien de la Brèche.

Chaque salle verrouille la progression vers la suivante tant que ses monstres sont vivants. Après une vague, le joueur avance physiquement dans le couloir jusqu'à la salle suivante. Vaincre le Gardien ferme le portail, ramène automatiquement le personnage dans le monde ouvert et ouvre une fenêtre récapitulative indiquant :

- le rang exact du portail terminé ;
- l'XP générale totale gagnée dans le portail, bonus final compris ;
- les équipements et ressources récupérés ;
- le temps total passé à l'intérieur.

La faille E conserve sa récompense de test de trois Poussières dimensionnelles et une Lame-croc de faille. Les rangs D à S possèdent leurs propres multiplicateurs, XP de fermeture et quantités garanties. Toutes ces valeurs restent équilibrables après les tests de combat.

### Carte et journal des failles

Le menu compact possède une entrée **Carte des failles** séparée de l'Inventaire et des Statistiques. Cette vue paysage montre la position extérieure du joueur et chaque portail actif. Toucher un marqueur affiche son rang, sa position, son âge, son temps restant et son état. Un bouton **Journal** liste les portails détectés et signale clairement les failles dont le boss s'est échappé.

## 3. Début du jeu

- Le personnage commence au niveau général 1.
- Il est **Aventurier sans rang** et le reste tant qu'il n'a pas atteint le niveau 10 puis accompli son éveil au QG.
- Il combat initialement au corps-à-corps avec son attaque principale, sans compétence active.
- Il progresse dans les premières zones, entraîne ses statistiques et apprend le fonctionnement du jeu.
- Au niveau 10, il peut parler au PNJ du QG et choisir définitivement sa voie : Épéiste, Archer ou Magicien. Ce choix lui attribue sa première classe et son rang E ; il n'est jamais appliqué automatiquement au passage de niveau.

## 4. Éléments — décision actuelle

Les éléments Feu, Eau, Lumière et Ténèbres ont été envisagés puis retirés du système fondamental. Aucun système élémentaire n'est actuellement validé.

Les identités des classes reposeront d'abord sur leurs armes, leurs rôles, leurs compétences et leurs effets. Des thèmes comme le feu, la lumière ou les ténèbres pourront exister visuellement ou narrativement sans constituer obligatoirement des statistiques ou une roue de forces et faiblesses.

## 5. Classes évolutives liées aux rangs

Le système de SP et le niveau distinct de Perfectionnement sont abandonnés. L'Aventurier n'est pas une classe de rang E : il constitue la phase d'apprentissage **sans rang**. La première classe est choisie pendant l'éveil au QG à partir du niveau 10.

| Étape validée | Corps-à-corps | Distance | Magie |
| --- | --- | --- | --- |
| Avant l'éveil, sans rang | Aventurier | Aventurier | Aventurier |
| Éveil au QG, premier rang E | Épéiste | Archer | Magicien |
| Évolutions intermédiaires | Chevalier, Champion, Maître-lame… | Rôdeur, Tireur d'élite, Maître-archer… | Sorcier, Arcaniste, Archimage… |
| Rang S | Souverain des Lames | Souverain de l'Arc | Souverain des Arcanes |

L'association exacte de chaque évolution intermédiaire aux rangs D, C, B et A devra être repositionnée sans modifier l'ordre de progression déjà retenu. Aucune classe intermédiaire supplémentaire ne doit être inventée sans nouvelle validation.

### Éveil au QG et choix permanent

À partir du niveau général 10, l'Aventurier peut accomplir son éveil au QG. Il choisit définitivement Corps-à-corps, Distance ou Magie, devient Épéiste, Archer ou Magicien et obtient le rang E.

Au moment du choix :

- l'entraînement offensif provisoire de Corps-à-corps gagné comme Aventurier est retiré ;
- son XP d'entraînement provisoire de Corps-à-corps est remise à zéro ;
- la Défense entraînée est conservée ;
- l'Énergie et les valeurs provenant du niveau général sont conservées ;
- le joueur reçoit une seule fois 25 points dans la maîtrise offensive choisie.

L'interface doit présenter clairement les trois styles et demander une confirmation explicite, car le choix est irréversible pour ce personnage.

### Évolutions suivantes

Après l'éveil et le rang E, la voie suit une chaîne linéaire : aucun nouveau choix de branche n'est demandé. Chaque promotion concernée fait automatiquement évoluer la classe vers sa forme supérieure.

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

Les **Slimes sont des monstres neutres/défensifs** : ils ne commencent pas le combat, mais dès qu'un joueur leur inflige une attaque valide, ils ciblent cet attaquant, le poursuivent si nécessaire et ripostent jusqu'à la fin ou l'abandon normal du combat. Ils ne doivent donc jamais rester immobiles sans répondre après avoir été frappés.

Lorsqu'ils ne combattent pas, les monstres patrouillent périodiquement dans un petit rayon autour de leur point d'apparition. Une poursuite interrompue les fait revenir vers cette zone avant de reprendre leur patrouille.

Les distances de détection, de poursuite, d'abandon et d'attaque devront être configurables par type de monstre.

### Compétences

- L'Aventurier sans rang ne possède aucune compétence active.
- Il combat seulement avec son attaque principale de Corps-à-corps.
- Les premières compétences sont débloquées lors de l'éveil au QG, à partir du niveau 10, et du choix entre Épéiste, Archer et Magicien.
- Le joueur peut équiper au maximum quatre compétences.
- Les quatre emplacements sont placés en bas et au centre de l'écran.
- La barre doit rester compacte afin de préserver la visibilité du monde sur mobile.

### Régénération hors combat

- Un personnage vivant récupère **2 PV par seconde hors combat**, sans dépasser ses PV maximums.
- Donner ou recevoir une attaque remet immédiatement le délai hors combat à zéro.
- Le premier soin de **+1 PV** apparaît exactement deux secondes après la dernière attaque donnée ou reçue. Les soins suivants rendent +1 toutes les 500 ms : la vie monte donc visiblement de 1 en 1 tout en totalisant 2 PV par seconde.
- Un tick serveur retardé ne regroupe jamais plusieurs soins dans une hausse visible : au retour d’un onglet suspendu, un seul `+1` est appliqué, puis le rythme normal de 500 ms reprend.
- Un personnage mort ne se régénère jamais. Sa régénération reprend normalement après sa réapparition.

### Orientation et interface

- Le jeu se joue **uniquement en paysage** à compter de cette décision.
- En portrait, un écran simple demande au joueur de tourner son téléphone ; les commandes de jeu et les panneaux ne doivent pas être utilisables tant que l'appareil n'est pas revenu en paysage.
- Le passage portrait-paysage doit restaurer immédiatement un canvas à la taille exacte du nouvel écran, sans étirement ni conservation d'une mauvaise taille.
- La caméra de jeu utilise **85 %** du zoom paysage précédent afin de montrer davantage du monde sur téléphone comme sur ordinateur, sans réduire l'interface HTML.
- Les surfaces permanentes du HUD touchent les bords physiques de l’écran. Sur iPhone, seul leur contenu utile est décalé par `safe-area-inset-*` afin que la Dynamic Island, l’encoche et l’indicateur Home ne masquent ni texte ni bouton.
- La carte compacte du joueur occupe le coin supérieur gauche avec une identité courte ; Puissance touche le bord supérieur droit, les compétences le bord inférieur et le menu le coin inférieur droit.
- L'interface doit utiliser le moins d'espace permanent possible.
- Le menu compact propose des entrées distinctes. **Inventaire** ouvre la fenêtre combinée Inventaire + Équipement ; **Statistiques** ouvre uniquement les statistiques ; **Carte des failles** ouvre la carte et son journal.
- Une fenêtre ne contient pas les onglets permettant de basculer vers l'autre : le joueur ferme la fenêtre actuelle puis choisit lui-même une autre entrée du menu.
- Les panneaux secondaires doivent pouvoir se refermer rapidement et ne pas masquer inutilement le combat.
- La fenêtre Inventaire + Équipement place le mannequin et ses six slots à gauche, la grille filtrable et le portefeuille au centre, puis la fiche de l'objet sélectionné à droite.
- La fenêtre Statistiques est une vue séparée, compacte et fixe. Les six statistiques — Corps-à-corps, Distance, Magie, Défense, Énergie et Vitesse — doivent toutes tenir simultanément dans la hauteur disponible en paysage, **sans aucun défilement**.
- Chaque statistique occupe une ligne entière, les unes sous les autres, avec les colonnes **Base, Combat, Équipement et Total** dans cet ordre. Les statistiques entraînables montrent aussi leur progression d'entraînement ; la Vitesse montre sa valeur, sa prochaine augmentation liée au niveau et le plafond 300.
- L’XP apparaît dans un toast compact en haut-centre. Le butin affiche séparément son icône, son nom et sa quantité dans cette même zone haute ; il n’est jamais dupliqué au milieu de l’écran ni placé au-dessus de la barre de compétences.

### Monde et contenu initial

Le Val d’Aube mesure désormais **112 × 72 cases**. La ville d’origine reste à l’ouest et six régions reliées matérialisent la montée de difficulté : Prairies éveillées E, Bois d’Ambre D, Marais de Cendre C, Plateaux Brisés B, Lande de l’Éclipse A et Frontière Abyssale S.

La première population extérieure comprend quinze créatures, avec au moins dix espèces ou variantes distinctes. Les zones supérieures ajoutent notamment Warg d’Ambre, Scarabée résineux, Gélatine de cendre, Molosse de cendre, Sanglier de basalte, Traqueur des plateaux, Spectre d’éclipse, Gélatine du vide, Gueule abyssale et Sentinelle abyssale. Leurs PV, dégâts, Défense, comportement, XP, détection et butin augmentent avec l’éloignement. Les ressources propres aux nouvelles zones sont Résine d’Ambre, Cendre de mana, Cœur de basalte, Éclat d’éclipse et Fragment abyssal.

## 7. Fonctionnement MMO et test mobile

Le multijoueur fait partie de la fondation du projet et non d'une conversion prévue seulement à la fin.

### Première architecture jouable

- les joueurs connectés à la même zone partagent un même état de monde et peuvent se voir se déplacer ;
- le client envoie des intentions de déplacement, de ciblage et d'utilisation de compétence ;
- le serveur de zone valide les positions, les combats, les dégâts, les monstres, l'XP, le butin, l'inventaire et l'équipement, puis diffuse des instantanés du monde ;
- les monstres appartiennent au monde partagé : leur position, leur comportement et leurs PV doivent être cohérents entre les joueurs ;
- la première tranche peut utiliser un serveur de zone en mémoire pour valider rapidement les sensations de jeu ;
- si la connexion au monde partagé échoue, une simulation locale permet tout de même de tester le déplacement, le ciblage, le combat, les failles et l'interface depuis Vercel ;
- le menu permet aussi de choisir volontairement **En ligne** ou **Hors ligne**. En hors ligne, le moteur local démarre immédiatement et n'attend aucun serveur de monde.

Après une première visite en ligne complète, l'application attend que son cache signale qu'il est prêt après avoir préchargé l'interface et tous les fichiers statiques nécessaires au moteur local. Elle peut alors être rouverte sans réseau sur le même navigateur. La sauvegarde locale est versionnée, vérifiée avant chargement, protégée contre les retours accidentels de progression et enregistrée régulièrement ainsi qu'à la fermeture de la page. Une partie interrompue au milieu d'une faille reprend volontairement depuis le dernier état extérieur sûr ; l'instance en cours n'est pas restaurée dans cette première version, mais le portail extérieur et son échéance continuent d'exister.

Cette solution locale est un mode de jeu et de test sur l'appareil, pas le mode MMO final. La sauvegarde navigateur n'est ni une autorité anti-triche ni une synchronisation entre téléphones. La persistance MMO durable, l'authentification, la reprise après redémarrage, la communication entre plusieurs instances serveur et la protection renforcée contre la triche nécessiteront une base de données et une infrastructure partagée.

### Contraintes de synchronisation

- le serveur reste l'autorité sur les résultats importants ;
- les commandes tactiles doivent paraître immédiates malgré le réseau ;
- les autres joueurs et monstres doivent se déplacer de manière fluide entre deux mises à jour serveur ;
- une reconnexion ne doit pas créer de doublon ni effacer la progression persistée ;
- les messages réseau doivent rester compacts pour fonctionner correctement sur une connexion mobile.

Les fonctions sociales complètes — compte permanent, pseudonyme réservé, chat, groupes, guildes, échanges et matchmaking — font partie des étapes ultérieures et ne doivent pas bloquer la première zone jouable.

## 8. Première tranche jouable

La première tranche a pour objectif de permettre, sur téléphone comme sur ordinateur en orientation paysage :

1. d'ouvrir le jeu depuis l'URL Vercel ;
2. d'arriver Aventurier sans rang niveau 1 dans une petite ville ;
3. de se déplacer sur la grille en touchant le sol ;
4. de quitter la ville pour une zone extérieure ;
5. de rencontrer des monstres passifs, défensifs et agressifs ;
6. de toucher un monstre afin de l'approcher automatiquement jusqu'à la portée correcte et de lancer l'attaque principale ;
7. de gagner de l'XP générale et de l'XP d'entraînement séparées ;
8. de recevoir du butin, de l'ajouter à l'inventaire et d'équiper les objets compatibles ;
9. de consulter la fenêtre combinée Inventaire + Équipement et la fenêtre séparée Statistiques, toutes deux sans défilement structurel inutile ;
10. d’atteindre le niveau 10, parler réellement au Maître du QG et confirmer une voie irréversible donnant le rang E ;
11. d'ouvrir la carte, consulter le journal et entrer dans une faille dynamique de rang E à S ;
12. de traverser ses trois salles, vaincre le Gardien et recevoir le bilan complet du portail ;
13. de continuer à jouer en mode hors ligne et de retrouver sa sauvegarde locale sur le même appareil ;
14. de voir au minimum les déplacements des autres joueurs présents dans la même zone lorsque le serveur MMO est disponible.

Dans cette tranche, les quatre emplacements de compétence sont visibles mais verrouillés pour l'Aventurier. À partir du niveau 10, l'éveil au QG attribue le rang E et permet le choix permanent de voie.

## 9. Roadmap de développement

### Étape 1 — Socle jouable actuel

- carte sur grille, collisions, caméra et commandes tactiles ;
- ville, zone extérieure et direction pixel art originale ;
- ciblage, déplacement automatique à portée et attaque principale ;
- comportements passif, défensif et agressif des monstres ;
- PV, PM, niveau, XP, butin, inventaire, équipement et statistiques ;
- interface mobile compacte exclusivement en paysage, avec invitation à tourner l'appareil en portrait ;
- première synchronisation multijoueur et mode de test local ;
- sauvegarde locale versionnée, sélection en ligne/hors ligne et cache de l'application ;
- Maître du QG interactif, approche automatique, dialogue de niveau, choix irréversible Épéiste/Archer/Magicien et attribution autoritaire du rang E ;
- cycle de failles dynamiques E à S, carte, journal, trois salles, contenu mis à l’échelle, boss échappé et fenêtre de récompenses ;
- monde ouvert 112 × 72, six régions de difficulté et quinze créatures extérieures ;
- sauvegardes régulières du code sur GitHub et version testable sur Vercel.

### Étape 2 — Compétences et progression classée

- formule définitive de l'indice de puissance et seuil de promotion du rang D ;
- premières compétences actives, portée propre à chaque voie, mana et temps de recharge ;
- premier équipement D et équilibrage de la boucle de faille E déjà jouable.

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

1. les formules exactes transformant les six statistiques en PV, PM, dégâts, réduction, vitesse de déplacement et indice de puissance ;
2. les courbes séparées d'XP générale et de chaque maîtrise entraînée ;
3. les règles précises contre l'entraînement artificiel ou automatique abusif, sans supprimer l'XP selon le niveau de la cible ;
4. les niveaux minimums et indices de puissance correspondant aux rangs D à Oméga ;
5. les récompenses non statistiques de chaque rang : titres, coffres, contrats et effets visuels ;
6. les compétences et bonus passifs détaillés de chaque classe, du rang D au rang S ;
7. l'épreuve narrative permettant de choisir sa première voie ;
8. les détails des Ascensions SS, SSS et Oméga ;
9. le rythme exact des trente premières minutes et l'équilibrage de l'interface paysage sur les différents formats de téléphone ;
10. le nombre simultané, la fréquence d'apparition, la difficulté et les tables de récompenses finales des failles de chaque rang.

## 11. État du projet

- Phase actuelle : première tranche jouable en cours d'implémentation.
- État du 16 juillet 2026 : la première spritesheet dessinée et validée avec l'utilisateur est intégrée pour la marche latérale de l'Aventurier. Elle contient quatre images transparentes de 48 × 64 px, jouées à 8 images/s avec un ancrage bas-centre. La gauche utilise les images originales et la droite leur miroir horizontal exact dans Phaser afin de garantir une cohérence parfaite. Les directions haut et bas ainsi que l'arrêt et l'attaque restent provisoirement procéduraux jusqu'à leur validation séparée. Cette substitution ne change ni la grille, ni l'interpolation, ni les collisions autoritaires.
- État du 14 juillet 2026 : l'interface utilise un thème ardoise-jade ; la caméra paysage est dézoomée à 85 %, l'inventaire en trois zones possède une grille fixe, quatre tris et un portefeuille persistant, et les six statistiques sont alignées verticalement sans défilement. Le HUD est bord-à-bord avec protection des safe areas iPhone, tandis que l'XP et le butin apparaissent en haut de l'écran.
- Le personnage reste Aventurier non classé jusqu'au niveau 10. Le Maître du QG ouvre alors le choix définitif Épéiste, Archer ou Magicien, attribue le rang E et 25 points à la voie choisie. La régénération hors combat commence deux secondes après le dernier coup donné ou reçu et affiche `+1` toutes les 500 ms sans agréger les retards.
- Le Val d'Aube mesure désormais 112 × 72 cases, comprend six régions, quinze monstres extérieurs et des ressources croissantes. Les failles E, D, C, B, A et S sont toutes jouables en trois salles avec difficulté et récompenses propres ; leurs portails affichent leur puissance conseillée. Elles expirent après 24 heures, libèrent leur boss dans le monde si elles sont ignorées et disparaissent lorsqu'elles sont fermées. Leur cycle et les Gardiens échappés survivent aux redémarrages locaux ; le monde en ligne attend encore sa base de données persistante.
- Les fondations validées sont le déplacement tactile sur cases, le combat automatique à portée, les six statistiques dont la Vitesse, l'Aventurier sans rang avant son éveil, les rangs liés à la puissance et au niveau minimum après l'éveil, les trois voies permanentes, l'interface mobile compacte en paysage, les failles dynamiques et l'intégration MMO progressive avec solution hors ligne locale.
- Les valeurs d'équilibrage provisoires peuvent être modifiées après les essais sans changer ces fondations.
- Chaque version stable doit être enregistrée sur GitHub et rendue testable sur Vercel afin que le projet reste accessible depuis mobile.
- Ce document reste la référence centrale et doit être actualisé après chaque décision majeure.

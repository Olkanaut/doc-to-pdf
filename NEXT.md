## Contexte

Dots est un POC qui transforme des documents La Suite Docs en PDF a partir de
templates Typst. Il s'appuie sur :

- une application frontend Vite/React ;
- un backend Node/Fastify ;
- une stack locale Docs embarquee dans le depot pour le developpement ;
- un Keycloak local ;
- l'API externe Docs, notamment les documents et les templates Typst ;
- Typst pour compiler le PDF.

Le POC a ete fait pour aller vite pendant un hackathon. Il reunit dans un meme
workspace l'application, une copie locale de Docs, une configuration Keycloak et
des scripts d'orchestration. Ce n'est pas la forme cible d'un service La Suite.

## Architecture cible recommandee

Il y a deux options serieuses.

### Option A : fonctionnalite integree a Docs

C'est l'option la plus naturelle si l'export PDF template est considere comme
une fonctionnalite native de Docs.

Dans ce modele :

- les templates Typst sont un vrai domaine de Docs ;
- l'UI d'export vit dans Docs ;
- les permissions suivent directement les permissions Docs ;
- le rendu PDF est effectue par un worker ou un service interne ;
- les PDF generes peuvent etre stockes dans le S3 de Docs ou renvoyes en
  streaming ;
- il n'y a pas de nouvelle application a authentifier ni a operer.

Avantages :

- moins de surface d'integration ;
- moins de duplication d'authentification ;
- meilleure coherence produit ;
- plus facile a homologuer si Docs est deja le produit porteur.

Inconvenients :

- il faut contribuer directement au depot Docs ;
- le cycle de validation depend de l'equipe Docs ;
- le domaine Typst devient une responsabilite du produit Docs.

### Option B : service Dots separe, connecte a Docs

C'est l'option a retenir si Dots doit rester un produit autonome ou servir
plusieurs sources documentaires.

Dans ce modele :

- Dots est deploye comme service La Suite dedie ;
- Dots utilise OIDC pour authentifier l'utilisateur ;
- Dots appelle Docs via l'API `resource server` ;
- Docs reste source de verite pour les documents, medias, utilisateurs et
  permissions ;
- Dots possede uniquement son domaine propre : rendu, jobs, preferences
  d'export, eventuellement bibliotheque de templates ;
- Typst tourne dans un composant isole et limite en ressources.

Avantages :

- autonomie produit ;
- responsabilites plus nettes ;
- possibilite de faire evoluer le rendu PDF independamment de Docs.

Inconvenients :

- plus de deploiement, secrets, monitoring et surface de securite ;
- contrats API Docs a stabiliser ;
- gestion plus complexe des droits et des medias.

## Ce qu'il ne faut pas garder tel quel

Le POC actuel contient volontairement des compromis de hackathon. Pour une
version production-grade, il faudrait retirer ou refaire :

- la copie embarquee de Docs et `django-lasuite` comme dependances locales de
  demo ;
- les scripts qui lancent Keycloak, Docs, PostgreSQL, Redis et MinIO pour le
  developpement local comme s'ils etaient l'environnement cible ;
- les secrets de demo presents dans `.env.example`, meme s'ils sont acceptables
  en local ;
- les fallbacks silencieux vers `localhost` dans le code applicatif ;
- les sessions serveur en memoire ;
- le stockage local des jobs d'ingestion ;
- les appels synchrones longs pour les rendus PDF couteux ;
- tout rendu Typst non isole du processus backend principal ;
- toute dependance a un fork local de Docs qui ne serait pas upstream ou versionne
  proprement ;
- les fixtures Typst utilisees comme quasi-donnees produit.

## Chantiers metier a reprendre

Les deux zones qui portent le plus de valeur produit sont l'extraction de
gabarits depuis des documents existants et l'edition de templates. Ce sont aussi
les deux zones ou le POC a fait les compromis les plus visibles : il donne une
experience convaincante sur des cas simples, mais il ne modelise pas encore la
richesse reelle des documents administratifs.

### Extracteur PDF/DOCX

L'extracteur actuel n'est pas un gadget : il contient deja une vraie logique
d'analyse.

Ce qui existe dans le POC :

- les fichiers PDF et DOCX sont acceptes via `/api/ingest` ;
- le type est verifie sur les octets du fichier, pas seulement sur l'extension ;
- l'analyse PDF utilise PyMuPDF pour lire les textes, formes, images et zones
  visibles ;
- les elements masques par une forme opaque posterieure sont ignores, ce qui
  evite de reprendre du contenu cache ;
- le script propose des regions : en-tete, pied de page, page entiere ;
- les marges, le format de page, l'orientation, une police dominante,
  l'interligne et une couleur de titre sont deduits ;
- les fragments peuvent etre extraits en PNG ou en SVG quand la zone est
  vectorielle ;
- le DOCX est rendu par LibreOffice, puis analyse comme un PDF ;
- pour le DOCX, une copie-sonde de trois pages est generee pour observer les
  bandeaux sans corps de document ;
- le POC distingue certains cas `premiere page` / `sauf premiere page` ;
- une pagination Word simple peut etre retiree du rendu fige et reconstruite
  comme pagination dynamique Typst ;
- les erreurs previsibles sont remontees proprement : format non supporte,
  LibreOffice absent, timeout, fichier trop gros.

Ce que cela permet de prouver :

- l'utilisateur peut partir d'un document reel et obtenir rapidement une base de
  template ;
- les en-tetes et pieds de page visuels peuvent etre recuperes sans demander a
  l'utilisateur de refaire toute la charte a la main ;
- le flux PDF/DOCX -> analyse -> recadrage -> asset -> template Typst fonctionne.

Mais l'extracteur reste tres partiel.

Limites actuelles :

- le PDF est analyse uniquement sur la premiere page ;
- le DOCX ne lit que la premiere section Word ;
- les variantes pages paires / impaires sont detectees comme limite, mais pas
  reconstruites fidelement ;
- les bandeaux DOCX sont principalement recuperes comme images rasterisees, pas
  comme structure editable ;
- les styles ne sont pas reconstruits comme un systeme complet : seuls quelques
  signaux globaux sont deduits ;
- les differences de style selon les pages ne sont pas modelisees ;
- la pagination gere seulement des formes simples ;
- l'analyse ne comprend pas encore la semantique du document : logos, adresses,
  emetteur, service, reference, date, mentions legales ;
- il n'y a pas d'OCR pour les PDF scannes ;
- il n'y a pas de comparaison multi-pages pour detecter les zones constantes et
  variables ;
- les tableaux, cadres, colonnes, filigranes, tampons, signatures ou fonds de
  page ne sont pas transformes en composants reutilisables ;
- l'import IA depuis PDF existe dans l'assistant, mais il est separe du pipeline
  d'extraction structuree.

Pour une version production-grade, il faudrait refaire ce chantier comme un vrai
moteur d'analyse documentaire.

Objectif metier cible :

- importer un PDF ou DOCX administratif existant ;
- detecter automatiquement la structure de page ;
- comprendre les styles recurrents ;
- differencier premiere page, pages suivantes, pages paires, pages impaires et
  sections ;
- recuperer les elements visuels importants ;
- proposer une template editable, pas seulement une image de bandeau ;
- expliquer a l'utilisateur ce qui a ete reconnu, ce qui ne l'a pas ete, et ce
  qui doit etre valide manuellement.

Axes de reprise :

- analyse multi-pages : comparer les pages pour isoler les elements constants,
  les variations de pagination et les elements propres a la premiere page ;
- analyse DOCX approfondie : sections, styles Word, headers/footers par
  variante, champs dynamiques, images ancrees, tableaux, marges, colonnes ;
- analyse PDF avancee : detection de repetitivite, blocs textuels, formes,
  images, calques, fonds, orientation par page ;
- OCR optionnel pour les PDF scannes ;
- extraction semantique aidee par IA : classifier les elements detectes en logo,
  nom d'administration, direction, adresse, reference, date, pagination,
  mentions, signature ;
- reconstruction Typst editable : transformer ce qui peut l'etre en texte,
  blocs, styles et variables, et ne garder en image que ce qui est vraiment
  graphique ;
- gestion des variantes : premiere page differente, pages suivantes, pages
  paires/impaires, sections multiples ;
- restitution UX : montrer les hypotheses, les scores de confiance, les zones
  reconnues, les zones ignorees et les avertissements ;
- apprentissage par correction : quand l'utilisateur corrige une zone ou un
  style, reutiliser cette correction pour regenerer la template.

Definition of done specifique :

- un document de plusieurs pages ne se reduit plus a sa premiere page ;
- un DOCX avec plusieurs sections est au moins signale precisement, idealement
  reconstruit section par section ;
- une premiere page differente est geree sans rasteriser inutilement tout le
  bandeau ;
- une pagination Word simple et courante est convertie en pagination Typst ;
- les elements textuels de charte restent editables quand ils peuvent l'etre ;
- l'utilisateur voit clairement ce qui est automatique et ce qui reste a valider.

### Editeur de templates

L'editeur actuel est une bonne base UX, mais son modele est volontairement
contraint.

Ce qui existe dans le POC :

- une page d'edition unifiee autour de trois zones : reglage, apercu PDF,
  assistant IA ;
- une synchronisation entre controles visuels, source Typst et rendu PDF ;
- un mode `Mise en page` pour les utilisateurs non techniques ;
- un mode `Code` pour modifier directement le Typst ;
- un apercu compile sur une fixture dediee ;
- des reglages de page : format, orientation, marges ;
- des styles texte simples : police, taille, couleur, interligne ;
- des reglages de tableaux ;
- un constructeur d'en-tete et de pied de page ;
- des blocs empilables dans un seul `header:` ou `footer:` Typst ;
- des scopes par bloc : toutes les pages, premiere page, sauf premiere page ;
- des dispositions predefinies : image + texte, texte + image, centre,
  personnalise ;
- l'import d'images ou l'extraction d'un visuel depuis PDF/DOCX ;
- une pagination configurable dans le pied de page ;
- un assistant IA capable de proposer une source ou un patch de mise en page.

Ce que cela permet de prouver :

- un utilisateur peut produire rapidement un gabarit administratif sans ecrire de
  Typst ;
- le feedback visuel est suffisamment court pour iterer ;
- le mode code permet de depasser ponctuellement les limites du panneau.

Mais l'editeur n'est pas encore un editeur de templates complet.

Limites actuelles :

- l'utilisateur choisit parmi quelques sous-templates de blocs ;
- le placement est essentiellement lineaire et empile, pas libre ;
- il n'y a pas de canvas permettant de positionner precisement les elements sur
  la page ;
- les blocs sont limites en nombre et en structure ;
- les variantes de page sont reduites a trois scopes ;
- les styles conditionnels selon la page, la section ou le type de document ne
  sont pas modelises ;
- les variables metier ne sont pas explicites : emetteur, service, reference,
  date, signataire, adresse, logo, sceau ;
- les composants ne sont pas reutilisables comme une bibliotheque de morceaux de
  gabarit ;
- le mode code donne un controle total, mais seulement aux utilisateurs capables
  d'ecrire du Typst ;
- l'IA aide a franchir certaines limites, mais elle ne remplace pas un modele
  produit comprehensible et stable.

Pour une version production-grade, il faudrait decider si l'editeur vise :

- un editeur simple de chartes standardisees ;
- ou un vrai editeur de gabarits administratifs complet.

Si l'objectif est un editeur simple, le modele actuel peut etre durci :

- garder des blocs predefinis ;
- augmenter la qualite des presets ;
- ajouter une bibliotheque de composants officiels ;
- mieux gerer les variantes premiere page / suivantes ;
- rendre les styles plus explicites ;
- documenter clairement les limites.

Si l'objectif est un editeur complet, il faut changer de niveau d'abstraction.

Objectif metier cible pour un editeur complet :

- donner un controle total sur la page sans obliger l'utilisateur a ecrire du
  Typst ;
- permettre de creer librement des zones ;
- gerer les variantes de pages ;
- manipuler des variables metier ;
- reutiliser des composants ;
- produire un Typst maintenable, lisible et stable.

Axes de reprise :

- canvas WYSIWYG ou semi-WYSIWYG : placement libre, guides, alignements,
  grilles, verrouillage, calques ;
- composants de template : logo, bloc adresse, identite emetteur, reference,
  date, objet, signature, pagination, mentions, filigrane ;
- systeme de variables : champs utilisateur, champs document, champs
  organisation, valeurs par defaut ;
- styles globaux : tokens de couleur, typographies, espacements, styles de
  titres, styles de tableaux ;
- variantes : premiere page, pages suivantes, pages paires/impaires, derniere
  page, section specifique ;
- bibliotheque de sous-templates : en-tetes officiels, pieds de page,
  couvertures, pages de garde, annexes ;
- editeur hybride : panneau visuel pour le commun, mode avance pour le Typst,
  avec synchronisation explicite et non magique ;
- validation : avertir quand un element sort de page, se superpose, devient
  illisible ou casse la compilation ;
- historique et comparaison : voir ce qui change dans le PDF et dans le Typst ;
- droits : templates personnels, partages, organisationnels, officiels.

Definition of done specifique :

- un utilisateur non technique peut reproduire une charte administrative reelle
  sans passer par le code ;
- un utilisateur avance peut reprendre le Typst sans perdre la compatibilite avec
  l'editeur visuel ;
- les variantes de page sont visibles et testables ;
- les composants sont reutilisables entre templates ;
- l'apercu signale les erreurs de rendu, les debordements et les incoherences ;
- les templates produits restent maintenables apres plusieurs iterations.

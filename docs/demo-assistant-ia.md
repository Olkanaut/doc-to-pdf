# Démo de l'assistant IA — 2 minutes

Quatre prompts, dans cet ordre. Chacun montre une chose que le précédent ne montre pas :
la vitesse, la cohérence avec les contrôles, le garde-fou, puis la limite assumée.

## Avant de commencer

```bash
cd backend && DOTS_AI_PATCH=1 DOTS_AI_EFFORT=low npm run dev
```

Ouvre un gabarit **géré** (qui contient un bloc `// dots:layout` — tout gabarit créé depuis
l'éditeur en a un), panneau de mise en page visible à gauche, panneau Assistant ouvert à
droite. L'aperçu doit être affiché : c'est lui qui rend la démo lisible.

**Ne démarre pas sur un gabarit libre** (`republique-francaise`, `ministere`, les huit
gabarits de démonstration) : ils n'ont pas de bloc, l'assistant y réécrit la source
entière, et la réponse prend 5 s au lieu de 2.

---

## 0:00 — « Mets toutes les marges à 3 cm. »

**~2 s.** C'est tout le propos : la réponse arrive avant qu'on ait fini de lire la
question. Laisse le silence faire le travail, ne commente pas.

Mesuré 2/2, médiane 2 s.

## 0:25 — « Mets le logo 42_Logo.png dans l'en-tête, aligné à droite. »

**~3 s.** Puis **bascule sur le panneau de mise en page** : le bloc d'en-tête est là, avec
son image et sa position à droite, réglables à la main.

C'est le point le moins évident et le plus important : l'assistant n'a pas écrit du Typst
à côté des contrôles, il a écrit **dans** les contrôles. On peut continuer au clavier ou à
la souris, indifféremment, sans que l'un écrase l'autre.

Mesuré 2/2. Ce cas échouait encore hier : le prompt affirmait au modèle qu'un logo à droite
était impossible.

## 1:00 — « Mets tout le texte en blanc. »

L'assistant **obéit** — et **prévient**. Deux choses à montrer à l'écran :

- le résumé, qui nomme ce qu'on va constater (« le texte sera invisible »), pas ce qui a
  été changé ;
- l'avertissement sous la proposition, qui vient d'une mesure du PDF rendu, pas du modèle :
  *« la page est passée de X % à Y % de pixels encrés : ce qui s'y trouvait n'est plus
  visible »*.

La phrase à dire : *« la proposition est compilée pour de vrai avant d'être affichée, et
comparée au rendu d'avant. »*

Puis clique sur **Ignorer** — ça montre au passage que rien ne s'applique tout seul.

## 1:35 — « Enlève le tableau du milieu du document. »

Il **refuse, avec la raison** : le tableau est dans le document, pas dans le gabarit ;
l'assistant ne voit jamais le corps. C'est la meilleure fin possible — un outil qui sait
ce qu'il ne peut pas faire est plus crédible qu'un outil qui sait tout faire.

---

## Ce qu'il faut avoir répété

**Les deux derniers prompts n'ont pas été mesurés en mode abrégé.** Leur comportement est
établi par les lots 20 et 21, avant la réponse abrégée. Ils devraient se comporter pareil
— le résumé est obligatoire dans les deux formats — mais **fais-les tourner une fois avant
la démo**, pas devant le public.

## À ne pas montrer

| Prompt | Pourquoi |
|---|---|
| « Rends ce gabarit plus élégant. » | demande vague : le résultat est correct mais impossible à commenter en dix secondes |
| « Passe tout le document en majuscules. » | exécuté en silence, sans prévenir (mesuré au lot 21, seul cas restant) |
| Tout prompt sur un gabarit libre | 5 s au lieu de 2, et rien de neuf à montrer |
| « Mets le logo de la Ville de Lyon. » | image inexistante : intéressant en test, confus en démo |

## Si quelqu'un demande « et si je préfère écrire le Typst à la main ? »

Deuxième route, `/templates/:id`, avec la source dans un éditeur de texte. Les deux écrivent
le même fichier ; le bloc géré est régénéré depuis son JSON, et ce qu'on écrit **après**
`// dots:layout end` est conservé tel quel.

## Chiffres, si on te les demande

- 10,3 s → 2,6 s de médiane entre `main` et l'état actuel, à qualité égale ou meilleure.
- La sortie du modèle passe de 1 030 à 51 jetons médians : il ne recopie plus le gabarit,
  il envoie les champs qui changent.
- Mesuré sur 5 cas × 2 exécutions, renotés par le même code. **Pas** sur les 21 cas du banc.

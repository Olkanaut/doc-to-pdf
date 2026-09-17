// Corps d'exemple. JAMAIS utilisé à l'exécution.
//
// À la compilation réelle, `runTypstCompileDetailed` (src/compile/typstCompile.ts)
// copie le gabarit dans un dossier temporaire et y écrit le vrai `body.typ`,
// engendré depuis le document Docs. Ce fichier-ci sert à ouvrir un gabarit seul
// dans un éditeur Typst : `#include "body.typ"` se résout, et l'aperçu montre les
// styles du gabarit sur un contenu représentatif — titres des trois niveaux,
// tableau, italique, gras.

= Head
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

== Head2
Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

=== head3
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

// Pistes `fr` comme celles qu'engendre le convertisseur (src/convert/tableToTypst.ts) :
// le tableau occupe toute la largeur du texte, comme dans un vrai document.
#table(
  columns: (1fr, 1fr, 1fr),
  [Poste], [2024], [2025],
  [Recettes], [128 400 €], [141 250 €],
  [Dépenses], [97 310 €], [105 880 €],
  [Solde], [31 090 €], [35 370 €],
)

_Sed ut perspiciatis unde omnis iste natus error sit voluptatem._

*Nemo enim ipsam voluptatem quia voluptas sit aspernatur.*

Texte normal, *en gras*, _en italique_, puis normal à nouveau.

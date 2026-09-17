#set page(
  paper: "a4",
  margin: (top: 3.5cm, bottom: 2.5cm, x: 2cm),
  header: [
    #grid(
      columns: (auto, 1fr),
      align: (left + horizon, right + horizon),
      image("assets/logo-ville-fictive.svg", width: 1.3cm),
      [*Collectivité de l'Exemple*],
    )
    #v(0.3cm)
    #line(length: 100%, stroke: 1pt + rgb("#007850"))
  ],
  footer: [
    #align(center)[#context counter(page).display("1 / 1", both: true)]
  ],
)
#set heading(numbering: none)

#set table(stroke: 0.5pt + luma(200), inset: 6pt)
#include "body.typ"

#set page(
  paper: "a4",
  margin: (top: 3.5cm, bottom: 2.5cm, x: 2cm),
  header: [
    #grid(
      columns: (auto, 1fr),
      align: (left + horizon, right + horizon),
      image("assets/logo-collectivite.png", width: 1.3cm),
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

#include "body.typ"

#set page(
  paper: "a4",
  margin: (top: 4cm, bottom: 2.5cm, x: 2.5cm),
  header: [
    #grid(
      columns: (1fr, auto),
      align: (left + horizon, right + horizon),
      [
        *RÉPUBLIQUE FRANÇAISE* \
        Ministère de l'Exemple
      ],
      image("assets/logo-ministere.png", width: 1.5cm),
    )
    #v(0.3cm)
    #line(length: 100%, stroke: 0.5pt + rgb("#002f6c"))
  ],
  footer: [
    #line(length: 100%, stroke: 0.5pt + rgb("#002f6c"))
    #v(0.2cm)
    #align(center)[#context counter(page).display("1 / 1", both: true)]
  ],
)
#set heading(numbering: none)
#set text(fill: rgb("#1a1a1a"))

#set table(stroke: 0.5pt + luma(200), inset: 6pt)
#include "body.typ"

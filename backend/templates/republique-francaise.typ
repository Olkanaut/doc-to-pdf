// template État : bloc Marianne officiel en haut à gauche, nom du ministère à côté.
#set page(
  paper: "a4",
  margin: (top: 4.2cm, bottom: 2.5cm, x: 2.5cm),
  header: [
    #grid(
      columns: (auto, 1fr),
      column-gutter: 0.6cm,
      align: (left + horizon, left + horizon),
      image("assets/logo-republique-francaise.png", width: 2.6cm),
      text(size: 10pt)[
        *MINISTÈRE DE L'EXEMPLE* \
        Direction du numérique
      ],
    )
    #v(0.25cm)
    #line(length: 100%, stroke: 0.5pt + rgb("#000091"))
  ],
  footer: [
    #line(length: 100%, stroke: 0.5pt + rgb("#000091"))
    #v(0.2cm)
    #align(center)[#context counter(page).display("1 / 1", both: true)]
  ],
)
#set heading(numbering: none)
#set text(fill: rgb("#161616"))
#show heading: set text(fill: rgb("#000091"))

#set table(stroke: 0.5pt + luma(200), inset: 6pt)
#include "body.typ"

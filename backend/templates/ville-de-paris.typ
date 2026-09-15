// Gabarit Ville de Paris : logo officiel centré en tête, comme les arrêtés publiés.
#set page(
  paper: "a4",
  margin: (top: 4cm, bottom: 2.5cm, x: 2.2cm),
  header: [
    #align(center)[#image("assets/logo-ville-de-paris.png", width: 1.9cm)]
    #v(0.2cm)
  ],
  footer: [
    #align(center)[#context counter(page).display("1 / 1", both: true)]
  ],
)
#set heading(numbering: none)
#set text(fill: rgb("#0c1e3c"))
#show heading: set text(fill: rgb("#0c1e3c"))

#set table(stroke: 0.5pt + luma(200), inset: 6pt)
#include "body.typ"

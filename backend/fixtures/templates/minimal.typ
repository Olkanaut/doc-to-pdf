#set page(
  paper: "a4",
  margin: 2.5cm,
  footer: [
    #align(center)[#context counter(page).display("1 / 1", both: true)]
  ],
)
#set heading(numbering: none)

#set table(stroke: 0.5pt + luma(200), inset: 6pt)
#include "body.typ"

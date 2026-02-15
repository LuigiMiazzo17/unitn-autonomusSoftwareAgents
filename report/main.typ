#set document(title: "Autonomous Software Agents Project Report")

#set page(paper: "a4", margin: 3cm)
#set text(size: 12pt)

#set page(numbering: "i")

// -----------------------------
// Title page
// -----------------------------
#v(2cm)

#title()

#v(1.5cm)

#grid(
  columns: (1fr, 1fr),
  align(center)[
    *Lorenzo Bevilacqua* \
    256135 \
    #link("mailto:lorenzo.bevilacqua@studenti.unitn.it")
  ],
  align(center)[
    *Luigi Miazzo* \
    256145 \
    #link("mailto:luigi.miazzo@studenti.unitn.it")
  ],
)
#v(1.5cm)

#align(center)[
  #set text(size: 16pt)
  Team: Sveja Macachi
]
#v(1.5cm)

#align(center)[
  #set par(justify: false)
  #include "chapters/0_abstract.typ"
]

#pagebreak()

// -----------------------------
// Outline page
// -----------------------------
#outline()
#pagebreak()

// -----------------------------
// Report content
// -----------------------------
#set page(numbering: "1")
#counter(page).update(1)

#set heading(numbering: "1.1.")
// #show heading.where(level: 1): it => {
//   pagebreak(weak: true)
//   it
// }
#set par(
  first-line-indent: 15pt,
  justify: true,
)

#include "chapters/1_introduction.typ"
#include "chapters/2_system_design.typ"
#include "chapters/3_single_agent.typ"
#include "chapters/4_multi_agent.typ"
#include "chapters/5_decision_making.typ"
#include "chapters/6_results.typ"
#include "chapters/7_conclusion.typ"

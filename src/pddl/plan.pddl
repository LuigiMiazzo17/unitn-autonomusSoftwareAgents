(define (domain deliveroo)
  (:requirements :strips :typing)
  (:types agent cell package)

  (:predicates
    (at ?a - agent ?c - cell)
    (adjacent ?c1 - cell ?c2 - cell)
    (wall ?c - cell)
    (package-at ?p - package ?c - cell)
    (carrying ?a - agent ?p - package)
    (delivery-cell ?c - cell)
  )

  ;; Move action
  (:action move
    :parameters (?a - agent ?from - cell ?to - cell)
    :precondition (and (at ?a ?from)
                       (adjacent ?from ?to)
                       (not (wall ?to)))
    :effect (and (not (at ?a ?from))
                 (at ?a ?to)))

  ;; Pick up package
  (:action pickup
    :parameters (?a - agent ?p - package ?c - cell)
    :precondition (and (at ?a ?c)
                       (package-at ?p ?c)
                       (not (carrying ?a ?p)))
    :effect (and (carrying ?a ?p)
                 (not (package-at ?p ?c))))

  ;; Deliver package
  (:action deliver
    :parameters (?a - agent ?p - package ?c - cell)
    :precondition (and (at ?a ?c)
                       (carrying ?a ?p)
                       (delivery-cell ?c))
    :effect (and (not (carrying ?a ?p))))
)

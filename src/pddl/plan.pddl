(define (domain deliveroo)
  (:requirements :strips :typing :fluents)
  (:types agent tile parcel)

  (:predicates
    (at ?a - agent ?t - tile)
    (adjacent ?t1 - tile ?t2 - tile)
    (parcel_at ?p - parcel ?t - tile)
    (carrying ?a - agent ?p - parcel)
    (delivered ?p - parcel)
    (delivery_tile ?t - tile)
    (blocked ?t - tile)
  )

  ;; numeric function to track plan cost
  (:functions
    (total-cost)
  )

  ;; Move action
  (:action move
    :parameters (?a - agent ?from - tile ?to - tile)
    :precondition (and (at ?a ?from)
                       (adjacent ?from ?to)
                       (not (blocked ?to)))
    :effect (and (not (at ?a ?from))
                 (at ?a ?to)
                 (increase (total-cost) 1)))

  ;; Pick up a parcel
  (:action pickup
    :parameters (?a - agent ?p - parcel ?t - tile)
    :precondition (and (at ?a ?t)
                       (parcel_at ?p ?t)
                       (not (carrying ?a ?p))
                       (not (delivered ?p)))
    :effect (and (carrying ?a ?p)
                 (not (parcel_at ?p ?t))))

  ;; Deliver parcels
  (:action deliver
    :parameters (?a - agent ?p - parcel ?t - tile)
    :precondition (and (at ?a ?t)
                       (carrying ?a ?p)
                       (delivery_tile ?t))
    :effect (and (not (carrying ?a ?p))
                 (delivered ?p)))
)

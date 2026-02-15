= Single-Agent Strategies <single-agent>

This chapter describes how the agent generates and selects goals and produces executable action sequences. Two planning backends are presented. Commitment strategy and reactive replanning are discussed in depth in @decision-making.

== Intention Generation and Selection

=== Generating Candidate Intentions

At the start of each deliberation phase, `generateIntentions(beliefs)` produces one candidate intention per actionable opportunity found in the current belief set. A tile or parcel is considered reachable only if its Dijkstra distance from the agent is finite — meaning an unobstructed path exists. Four intention kinds are generated:

- `deliver_parcels`: when the agent is carrying at least one parcel, targeting the closest reachable delivery tile.
- `go_pickup`: one per unclaimed, non-ignored, reachable parcel in the belief set.
- `explore_spawn`: one per reachable spawnable tile, driving the agent to cover the map when no parcels are visible.
- `noop`: always present as a zero-cost fallback.

=== Selecting the Best Intention

`selectIntention` ranks candidates in a min-priority queue; the lowest score wins. Priority formulas are summarised in //@priority-table.

Delivery is preferred over same-distance pickup by a factor of `deliveryOverPickupRatio` (default 0.8): parcels in hand are already decaying, so completing a delivery is worth slightly more than starting a new acquisition at the same travel cost. Exploration is scored above 100, keeping it below any reachable parcel option. The seeded PRNG makes spawnable-tile ordering deterministic and consistent across frames; the `checkedCount` penalty gradually shifts focus to less-visited tiles, encouraging broad map coverage over time. `noop` at infinity is selected only when every other option is unavailable.

== Path Planning with Dijkstra

A full Dijkstra search is run from the agent's current position once per deliberation cycle, treating walls and current foreign-agent positions as impassable. The algorithm returns both a distances array and a `previous` array for path reconstruction. The key advantage over running A\* per target is that the full distance vector is computed once and reused across all distance queries in the same cycle — ranking delivery tiles, measuring parcel distances — without re-running the search. `generatePlanToPos` traces back through `previous` to produce a `Queue<Action>` (steps `MOVE_UP`, `MOVE_DOWN`, `MOVE_LEFT`, `MOVE_RIGHT`) consumed one step per frame.

== PDDL-Based Planning <pddl-planning>

In `pddl` mode, plan synthesis is delegated to an external REST solver. The domain defines types `agent`, `tile`, `parcel`; actions `move` (adjacency-constrained, cost 1), `pickup`, and `deliver`; and a metric that minimises total cost, yielding provably optimal plans. Map tiles and adjacency predicates are submitted once as static objects at startup; subsequent planning calls send only incremental diffs — changed parcel positions, updated blocked tiles — reducing payload size. The goal is to deliver all currently known parcels; when none are visible the agent targets a random spawnable tile to remain mobile.

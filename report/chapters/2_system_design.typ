= System Design

// [FIGURE: Module diagram: `beliefs/` → `generateIntentions` → `selectIntention` → planner → `Queue<Action>` → `Agent` frame loop. `ConnectionManager` feeds `BeliefSet` via `merge()` from incoming messages.]

The codebase is structured around a single `Agent` class that drives the BDI loop. Supporting logic is split into four modules under `src/`: `beliefs/` for world state management, `intentions/` for goal generation and selection, `planning/` for path computation and PDDL interaction, and `coordination/` for multi-agent messaging. Each agent runs as a separate OS process; teammates communicate over the Deliveroo.js broadcast channel.

== BDI Architecture Overview

On every frame the agent executes one BDI step: it checks whether its world model has changed, dequeues and executes the next planned action, and re-deliberates when the plan is exhausted or invalidated. Beliefs are held in `BeliefSet`, updated asynchronously by sensor callbacks from the environment API. Desires are the candidate `Intention` list produced by `generateIntentions`; the agent does not commit to any goal until selection runs. The committed intention — output of `selectIntention` — is handed to the planner, which produces a `Queue<Action>` executed one step per frame.

Plan invalidation is driven by an MD5 checksum over parcel carrier states and agent positions, recomputed at the top of every frame. A change signals a planning-relevant world update: the plan is discarded and the agent re-deliberates immediately. This keeps the agent reactive without replanning on every sensor event — only changes that affect reachability or goal validity trigger a new cycle. The agent supports three operational modes configured at startup: `decentralized` (custom Dijkstra planner, the primary mode), `pddl` (external solver), and `centralized` (reserved for future work).

== Belief Representation

`BeliefSet` composes three specialised classes. `MapBelief` holds the static tile grid (types `WALL`, `EMPTY`, `SPAWNABLE`, `DELIVERY`), a list of delivery positions, and a list of spawnable tiles each annotated with a `checkedCount` visit counter that feeds the exploration heuristic. `ParcelsBelief` tracks all observed parcels with their grid position, carrier agent ID, and an ignore flag — set when a pickup action fails (indicating the parcel was already taken) or when a parcel is handed off — which suppresses re-targeting without removing the record entirely. `AgentsBelief` tracks own position, foreign agents (passed to Dijkstra as impassable obstacles), and group teammates whose positions drive `handoff` intention generation.

For multi-agent communication, the belief set is serialisable as a `ReducedBeliefSet` — a compact subset omitting the map grid, which all agents already possess — piggybacked on every outgoing coordination message.

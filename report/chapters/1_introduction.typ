= Introduction

Deliveroo.js is a tile-based simulation in which agents navigate a grid, pick up parcels on spawnable tiles, and deliver them to designated delivery tiles for points. Parcels decay in value over time, so agents must balance exploration, collection, and timely delivery. The environment is dynamic: parcels appear and disappear, and multiple agents — cooperative and adversarial — share the map simultaneously.

== Motivation and Approach

Designing effective behaviour in this setting requires an agent to maintain a consistent world model from partial, sensor-limited observations, derive worthwhile goals from it, produce executable plans, and remain reactive to a changing environment — all at once. The Belief-Desire-Intention (BDI) model provides a principled framework for this: beliefs capture the agent's world model; desires (options) are the goals derivable from it; intentions are the committed goal currently being pursued. This separation of concerns kept the codebase modular and made it straightforward to extend from single- to multi-agent operation without touching the deliberation core.

The system is implemented in TypeScript, chosen for its static type safety. Modelling the belief system, the typed message protocol, and the multi-layered coordination logic in plain JavaScript would have been error-prone; TypeScript's discriminated unions, strict null checks, and structural typing caught a large class of bugs at compile time.

== Project Development Phases

The project was carried out in two successive phases. The first established the core BDI loop, the belief representation, and two alternative planning backends: a custom heuristic planner based on Dijkstra's algorithm and a PDDL planner backed by an external solver. Keeping the initial scope to a single agent allowed each subsystem to be validated in isolation. The second phase extended the system to cooperating teams, adding peer discovery, belief sharing, and a parcel handoff mechanism — all layered on top of the existing loop without modifying it.

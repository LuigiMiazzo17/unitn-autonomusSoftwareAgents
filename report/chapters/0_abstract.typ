= Abstract

This report presents the design and implementation of an autonomous agent system for Deliveroo.js, a tile-based simulation in which agents navigate a grid to collect and deliver time-decaying parcels for points. The system is built around the Belief-Desire-Intention (BDI) architecture and implemented in TypeScript, progressing from a single-agent baseline to a cooperative multi-agent system without altering the core deliberation loop.

The single-agent design combines a Dijkstra-based path planner, which computes full-map distances in a single pass per deliberation cycle, with an optional PDDL backend that delegates plan synthesis to an external REST solver for provably optimal plans. Empirical evaluation across nine maps shows that the Dijkstra planner consistently outperforms PDDL due to negligible replanning latency in dynamic environments where belief states change faster than PDDL plans can execute.

Multi-agent cooperation is realised through a peer-discovery and belief-sharing protocol layered on top of the single-agent core. Agents broadcast parcel and agent observations and support a parcel handoff mechanism that enables spatial specialisation. Two cooperating agents outperform a single agent on all tested maps, though gains remain sublinear because duplicate-pickup conflicts are not yet resolved at the intention level.

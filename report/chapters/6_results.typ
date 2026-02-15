= Evaluation and Results

All experiments were run on the same fixed map with identical parcel spawn rates, decay rates, and sensing radii (parcel sensing: 5 tiles, agent sensing: 5 tiles, `recalculatePlanOnParcelUpdate`: `true`). Each configuration ran for a fixed duration; final score, averaged across multiple runs to account for parcel-spawn randomness, is the primary metric.

== Single-Agent vs. Multi-Agent Performance

// [FIGURE: Bar chart — final score: 1 agent (Dijkstra) vs. 2 cooperating agents, with error bars.]

Two cooperating agents consistently outperform a single agent. The gain comes from broader spawnable-tile coverage and the ability to collect and deliver parcels in parallel. The handoff mechanism provides an additional benefit when delivery tiles are clustered far from the spawnable region: one agent can specialise in collection while the other delivers, reducing idle travel for both.

The gain is sublinear, however. Without duplicate-pickup avoidance, both agents may simultaneously commit to the same parcel, with one arriving to find it already taken. The `IntentionMsg` broadcast was designed to address this, but consuming peer intentions in `generateIntentions` is left as future work.

== Dijkstra vs. PDDL Planner

// [FIGURE: Score over time and planning latency: Dijkstra (µs, local computation) vs. PDDL (ms, REST round-trip). Dijkstra leads in dynamic conditions due to lower replanning overhead.]

PDDL produces cost-optimal plans and can in principle pick up multiple parcels en route to a delivery tile — something the greedy Dijkstra planner cannot do. In practice, the REST round-trip introduces latency on every planning call. In dynamic environments where the belief state changes frequently, the plan is often invalidated before it can be fully executed, negating the quality advantage. Dijkstra replans in microseconds and dominates in high-churn settings. PDDL is competitive only in stable environments where the world is calm enough for multi-step optimal plans to execute without interruption.

== Effect of the Delivery–Pickup Ratio

// [FIGURE: Final score vs. deliveryOverPickupRatio across the range 0.4–1.2. Score peaks near 0.8 and degrades toward both extremes.]

The `deliveryOverPickupRatio` parameter scales the priority of delivery relative to pickup at equal distance. Values too low cause the agent to deliver after every single pickup, generating many short delivery trips when collecting one more nearby parcel first would have been cheaper. Values too high delay delivery until the agent is holding many parcels far from delivery tiles, by which time decay has significantly eroded their value. The default of 0.8 was chosen empirically to balance these two failure modes.

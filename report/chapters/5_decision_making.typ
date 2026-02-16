= Decision-Making: Option–Intention Loop <decision-making>

This chapter situates the implementation within BDI theory, examining how the option–intention loop is realised in code, the commitment strategy, and the interplay between the two reactivity layers.

== Beliefs and Intentions

The `BeliefSet` class is the sole belief base: the only source of truth all other components read from, updated exclusively by sensor callbacks. `generateIntentions` acts as the *filter* function: it queries the belief set for preconditioned opportunities and emits one option per opportunity, each reachability-checked via Dijkstra distances. Options are regenerated from scratch on every deliberation cycle rather than maintained as a persistent set. This stateless approach automatically eliminates stale or contradictory desires: a parcel that disappears is simply not offered as an option on the next cycle, with no explicit cleanup required. `selectIntention` commits to the single highest-utility option; the planner immediately converts this commitment into a `Queue<Action>`.

== Commitment Strategy

A central question in BDI design is how firmly to commit to an intention once formed. The implementation adopts a *single-minded* strategy: once a plan is in the queue, the agent executes it action by action without reconsidering the intention between steps.

However, the commitment is not blind. The MD5 checksum over parcel carrier states and agent positions acts as a tripwire at the top of every frame. If the hash has changed since the last frame, indicating a parcel was picked up or dropped, or an agent moved, the current plan is discarded and the agent re-deliberates on the very next frame. Commitment is therefore conditional on the belief state remaining consistent with the assumptions that motivated it.

The checksum intentionally covers only carrier states and agent positions, not the full belief set. Updates that carry no planning consequence, such as incrementing a `lastSeen` on a visited spawnable tile, are invisible to the checksum and do not trigger replanning. This selective sensitivity keeps the replanning rate low during stable periods while remaining reactive to changes that actually matter. The `recalculatePlanOnParcelUpdate` configuration flag (default: `true`) can suppress checksum-driven invalidation entirely, making the agent complete its current plan before reconsidering. In high-churn environments, frequent replanning can cost more than it saves, and a less reactive agent may outperform by committing longer.

== Two Layers of Reactivity

Two concurrent mechanisms keep the agent responsive at different timescales. The *reactive layer* consists of sensor callbacks (`onParcelsSensing`, `onAgentsSensing`, `onYou`) that update `BeliefSet` in place the moment the server pushes data, independently of plan execution, providing low-latency belief maintenance. The *deliberative layer* is the frame loop itself: at the top of each frame it recomputes the checksum and acts as a synchronisation point, reconciling asynchronous belief updates with ongoing plan execution and forcing re-deliberation only when the world has changed in a planning-relevant way. Together, the two layers allow the agent to be reactive at the belief level without replanning on every sensor event.

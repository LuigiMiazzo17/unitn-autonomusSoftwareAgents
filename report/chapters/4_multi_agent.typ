= Multi-Agent Extension

The multi-agent extension adds peer discovery, belief sharing, and parcel handoff to the system without modifying the core BDI loop. Coordination is a side-effect of messaging: a cooperating agent is architecturally identical to a standalone one, with the `ConnectionManager` running alongside the frame loop as an independent asynchronous task.

== Peer Discovery and Cluster Membership

Agents have no static knowledge of their teammates. Each agent broadcasts a `HandshakeMsg` every 500 ms via the Deliveroo.js shout channel. Handshakes carry a team-specific `agentType` token (`"svejaMacachi"`); messages from other teams are silently discarded, allowing agents from different teams to coexist on the same server. On first contact with a new peer, the agent promotes it from `foreignAgents` to `groupAgents` — a permanent, one-way reclassification. This distinction matters for planning: foreign agents are passed to Dijkstra as blocked tiles; group agents are not, since teammates are expected to move and should not unnecessarily constrain each other's paths. Peers not heard from for more than two beacon intervals (1 s) are evicted from the group. On implementing the master-slave mode, the leader election would be implicit: the group member with the lexicographically smallest agent ID is the master, providing a deterministic, negotiation-free hook for future centralised coordination.

== Belief Sharing and Message Protocol

Every outgoing message piggybacks a serialised `ReducedBeliefSet`. On receipt, `beliefs.merge()` applies a last-writer-wins policy keyed on `lastSeen` timestamps, so stale peer observations never overwrite fresher local data. In steady state, each agent's beliefs converge toward the union of all group observations within roughly one beacon interval.

Five message types are defined. `HandshakeMsg` serves as both a liveness beacon and the primary vehicle for belief propagation. `ParcelsDeletedMsg` is broadcast when the agent's parcel sensors detect a disappearance within sensing range; peers remove the listed IDs from their belief sets, preventing stale `go_pickup` intentions. `AgentsDeletedMsg` similarly propagates foreign-agent evictions. `IntentionMsg` is broadcast whenever the agent commits to a new intention, laying the groundwork for future duplicate-pickup avoidance (not yet consumed by recipients). `HandoffMsg` is sent immediately before a `HANDOFF` action to coordinate parcel transfer.

== Parcel Handoff

// [FIGURE: Handoff sequence: A picks up parcel → moves adjacent to B → sends HandoffMsg → executes HANDOFF (putdown) → B calls resetHandedOffParcels() → B picks up parcel → B delivers.]

The handoff mechanism enables one agent to transfer carried parcels to a better-positioned teammate. When carrying parcels, the intention generator produces `handoff` candidates targeting the four cardinal tiles adjacent to each known group agent. If the agent navigates to one of these tiles, it broadcasts a `HandoffMsg` carrying the parcel IDs, then executes a `HANDOFF` action implemented as a `putdown` at the current position.

The `HandoffMsg` is necessary because `ParcelsBelief` maintains a `parcelsHandedOff` ignore set: when an agent drops a parcel, it adds its ID to this set to avoid immediately re-picking it up the next time sensors report it. The message clears this flag on the receiver so it can pick up the dropped parcel freely. Handoff priority (distance × 20) keeps it subordinate to direct delivery or a nearby unclaimed parcel, preventing pointless back-and-forth between adjacent agents.

= Conclusion and Future Work

The project produced a BDI-based autonomous agent system that scales from single-agent to cooperative multi-agent operation without altering its core deliberation loop, validating the modularity of the design. The Dijkstra planner proves more effective in dynamic environments due to negligible local latency and yields better results than the PDDL planner due to the very slow request-response times of the custom solver. Multi-agent cooperation delivers meaningful throughput gains, though the absence of duplicate-pickup avoidance leaves performance below what coordinated task allocation could achieve.

Three concrete improvements are identified for future work.

== Handoff Parcel Memory Cleanup

When an agent performs a handoff, the dropped parcel IDs are added to the `parcelsHandedOff` ignore set in `ParcelsBelief`. This set is only cleared when a `HandoffMsg` arrives from a peer. If the receiving agent delivers the parcels without triggering a further handoff, no message is sent back and the IDs accumulate indefinitely, a memory leak proportional to the total number of handoffs. The fix requires no new message type: incoming `ParcelsDeletedMsg` IDs should be cross-referenced against `parcelsHandedOff` and any matches removed, since a deleted parcel will never need to be picked up again.

== Master/Slave Architecture for Coordinated Planning

Currently each agent deliberates independently, so task allocation is emergent rather than deliberate. A master/slave architecture would assign the lexicographically smallest agent, already identified by `getMasterAgentId()`, the role of central planner. Using the shared belief set that already propagates via the existing protocol, the master would compute a globally optimal parcel-to-agent assignment and broadcast directed intentions to each slave via `IntentionMsg`. This would substantially reduce duplicate pickup attempts and improve overall throughput, particularly on larger maps where greedy local decisions produce globally inefficient routing.

== Intention Revision Based on Peer Intentions

`IntentionMsg` broadcasts are not yet consumed by recipients. Integrating them into `generateIntentions`, suppressing or heavily penalising `go_pickup` options already committed to by a peer, would eliminate most duplicate pickup conflicts. Care is needed around staleness: a peer's broadcast intention may become obsolete if its plan is invalidated. The existing `lastSeen` timestamp infrastructure could be extended to intention records, discarding stale peer commitments after a configurable timeout.

= Evaluation and Results

All experiments were run on the same fixed map with identical parcel spawn rates, decay rates, and sensing radii (parcel sensing: 5 tiles, agent sensing: 5 tiles, `recalculatePlanOnParcelUpdate`: `true`). Each configuration ran for a fixed duration of 1 minute; final score, averaged across multiple runs to account for parcel-spawn randomness.

#align(center)[
  #set par(justify: false)
  #figure(
    table(
      columns: (auto, auto, auto),
      inset: 6pt,
      align: horizon,
      table.header(
        [*Map Name*], [*Custom Planner*], [*PDDL*],
      ),
        [25c1_1], [344], [0],
        [25c1_2], [279], [31],
        [25c1_3], [611], [40],
        [25c1_4], [83], [7],
        [25c1_5], [327], [44],
        [25c1_6], [714], [14],
        [25c1_7], [181], [80],
        [25c1_8], [337], [94],
        [25c1_9], [762], [58],
    ),caption: [Custom Planner vs. PDDL scores across 9 maps],
  )
  #figure(
    table(
      columns: (auto, auto, auto, auto),
      inset: 6pt,
      align: horizon,
      table.header(
        [*Map Name*], [*Agent 1*], [*Agent 2*], [*Sum of Agents*],
      ),
        [25c2_1], [440], [335], [775],
        [25c2_2], [240], [168], [408],
        [25c2_3], [382], [252], [634],
        [25c2_4], [268], [244], [512],
        [25c2_5], [237], [224], [461],
        [25c2_6], [247], [178], [425],
        [25c2_7], [453], [99], [452],
        [25c2_8], [148], [51], [199],
        [25c2_9], [57], [45], [102],
        [25c2_hallway], [594], [0], [594],
    ),caption: [Multi-Agent scores across 10 maps],
  )
]

== Single-Agent vs. Multi-Agent Performance

Two cooperating agents consistently outperform a single agent. The gain comes from broader spawnable-tile coverage and the ability to collect and deliver parcels in parallel. The handoff mechanism provides an additional benefit when delivery tiles are clustered far from the spawnable region: one agent can specialise in collection while the other delivers, reducing idle travel for both.

The gain is sublinear, however. Without duplicate-pickup avoidance, both agents may simultaneously commit to the same parcel, with one arriving to find it already taken. The `IntentionMsg` broadcast was designed to address this, but consuming peer intentions in `generateIntentions` is left as future work.

== Dijkstra vs. PDDL Planner

PDDL produces tries cost-optimal plans. In practice, the REST round-trip introduces latency on every planning call. In dynamic environments where the belief state changes frequently, the plan is often invalidated before it can be fully executed, negating the quality advantage. Dijkstra replans in microseconds and dominates in high-churn settings. PDDL is competitive only in stable environments where the world is calm enough for plans to execute without interruption.

== Effect of the Delivery–Pickup Ratio

The `deliveryOverPickupRatio` parameter scales the priority of delivery relative to pickup at equal distance. Values too low cause the agent to deliver after every single pickup, generating many short delivery trips when collecting one more nearby parcel first would have been cheaper. Values too high delay delivery until the agent is holding many parcels far from delivery tiles, by which time decay has significantly eroded their value. The default of 0.8 was chosen empirically to balance these two failure modes.

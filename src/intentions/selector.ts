import { Intention } from "./types";
import { PriorityQueue } from "priority-queue-typescript";
import config from "config";
import { splitmix32 } from "src/utils/math";

export default function selectIntention(intentions: Intention[]): Intention {
  // Intention are already preconditioned, so we can just select the first based on some euritics

  const pq: PriorityQueue<[Intention, number]> = new PriorityQueue(
    intentions.length,
    (a: [Intention, number], b: [Intention, number]) => a[1] - b[1],
  );

  for (const intention of intentions) {
    const priority = calculatePriority(intention);
    pq.add([intention, priority]);
  }

  const first = pq.poll();
  return first ? first[0] : { kind: "noop" };
}

function calculatePriority(intention: Intention): number {
  switch (intention.kind) {
    case "noop":
      return Infinity;

    case "go_pickup":
      return intention.distance;

    case "deliver_parcels":
      return intention.distance * config.deliveryOverPickupRatio;

    case "handoff":
      return intention.distance * 2;

    case "explore_spawn": {
      // We want to explore spawn points in a deterministic but random order, so we use a seeded PRNG based on the tile position
      // PERF: This could be precomputed and stored in the tile data
      const prng = splitmix32(
        intention.tile.pos.x * 1000 + intention.tile.pos.y,
      );

      return 100 + prng() * 10 + intention.tile.checkedCount;
    }
  }
}

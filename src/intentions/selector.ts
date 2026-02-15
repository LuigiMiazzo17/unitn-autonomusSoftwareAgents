import config from "config";
import { PriorityQueue } from "priority-queue-typescript";
import { Intention } from "./types";

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
      return (
        100 +
        intention.tile.checkedCount * 1_000_000 +
        intention.tile.pos.y * 1_000 +
        intention.tile.pos.x
      );
    }
  }
}

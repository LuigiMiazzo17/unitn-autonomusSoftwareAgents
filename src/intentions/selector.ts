import { Intention } from "./types";
import { PriorityQueue } from "priority-queue-typescript";
import config from "config";

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
    case "explore_spawn":
      // Random arbitrary priority for exploring spawn, adjusted by intention.tile.checkedCount to prefer less checked tiles
      // This is a very basic heuristic and can be improved by considering distance to the spawn tile, spawn tiles clusters, etc.
      return 100 + Math.random() * 10 + intention.tile.checkedCount;
  }
}

import { Intention } from "./types";
import { PriorityQueue } from "priority-queue-typescript";
import config from "config";

export default function selectIntention(intentions: Intention[]): Intention {
  // Intention are already preconditioned, so we can just select the first based on some euritics

  const pq: PriorityQueue<[Intention, number]> = new PriorityQueue(
    intentions.length,
    (a: [Intention, number], b: [Intention, number]) => b[1] - a[1],
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
      return 100; // Arbitrary priority for exploring spawn
  }
}

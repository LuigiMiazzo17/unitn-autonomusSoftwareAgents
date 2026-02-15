import { BeliefSet } from "src/beliefs";
import { Position } from "src/beliefs/types";
import { Intention } from "src/intentions/types";
import {
  computeDistanceVectors,
  getSortedClosestDeliveryTiles,
} from "src/planning";

export default function generateIntentions(beliefs: BeliefSet): Intention[] {
  const intentions: Intention[] = [];
  const distanceVector = computeDistanceVectors(
    beliefs.getMap(),
    beliefs.getAllAgents(),
    beliefs.getAgentPos(),
  )[0];

  const closestDeliveryTiles = getSortedClosestDeliveryTiles(
    beliefs,
    beliefs.getAgentPos(),
    distanceVector,
  );

  if (beliefs.getCarriedParcels().size > 0) {
    if (closestDeliveryTiles.length > 0) {
      const bestTile = closestDeliveryTiles[0];

      intentions.push({
        kind: "deliver_parcels",
        pos: bestTile,
        distance: distanceVector[bestTile.y][bestTile.x],
      });
    }
  }

  const availableParcels = [...beliefs.getParcels()]
    .filter(
      (p) =>
        p.getCarriedBy() === null &&
        distanceVector[p.getPos().y][p.getPos().x] !== Infinity &&
        !beliefs.ignoreParcel(p.getId()),
    )
    .map((p) => [p, distanceVector[p.getPos().y][p.getPos().x]] as const);
  for (const [parcel, distance] of availableParcels) {
    intentions.push({
      kind: "go_pickup",
      parcelId: parcel.getId(),
      distance: distance,
      pos: parcel.getPos(),
    });
  }

  intentions.push({ kind: "noop" });

  // Get reachable spawn points
  const spawnPoints = beliefs.getSpawnableTiles();
  for (const spawn of spawnPoints) {
    const dist = distanceVector[spawn.pos.y][spawn.pos.x];
    if (dist !== Infinity) {
      intentions.push({
        kind: "explore_spawn",
        tile: spawn,
      });
    }
  }

  const handoffParcels = beliefs.getCarriedParcels();

  for (const parcel of handoffParcels) {
    for (const agentPos of Array.from(beliefs.getGroupAgents()).map((a) =>
      a.getPos(),
    )) {
      for (const nearPos of near(agentPos)) {
        if (
          beliefs.isWalkable(nearPos) &&
          distanceVector[nearPos.y][nearPos.x] !== Infinity
        ) {
          intentions.push({
            kind: "handoff",
            distance: distanceVector[nearPos.y][nearPos.x],
            parcelId: parcel.getId(),
            pos: nearPos,
          });
        }
      }
    }
  }
  return intentions;
}

function near(pos: Position): Position[] {
  return [
    { x: pos.x + 1, y: pos.y },
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
    { x: pos.x, y: pos.y - 1 },
  ];
}

import { BeliefSet } from "src/beliefs";
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

  if (beliefs.getCarryingParcels().size > 0) {
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
      ([, p]) =>
        p.getCarriedBy() === null &&
        distanceVector[p.getPos().y][p.getPos().x] !== Infinity,
    )
    .map(([, p]) => [p, distanceVector[p.getPos().y][p.getPos().x]] as const);
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

  return intentions;
}

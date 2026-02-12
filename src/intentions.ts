import { Intention } from "src/intents";
import { BeliefSet } from "src/beliefs";
import { debug } from "src/utils/log";

export class IntentionSelector {
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  selectIntention(beliefs: BeliefSet): Intention {
    if (beliefs.getParcels().length > 0) {
      debug("Set PLANNER mode", this.agentId);
      return { kind: "deliver_parcels" };
    }

    debug("Set EXPLORING mode", this.agentId);
    const spawnTiles = beliefs.getSpawnableTiles();
    if (spawnTiles.length === 0) {
      return { kind: "noop" };
    }

    const sorted = [...spawnTiles].sort(
      (a, b) => a.checkedCount - b.checkedCount,
    );
    const leastCount = sorted[0].checkedCount;
    const candidates = sorted.filter((t) => t.checkedCount === leastCount);
    const chosen =
      candidates[Math.floor(Math.random() * candidates.length)];
    chosen.checkedCount += 1;

    return { kind: "explore_spawn", pos: chosen.pos };
  }
}

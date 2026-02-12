import { Intention, OperationMode } from "src/intents";
import { BeliefSet } from "src/beliefs";
import { debug } from "src/utils/log";

export class IntentionSelector {
  private operationMode: OperationMode = OperationMode.HUNTING;
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  getOperationMode(): OperationMode {
    return this.operationMode;
  }

  setOperationMode(mode: OperationMode): void {
    this.operationMode = mode;
  }

  selectIntention(beliefs: BeliefSet): Intention {
    if (beliefs.getParcels().length === 0) {
      this.operationMode = OperationMode.HUNTING;
      debug("Set HUNTING mode", this.agentId);
    } else {
      this.operationMode = OperationMode.PLANNER;
      debug("Set PLANNER mode", this.agentId);
    }

    switch (this.operationMode) {
      case OperationMode.HUNTING: {
        const spawnTiles = beliefs.getSpawnableTiles();
        if (spawnTiles.length === 0) {
          return { kind: "noop" };
        }

        const sorted = [...spawnTiles].sort(
          (a, b) => a.checkedCount - b.checkedCount,
        );
        const leastCount = sorted[0].checkedCount;
        const candidates = sorted.filter(
          (t) => t.checkedCount === leastCount,
        );
        const chosen =
          candidates[Math.floor(Math.random() * candidates.length)];
        chosen.checkedCount += 1;

        return { kind: "explore_spawn", pos: chosen.pos };
      }
      case OperationMode.PLANNER: {
        return { kind: "deliver_parcels" };
      }
    }
  }
}

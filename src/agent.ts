import {
  Agent as DeliverooAgentType,
  DeliverooApi,
  Tile,
  Timestamp,
  Parcel,
} from "@unitn-asa/deliveroo-js-client";
import config from "config";
import { BeliefSet, Position } from "src/beliefs";
import { debug, info, warn, error } from "src/utils/log";
import { PddlPlanner } from "src/pddl";
import { Intent, CurrentOperationMode } from "src/intents";
import { Queue } from "queue-typed";

const FRAME_ADVANCE_INTERVAL = 100;

export type AgentOptions = {
  token?: string | null;
};

type Message = {
  type: "handshake" | "handshake-ack" | "parcels";
  agentType: "svejaMacachi" | unknown;
  [key: string]: unknown;
};

export default class Agent {
  private apiConnection: DeliverooApi;
  private frame: number = 0;
  private id: string;
  private beliefs: BeliefSet;
  private pddlPlanner: PddlPlanner;
  private lastTimestampUpdate: Timestamp | null = null;
  private plan: Queue<Intent> = new Queue<Intent>();
  private currentOperationMode: CurrentOperationMode =
    CurrentOperationMode.HUNTING;
  private moveFailCount: number = 0;
  private currentScore: number = 0;
  private stopped: boolean = false;
  private beliefsChecksum: string = "";

  onMap: (width: number, height: number, tiles: Tile[]) => void = (
    width,
    height,
    tiles,
  ) => {
    info(`Map update event: ${width}x${height}`, this.id);
    this.beliefs.updateMap(width, height, tiles);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMsg: (senderId: string, _: unknown, msg: any) => void = (
    senderId,
    _,
    msg,
  ) => {
    info(`Received message: ${JSON.stringify(msg)}`, this.id);

    if (!msg.agentType || msg.agentType !== "svejaMacachi") {
      warn(`Ignoring message from unknown agent type`, this.id);
    }

    switch (msg.type) {
      case "handshake": {
        info(`Handshake received from agent ${senderId}`, this.id);
        this.apiConnection.emitSay(senderId, {
          type: "handshake-ack",
          agentType: "svejaMacachi",
        } as Message);
        info(`Adding known agent ${senderId}`, this.id);
        this.beliefs.addKnownGroupAgent(senderId);
        break;
      }
      case "handshake-ack": {
        info(`Adding known agent ${senderId}`, this.id);
        this.beliefs.addKnownGroupAgent(senderId);
        break;
      }
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAgentConnected: (state: string, agent: any) => void = (state, agent) => {
    debug(
      `Agent connected: '${JSON.stringify(agent)}’ is now ${state}`,
      this.id,
    );
  };

  onParcelSensing: (parcels: Parcel[]) => void = (parcels) => {
    debug(`Parcels sensing event: ${parcels.length} parcels`, this.id);
    const somethingChanged = this.beliefs.updateParcels(parcels);
    if (somethingChanged && config.recalculatePlanOnParcelUpdate) {
      info(`Parcels changed, dropping plan`, this.id);
      this.plan = new Queue<Intent>();
    }
  };

  onAgentsSensing: (agents: DeliverooAgentType[]) => void = (agents) => {
    debug(`Agents sensing event: ${agents.length} agents`, this.id);
    const newAgents = agents.filter(
      (a) => a.id !== this.id && !this.beliefs.getKnwonAgentsIds().has(a.id),
    );
    this.beliefs.updateAgents(agents);
    for (const agent of newAgents) {
      info(`Sending handshake to agent ${agent.id}`, this.id);
      this.apiConnection.emitSay(agent.id, {
        type: "handshake",
        agentType: "svejaMacachi",
      } as Message);
    }
  };

  onYou: (agent: DeliverooAgentType, timestamp: Timestamp) => void = (
    agent,
    timestamp,
  ) => {
    if (
      this.lastTimestampUpdate &&
      timestamp.frame < this.lastTimestampUpdate.frame
    ) {
      warn(
        `Ignoring out-of-order timestamp: ${timestamp.frame} <= ${this.lastTimestampUpdate.frame}`,
        this.id,
      );
      return;
    }

    if (this.moveFailCount >= config.maxMoveFailCount) {
      agent.x = Math.floor(agent.x);
      agent.y = Math.floor(agent.y);
      this.beliefs.updatePos({
        x: Math.floor(agent.x),
        y: Math.floor(agent.y),
      });
      this.moveFailCount = 0;
      warn(
        `Too many move failures, resetting position to (${Math.floor(agent.x)}, ${Math.floor(agent.y)})`,
        this.id,
      );
      this.plan = new Queue<Intent>();
      this.currentOperationMode = CurrentOperationMode.HUNTING;
    }

    debug(
      `You event: position (${Math.floor(agent.x)}, ${Math.floor(agent.y)}) at ${timestamp.ms}`,
      this.id,
    );

    this.currentScore = agent.score;
    this.lastTimestampUpdate = timestamp;
  };

  constructor(
    apiConnection: DeliverooApi,
    me: DeliverooAgentType,
    map: { width: number; height: number; tiles: Tile[] },
  ) {
    this.apiConnection = apiConnection;

    this.id = me.id;

    this.apiConnection.onMap(this.onMap);
    this.apiConnection.onAgentConnected(this.onAgentConnected);
    this.apiConnection.onMsg(this.onMsg);
    this.apiConnection.onParcelsSensing(this.onParcelSensing);
    this.apiConnection.onAgentsSensing(this.onAgentsSensing);
    this.apiConnection.onYou(this.onYou);

    this.beliefs = new BeliefSet(me.id, map, {
      x: Math.floor(me.x),
      y: Math.floor(me.y),
    });
    this.pddlPlanner = new PddlPlanner(me.id, this.beliefs);
  }

  static async build(options: AgentOptions): Promise<Agent> {
    const apiConnection = new DeliverooApi(config.host, options.token);

    return new Agent(
      apiConnection,
      await apiConnection.me,
      await apiConnection.map,
    );
  }

  async run(): Promise<void> {
    await this.runFor(Infinity);
  }

  async runFor(durationMs: number): Promise<void> {
    this.stopped = false;
    this.apiConnection.connect();

    info(
      `Agent started at position (${this.beliefs.getPos().x}, ${this.beliefs.getPos().y})`,
      this.id,
    );

    const startTime = Date.now();

    while (!this.stopped) {
      const start = Date.now();
      await this.frameAdvance();

      const elapsed = Date.now() - start;
      if (elapsed < FRAME_ADVANCE_INTERVAL) {
        await new Promise((resolve) =>
          setTimeout(resolve, FRAME_ADVANCE_INTERVAL - elapsed),
        );
      }

      if (Date.now() - startTime >= durationMs) {
        break;
      }
    }

    this.apiConnection.disconnect();
  }

  stop(): void {
    this.stopped = true;
  }

  getScore(): number {
    return this.currentScore;
  }

  getFrame(): number {
    return this.frame;
  }

  async frameAdvance(): Promise<void> {
    if (this.frame % 100 === 0) {
      debug(`Frame advanced to ${this.frame}`, this.id);
    }

    const beliefsChecksum = this.beliefs.getChecksumOfBeliefs(
      this.currentOperationMode,
    );
    if (beliefsChecksum != this.beliefsChecksum) {
      debug(`Beliefs checksum before: ${this.beliefsChecksum}`, this.id);
      debug(`Beliefs checksum after: ${beliefsChecksum}`, this.id);
      this.beliefsChecksum = beliefsChecksum;
      info(`Beliefs changed, clearing plan`, this.id);

      this.plan = new Queue<Intent>();
    }

    let optionalIntent = this.plan.shift();

    if (optionalIntent === undefined) {
      this.plan = await this.generateIntents();

      optionalIntent = this.plan.shift();
      if (optionalIntent === undefined) {
        warn(`Correctly got a plan, but no intent to execute`, this.id);
        return;
      }
    }

    const actionResult = await this.executeIntent(optionalIntent);
    if (!actionResult) {
      warn(`Action failed, replanning`, this.id);
      switch (optionalIntent) {
        case Intent.MOVE_UP:
        case Intent.MOVE_DOWN:
        case Intent.MOVE_LEFT:
        case Intent.MOVE_RIGHT: {
          this.plan.addAt(0, optionalIntent);
          break;
        }
        default: {
          this.plan = new Queue<Intent>();
          this.currentOperationMode = CurrentOperationMode.HUNTING;
          break;
        }
      }
    } else {
      debug(`Action succeeded`, this.id);
    }

    this.frame++;
  }

  async executeIntent(intent: Intent): Promise<boolean> {
    debug(`Executing intent: ${Intent[intent]}`, this.id);

    const pos = this.beliefs.getPos();

    switch (intent) {
      case Intent.MOVE_UP:
        return await this.move("up", { x: pos.x, y: pos.y + 1 });
      case Intent.MOVE_DOWN:
        return await this.move("down", { x: pos.x, y: pos.y - 1 });
      case Intent.MOVE_LEFT:
        return await this.move("left", { x: pos.x - 1, y: pos.y });
      case Intent.MOVE_RIGHT:
        return await this.move("right", { x: pos.x + 1, y: pos.y });
      case Intent.PICKUP:
        return await this.pickup();
      case Intent.DELIVER:
        return await this.deliver();
      case Intent.NOOP:
        return true;
      default:
        error(`Unknown intent: ${intent}`, this.id);
        return false;
    }
  }

  async move(
    direction: "up" | "down" | "left" | "right" | { x: number; y: number },
    expected: Position,
  ): Promise<boolean> {
    const result = await this.apiConnection.emitMove(direction);
    if (typeof result === "boolean") {
      return result;
    }
    if (
      Math.floor(result.x) !== expected.x ||
      Math.floor(result.y) !== expected.y
    ) {
      error(
        `Move failed, expected position (${expected.x}, ${expected.y}) but got (${Math.floor(result.x)}, ${Math.floor(result.y)})`,
        this.id,
      );
      this.moveFailCount += 1;
      return false;
    }
    this.beliefs.updatePos(expected);
    return true;
  }

  async pickup(): Promise<boolean> {
    const result = await this.apiConnection.emitPickup();
    if (result.length === 0) {
      error(`Pickup failed, no parcel picked up`, this.id);
      this.beliefs.pickupParcelFailedFromAction();
      return false;
    }
    for (const parcel of result) {
      this.beliefs.pickupParcel(parcel.id);
    }
    return true;
  }

  async deliver(): Promise<boolean> {
    const result = await this.apiConnection.emitPutdown();
    if (result.length === 0) {
      error(`Deliver failed, no parcel delivered`, this.id);
      // Remove all parcels that we thought were deliverable, since they are not
      this.beliefs.clearParcels();
      return false;
    }
    for (const parcel of result) {
      this.beliefs.deliverParcel(parcel.id);
    }
    return true;
  }

  async generateIntents(): Promise<Queue<Intent>> {
    if (this.beliefs.getParcels().length === 0) {
      this.currentOperationMode = CurrentOperationMode.HUNTING;
      debug("Set HUNTING mode", this.id);
    } else {
      this.currentOperationMode = CurrentOperationMode.PLANNER;
      debug("Set Planner mode", this.id);
    }

    switch (this.currentOperationMode) {
      case CurrentOperationMode.HUNTING: {
        info(`Planning in HUNTING mode`, this.id);
        return this.beliefs.getHuntingMovePlan();
      }
      case CurrentOperationMode.PLANNER: {
        info(`Planning in Planner mode`, this.id);
        const plan =
          config.planner === "pddl"
            ? await this.pddlPlanner.solvePddlProblem()
            : this.beliefs.getSmartPlan();

        if (plan === null) {
          warn(`Planner planning failed, switching to HUNTING mode`, this.id);
          this.currentOperationMode = CurrentOperationMode.HUNTING;
          return this.beliefs.getHuntingMovePlan();
        } else {
          return plan;
        }
      }
      default: {
        error(`Unknown operation mode: ${this.currentOperationMode}`, this.id);
        throw new Error(`Unknown operation mode: ${this.currentOperationMode}`);
      }
    }
  }
}

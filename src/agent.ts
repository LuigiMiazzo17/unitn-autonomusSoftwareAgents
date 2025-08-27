import {
  Agent as DeliverooAgentType,
  DeliverooApi,
  Tile,
  Timestamp,
  Parcel,
} from "@unitn-asa/deliveroo-js-client";
import config from "config";
import { BelifsSet, Position } from "src/belifs";
import { debug, info, warn, error } from "src/utils/log";
import { PddlPlanner } from "src/pddl";
import { Intent, CurrentOperationMode } from "src/itents";
import { Queue } from "queue-typed";

const FRAME_ADVANCE_INTERVAL = 100;

export type AgentOptions = {
  token?: string | null;
};

export default class Agent {
  private apiConnection: DeliverooApi;
  private frame: number = 0;
  private id: string;
  private belifs: BelifsSet;
  private pddlPlanner: PddlPlanner;
  private lastTimestampUpdate: Timestamp | null = null;
  private plan: Queue<Intent> = new Queue<Intent>();
  private currentOperationMode: CurrentOperationMode =
    CurrentOperationMode.EXPLORING;

  onMap: (width: number, height: number, tiles: Tile[]) => void = (
    width,
    height,
    tiles,
  ) => {
    info(`Map update event: ${width}x${height}`, this.id);
    this.belifs.updateMap(width, height, tiles);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMsg: (msg: any) => void = (msg) => {
    info(`Received message: ${JSON.stringify(msg)}`, this.id);
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
    this.belifs.updateParcels(parcels);
  };

  onAgentsSensing: (agents: DeliverooAgentType[]) => void = (agents) => {
    debug(`Agents sensing event: ${agents.length} agents`, this.id);
    this.belifs.updateAgents(agents);
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

    // TODO: Handle repositioning
    // agent.x = Math.floor(agent.x);
    // agent.y = Math.floor(agent.y);

    debug(
      `You event: position (${agent.x}, ${agent.y}) at ${timestamp.ms}`,
      this.id,
    );

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

    this.belifs = new BelifsSet(me.id, map, { x: me.x, y: me.y });
    this.pddlPlanner = new PddlPlanner(me.id, this.belifs);
  }

  static async build(options: AgentOptions): Promise<Agent> {
    const apiConnection = new DeliverooApi(config.host, options.token);

    return new Agent(
      apiConnection,
      await apiConnection.me,
      await apiConnection.map,
    );
  }

  async run(): Promise<never> {
    this.apiConnection.connect();

    info(
      `Agent started at position (${this.belifs.getPos().x}, ${this.belifs.getPos().y})`,
      this.id,
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));
    while (true) {
      const start = Date.now();
      await this.frameAdvance();

      const elapsed = Date.now() - start;
      if (elapsed < FRAME_ADVANCE_INTERVAL) {
        await new Promise((resolve) =>
          setTimeout(resolve, FRAME_ADVANCE_INTERVAL - elapsed),
        );
      }
    }
  }

  async frameAdvance(): Promise<void> {
    if (this.frame % 100 === 0) {
      debug(`Frame advanced to ${this.frame}`, this.id);
    }
    if (this.belifs.getParcels().length > 0) {
      this.currentOperationMode = CurrentOperationMode.PDDL;
    }

    let optionalIntent = this.plan.shift();

    if (optionalIntent === undefined) {
      this.plan = await this.getIntents();

      optionalIntent = this.plan.shift();
      if (optionalIntent === undefined) {
        warn(`Correctly got a plan, but no intent to execute`, this.id);
        return;
      }
    }

    const actionResult = await this.executeIntent(optionalIntent);
    if (!actionResult) {
      warn(`Action failed, replanning`, this.id);
      this.plan = new Queue<Intent>();
    } else {
      debug(`Action succeeded`, this.id);
    }

    this.frame++;
  }

  async executeIntent(intent: Intent): Promise<boolean> {
    info(`Executing intent: ${Intent[intent]}`, this.id);

    const pos = this.belifs.getPos();

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
      return false;
    }
    this.belifs.updatePos(expected);
    return true;
  }

  async pickup(): Promise<boolean> {
    const result = await this.apiConnection.emitPickup();
    if (result.length === 0) {
      error(`Pickup failed, no parcel picked up`, this.id);
      return false;
    }
    for (const parcel of result) {
      this.belifs.pickupParcel(parcel.id);
    }
    return true;
  }

  async deliver(): Promise<boolean> {
    const result = await this.apiConnection.emitPutdown();
    if (result.length === 0) {
      error(`Deliver failed, no parcel delivered`, this.id);
      return false;
    }
    for (const parcel of result) {
      this.belifs.deliverParcel(parcel.id);
    }
    return true;
  }

  async getIntents(): Promise<Queue<Intent>> {
    if (this.belifs.getParcels().length === 0) {
      this.currentOperationMode = CurrentOperationMode.EXPLORING;
    } else {
      this.currentOperationMode = CurrentOperationMode.PDDL;
    }

    switch (this.currentOperationMode) {
      case CurrentOperationMode.EXPLORING: {
        info(`Planning in EXPLORING mode`, this.id);
        return this.belifs.getRandomMovePlan();
      }
      case CurrentOperationMode.PDDL: {
        info(`Planning in PDDL mode`, this.id);
        const pddlPlan = await this.pddlPlanner.solvePddlProblem();

        if (pddlPlan === null) {
          warn(`PDDL planning failed, switching to EXPLORING mode`, this.id);
          this.currentOperationMode = CurrentOperationMode.EXPLORING;
          return this.belifs.getRandomMovePlan();
        } else {
          return pddlPlan;
        }
      }
      default: {
        error(`Unknown operation mode: ${this.currentOperationMode}`, this.id);
        throw new Error(`Unknown operation mode: ${this.currentOperationMode}`);
      }
    }
  }
}

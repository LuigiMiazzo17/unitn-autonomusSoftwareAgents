import {
  AgentFromUpdate as DeliverooAgentFromUpdate,
  Agent as DeliverooAgentType,
  DeliverooApi,
  Parcel,
  Tile,
  Timestamp,
} from "@unitn-asa/deliveroo-js-client";
import config from "config";
import { Queue } from "queue-typed";
import { BeliefSet } from "src/beliefs";
import { Position } from "src/beliefs/types";
import ConnectionManager from "src/coordination/connectionManager";
import Message, {
  AgentsDeletedMsg,
  HandshakeMsg,
  ParcelsDeletedMsg,
} from "src/coordination/message";
import { IntentionSelector } from "src/intentions";
import { Action, Intention } from "src/intents";
import {
  PddlPlanner,
  generateHuntingPlan,
  generateSmartPlan,
  isInsideMap,
} from "src/planning";
import { debug, error, info, warn } from "src/utils/log";

export type AgentOptions = {
  token?: string | null;
};

export default class Agent {
  private apiConnection: DeliverooApi;
  private frame: number = 0;
  private id: string;
  private beliefs: BeliefSet;
  private pddlPlanner: PddlPlanner;
  private intentionSelector: IntentionSelector;
  private connectionManager: ConnectionManager;
  private lastTimestampUpdate: Timestamp | null = null;
  private plan: Queue<Action> = new Queue<Action>();
  private moveFailCount: number = 0;
  private currentScore: number = 0;
  private stopped: boolean = false;
  private beliefsChecksum: string = "";

  static readonly FRAME_ADVANCE_INTERVAL = 100;

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
    this.apiConnection.onDisconnect(this.onDisconnect);

    this.beliefs = new BeliefSet(me.id, map, {
      x: Math.floor(me.x),
      y: Math.floor(me.y),
    });
    this.intentionSelector = new IntentionSelector(me.id);
    this.pddlPlanner = new PddlPlanner(me.id, this.beliefs);
    this.connectionManager = new ConnectionManager(this);
  }

  static async build(options: AgentOptions): Promise<Agent> {
    const apiConnection = new DeliverooApi(config.host, options.token);
    const agent = new Agent(
      apiConnection,
      await apiConnection.me,
      await apiConnection.map,
    );
    agent.connectionManager.start();

    return agent;
  }

  private onDisconnect: () => void = () => {
    error(`Disconnected from server`, this.id);
    this.stopped = true;
  };

  private onMap: (width: number, height: number, tiles: Tile[]) => void = (
    width,
    height,
    tiles,
  ) => {
    info(`Map update event: ${width}x${height}`, this.id);
    this.beliefs.updateMap(width, height, tiles);
    this.plan = new Queue<Action>();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onMsg: (senderId: string, _: unknown, msg: any) => void = (
    senderId,
    _, // unused agent name
    any_msg,
  ) => {
    let msg = any_msg as Message; // HACK: try clause in JS make type inference fail
    try {
      msg = Message.fromObject(any_msg);
    } catch (e) {
      console.error(e);
      error(
        `Failed to parse message: ${e instanceof Error ? e.message : String(e)}`,
        this.id,
      );
      return;
    }

    // Merge knowledge from the message into our beliefs about the sender agent
    this.beliefs.mergeFromMessage(senderId, msg.getReducedBeliefSet());

    const msgContent = msg.getContent();

    if (msgContent instanceof HandshakeMsg) {
      debug(
        `Handshake received from agent ${senderId}, adding to known agents`,
        this.id,
      );
    } else if (msgContent instanceof ParcelsDeletedMsg) {
      debug(
        `ParcelsDeletedMsg received from agent ${senderId}, removing parcels ${msgContent.getParcelIds()}`,
        this.id,
      );
      this.beliefs.removeParcelsById(msgContent.getParcelIds());
    } else if (msgContent instanceof AgentsDeletedMsg) {
      debug(
        `AgentsDeletedMsg received from agent ${senderId}, removing agents ${msgContent.getAgentIds()}`,
        this.id,
      );
      this.beliefs.removeForeignAgentsById(msgContent.getAgentIds());
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onAgentConnected: (state: string, agent: any) => void = (
    state,
    agent,
  ) => {
    debug(
      `Agent connected: '${JSON.stringify(agent)}’ is now ${state}`,
      this.id,
    );
  };

  private onParcelSensing: (parcels: Parcel[]) => void = (parcels) => {
    debug(`Parcels sensing event: ${parcels.length} parcels`, this.id);
    const [somethingChanged, deletedParcels] =
      this.beliefs.updateKnownParcelsFromParcelUpdate(parcels);
    if (somethingChanged && config.recalculatePlanOnParcelUpdate) {
      info(`Parcels changed, dropping plan`, this.id);
      this.plan = new Queue<Action>();
    }

    if (deletedParcels.size > 0) {
      this.connectionManager.sendBroadcastMsg(
        new ParcelsDeletedMsg(deletedParcels),
      );
    }
  };

  private onAgentsSensing: (agents: DeliverooAgentFromUpdate[]) => void = (
    agents,
  ) => {
    debug(`Agents sensing event: ${agents.length} agents`, this.id);
    const deletedAgents = this.beliefs.updateAgentsFromSensing(agents);

    // TODO: use beliefs hash diff to detect this
    const somethingChanged = true;
    if (somethingChanged && config.recalculatePlanOnParcelUpdate) {
      info(`Parcels changed, dropping plan`, this.id);
      this.plan = new Queue<Action>();
    }

    if (deletedAgents.size > 0) {
      this.connectionManager.sendBroadcastMsg(
        new AgentsDeletedMsg(deletedAgents),
      );
    }
  };

  private onYou: (agent: DeliverooAgentType, timestamp: Timestamp) => void = (
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
      this.plan = new Queue<Action>();
    }

    debug(
      `You event: position (${Math.floor(agent.x)}, ${Math.floor(agent.y)}) at ${timestamp.ms}`,
      this.id,
    );

    if (
      this.beliefs.getPos().x !== Math.floor(agent.x) ||
      this.beliefs.getPos().y !== Math.floor(agent.y)
    ) {
      this.moveFailCount += 1;
    }

    this.currentScore = agent.score;
    this.lastTimestampUpdate = timestamp;
  };

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
      await this.nextFrame();

      const elapsed = Date.now() - start;
      if (elapsed < Agent.FRAME_ADVANCE_INTERVAL) {
        await new Promise((resolve) =>
          setTimeout(resolve, Agent.FRAME_ADVANCE_INTERVAL - elapsed),
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

  isStopped(): boolean {
    return this.stopped;
  }

  getId(): string {
    return this.id;
  }

  getScore(): number {
    return this.currentScore;
  }

  getFrame(): number {
    return this.frame;
  }

  getApi(): DeliverooApi {
    return this.apiConnection;
  }

  getBeliefSet(): BeliefSet {
    return this.beliefs;
  }

  async nextFrame(): Promise<void> {
    if (this.frame % 100 === 0) {
      debug(`Frame advanced to ${this.frame}`, this.id);
    }
    const map = this.beliefs.getMap();
    const pos = this.beliefs.getPos();
    if (!isInsideMap(map, pos)) {
      error(`Position of agent out of bounds: (${pos.x}, ${pos.y})`);
      return;
    }

    // 0. Process if is multiagent mode TODO:

    // 1. Check if beliefs changed → invalidate current plan
    const beliefsChecksum = this.beliefs.getChecksumOfBeliefs();
    if (beliefsChecksum != this.beliefsChecksum) {
      debug(`Beliefs checksum before: ${this.beliefsChecksum}`, this.id);
      debug(`Beliefs checksum after: ${beliefsChecksum}`, this.id);
      this.beliefsChecksum = beliefsChecksum;
      info(`Beliefs changed, clearing plan`, this.id);

      this.plan = new Queue<Action>();
    }

    // 2. Dequeue next action from current plan
    const nextAction = this.plan.shift();

    // 3. If plan is empty → select intention → generate new plan
    if (nextAction === undefined) {
      info(
        `Plan is empty, selecting new intention and generating plan`,
        this.id,
      );
      const intention = this.intentionSelector.selectIntention(this.beliefs);
      this.plan = await this.generatePlan(intention);
      return;
    }

    // 4. Execute the action
    const actionResult = await this.executeAction(nextAction);

    // 5. Handle failure
    if (!actionResult) {
      warn(`Action failed, clearing plan`, this.id);
      this.plan = new Queue<Action>();
    } else {
      debug(`Action succeeded`, this.id);
    }

    this.frame++;
  }

  async executeAction(action: Action): Promise<boolean> {
    debug(`Executing action: ${Action[action]}`, this.id);

    const pos = this.beliefs.getPos();

    switch (action) {
      case Action.MOVE_UP:
        return await this.move("up", { x: pos.x, y: pos.y + 1 });
      case Action.MOVE_DOWN:
        return await this.move("down", { x: pos.x, y: pos.y - 1 });
      case Action.MOVE_LEFT:
        return await this.move("left", { x: pos.x - 1, y: pos.y });
      case Action.MOVE_RIGHT:
        return await this.move("right", { x: pos.x + 1, y: pos.y });
      case Action.PICKUP:
        return await this.pickup();
      case Action.DELIVER:
        return await this.deliver();
      case Action.NOOP:
        return true;
      default:
        error(`Unknown action: ${action}`, this.id);
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

  async generatePlan(intention: Intention): Promise<Queue<Action>> {
    switch (intention.kind) {
      case "explore_spawn": {
        info(`Planning: explore spawn tile`, this.id);
        return generateHuntingPlan(this.beliefs, intention.pos);
      }
      case "deliver_parcels": {
        info(`Planning: deliver parcels`, this.id);
        const plan =
          config.planner === "pddl"
            ? await this.pddlPlanner.solvePddlProblem()
            : generateSmartPlan(this.beliefs);

        if (plan === null) {
          warn(`Planner failed, falling back to exploring`, this.id);
          const spawnTiles = this.beliefs.getSpawnableTiles();
          if (spawnTiles.length === 0) {
            const q = new Queue<Action>();
            q.push(Action.NOOP);
            return q;
          }
          const target =
            spawnTiles[Math.floor(Math.random() * spawnTiles.length)];
          return generateHuntingPlan(this.beliefs, target.pos);
        }
        return plan;
      }
      case "go_pickup": {
        info(`Planning: go pickup parcel`, this.id);
        return generateSmartPlan(this.beliefs) ?? new Queue<Action>();
      }
      case "noop": {
        const q = new Queue<Action>();
        q.push(Action.NOOP);
        return q;
      }
    }
  }
}

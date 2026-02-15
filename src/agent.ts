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
import ConnectionManager from "src/coordination/ConnectionManager";
import Message, {
  AgentsDeletedMsg,
  HandoffMsg,
  IntentionMsg,
  ParcelsDeletedMsg,
} from "src/coordination/message";
import { Intention, getIntention } from "src/intentions";
import { PddlPlanner, generatePlanToPos } from "src/planning";
import { Action } from "src/planning/actions";
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
  private connectionManager: ConnectionManager;
  private lastTimestampUpdate: Timestamp | null = null;
  private plan: Queue<Action> = new Queue<Action>();
  private moveFailCount: number = 0;
  private currentScore: number = 0;
  private stopped: boolean = false;
  private beliefsChecksum: string = "";

  static readonly NOOP_ZZZ_MS = 100;

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
    this.pddlPlanner = new PddlPlanner(me.id, this.beliefs);
    this.connectionManager = new ConnectionManager(this);
  }

  static async build(options: AgentOptions): Promise<Agent> {
    const apiConnection = new DeliverooApi(config.deliverooHost, options.token);
    const agent = new Agent(
      apiConnection,
      await apiConnection.me,
      await apiConnection.map,
    );
    agent.connectionManager.start();
    agent.apiConnection.connect();

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
      msg = Message.fromJSON(any_msg);
    } catch (e) {
      console.error(e);
      error(
        `Failed to parse message: ${e instanceof Error ? e.message : String(e)}`,
        this.id,
      );
      return;
    }

    // Merge knowledge from the message into our beliefs about the sender agent
    this.beliefs.merge(msg.getReducedBeliefSet());

    const msgContent = msg.getContent();

    if (msgContent instanceof ParcelsDeletedMsg) {
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
    } else if (msgContent instanceof IntentionMsg) {
      debug(
        `IntentionMsg received from agent ${senderId}, intention: ${msgContent.getIntention().kind}`,
        this.id,
      );
      // TODO: Remove the received intention from our intention list
    } else if (msgContent instanceof HandoffMsg) {
      debug(
        `HandoffMsg received from agent ${senderId}, handoff parcels ${msgContent.getParcelIds()}`,
        this.id,
      );
      this.beliefs.resetHandedOffParcels(msgContent.getParcelIds());
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
    const deletedParcels =
      this.beliefs.updateKnownParcelsFromParcelUpdate(parcels);

    if (this.updateBeliefsChecksum() && config.recalculatePlanOnParcelUpdate) {
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

    if (this.updateBeliefsChecksum() && config.recalculatePlanOnParcelUpdate) {
      info(`Agents changed, dropping plan`, this.id);
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
      this.beliefs.updateAgentPos({
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

    this.currentScore = agent.score;
    this.lastTimestampUpdate = timestamp;
  };

  /**
   * Updates the beliefs checksum and returns true if it changed since the last update
   * This is used to detect if the beliefs have changed since the last time we checked, so we can decide if we need to revision the intentions
   * @returns true if the beliefs checksum changed since the last update, false otherwise
   */
  private updateBeliefsChecksum(): boolean {
    const newChecksum = this.beliefs.getChecksumOfBeliefs();
    const changed = this.beliefsChecksum !== newChecksum;
    this.beliefsChecksum = newChecksum;
    return changed;
  }

  run() {
    setTimeout(() => {
      this.nextFrame().finally(() => {
        if (this.isStopped()) {
          this.apiConnection.disconnect();
        } else {
          this.run();
        }
      });
    }, 0);
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
    this.frame++;

    const pos = this.beliefs.getAgentPos();
    if (!this.beliefs.mapContains(pos)) {
      error(`Position of agent out of bounds: (${pos.x}, ${pos.y})`);
      return;
    }

    // 1. Check if beliefs changed → invalidate current plan
    if (this.updateBeliefsChecksum()) {
      info(`Beliefs changed, clearing plan`, this.id);
      this.plan = new Queue<Action>();
    }

    // 2. Dequeue next action from current plan
    const nextAction = this.plan.shift();

    // 3. If plan is empty → select intention → generate new plan
    if (nextAction === undefined) {
      if (config.modeOfOperation === "centralized") {
        await this.centralizedPlanning();
      } else if (config.modeOfOperation === "decentralized") {
        await this.decentralizedPlanning();
      } else if (config.modeOfOperation === "pddl") {
        await this.pddlPlanning();
      } else {
        error(`Unknown mode of operation: ${config.modeOfOperation}`, this.id);
      }
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
  }

  private async centralizedPlanning(): Promise<void> {
    // TODO: Implement centralized mode of operation
    throw new Error("Centralized mode of operation not implemented yet");
  }

  private async decentralizedPlanning(): Promise<void> {
    info(`Plan is empty, selecting new intention and generating plan`, this.id);
    const intention = getIntention(this.beliefs);

    this.connectionManager.sendBroadcastMsg(new IntentionMsg(intention));
    this.plan = await this.generatePlan(intention);
    debug(
      `Generated plan for intention ${intention.kind}: ${this.plan.toArray().map((a) => Action[a])}`,
      this.id,
    );
  }

  private async pddlPlanning(): Promise<void> {
    info(`Plan is empty, generating new plan with PDDL planner`, this.id);

    const plan = await this.pddlPlanner.solvePddlProblem();
    if (plan) {
      this.plan = new Queue<Action>(plan);
    } else {
      error(`PDDL planner failed to find a plan, quitting`, this.id);
      this.stop();
    }

    debug(
      `Generated plan with PDDL planner: ${this.plan.toArray().map((a) => Action[a])}`,
      this.id,
    );
  }

  async executeAction(action: Action): Promise<boolean> {
    debug(`Executing action: ${Action[action]}`, this.id);

    const pos = this.beliefs.getAgentPos();

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
      case Action.HANDOFF:
        return await this.deliver(true);
      case Action.NOOP:
        await new Promise((resolve) => setTimeout(resolve, Agent.NOOP_ZZZ_MS));
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
    this.beliefs.updateAgentPos(expected);
    this.beliefs.markVisibleSpawnableTilesSeen(
      config.parcelSensingDistance - 1,
    );
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

  async deliver(handoff: boolean = false): Promise<boolean> {
    // NOTE: This must be before the API call because otherwise stuff will be overwritten by the onParcelSensing hook.
    if (handoff) {
      this.connectionManager.sendBroadcastMsg(
        new HandoffMsg(
          Array.from(this.beliefs.getCarriedParcels()).map((p) => p.getId()),
        ),
      );
      this.beliefs.handoffParcels();
    } else {
      this.beliefs.deliverParcels();
    }

    const result = await this.apiConnection.emitPutdown();
    if (result.length === 0) {
      error(`Deliver failed, no parcel delivered`, this.id);
      return false;
    }
    return true;
  }

  async generatePlan(intention: Intention): Promise<Queue<Action>> {
    let plan: Queue<Action>;
    switch (intention.kind) {
      case "explore_spawn":
        plan = generatePlanToPos(this.beliefs, intention.tile.pos);
        break;

      case "handoff": {
        plan = generatePlanToPos(this.beliefs, intention.pos);
        plan.push(Action.HANDOFF);
        break;
      }

      case "deliver_parcels":
        plan = generatePlanToPos(this.beliefs, intention.pos);
        plan.push(Action.DELIVER);
        break;

      case "go_pickup":
        plan = generatePlanToPos(this.beliefs, intention.pos);
        plan.push(Action.PICKUP);
        break;

      case "noop":
        plan = new Queue<Action>([Action.NOOP]);
        break;
    }

    return plan;
  }
}

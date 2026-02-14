import Message, { HandshakeMsg, MsgType } from "src/coordination/message";
import Agent from "src/agent";
import { warn } from "src/utils/log";
import { BeliefSet, BeliefSetWithoutMap } from "src/beliefs";

export default class ConnectionManager {
  private agentRef: Agent;
  private messageStore: Map<string, Date> = new Map(); // Last reported check in from broadcast messages

  static readonly BEACON_INTERVAL_MS = 500;

  constructor(agentRef: Agent) {
    this.agentRef = agentRef;
  }

  getKnownAgents(): string[] {
    return Array.from(this.messageStore.keys());
  }

  async start(): Promise<void> {
    this.beaconPresence();
    this.agentClusterGC();

    while (!this.agentRef.isStopped()) {
      await new Promise((resolve) =>
        setTimeout(resolve, ConnectionManager.BEACON_INTERVAL_MS),
      );
    }
  }

  sendBroadcastMsg(type: MsgType): void {
    const id = Math.random().toString(36).substring(2, 10);
    // FIXME: BeliefSet also contains map, we should avoid it
    const msg = new Message(id, type, this.agentRef.getBeliefSet());
    this.agentRef.getApi().emitShout(msg);
  }

  sendUnicastMsg(agentId: string, type: MsgType): void {
    const id = Math.random().toString(36).substring(2, 10);
    // FIXME: BeliefSet also contains map, we should avoid it
    const msg = new Message(id, type, this.agentRef.getBeliefSet());
    this.agentRef.getApi().emitSay(agentId, msg);
  }

  private async beaconPresence(): Promise<void> {
    while (!this.agentRef.isStopped()) {
      this.sendBroadcastMsg(
        new HandshakeMsg(Array.from(this.getKnownAgents())),
      );

      await new Promise((resolve) =>
        setTimeout(resolve, ConnectionManager.BEACON_INTERVAL_MS),
      );
    }
  }

  private async agentClusterGC(): Promise<void> {
    while (!this.agentRef.isStopped()) {
      const now = new Date();
      for (const [agentId, lastCheckIn] of this.messageStore.entries()) {
        if (
          now.getTime() - lastCheckIn.getTime() >
          ConnectionManager.BEACON_INTERVAL_MS * 2
        ) {
          warn(`Agent ${agentId} removed from known agents due to inactivity.`);
          this.messageStore.delete(agentId);
          // TODO: Hook for agent disappearance, must update beliefs
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, ConnectionManager.BEACON_INTERVAL_MS),
      );
    }
  }

  async handleReceivedHandshakeMsg(agentId: string): Promise<void> {
    this.messageStore.set(agentId, new Date());
  }
}

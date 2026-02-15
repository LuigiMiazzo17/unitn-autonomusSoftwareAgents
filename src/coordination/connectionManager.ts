import Agent from "src/agent";
import Message, { HandshakeMsg, MessageType } from "src/coordination/message";
import { warn } from "src/utils/log";

export default class ConnectionManager {
  private agentRef: Agent;

  static readonly BEACON_INTERVAL_MS = 500;

  constructor(agentRef: Agent) {
    this.agentRef = agentRef;
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

  sendBroadcastMsg(type: MessageType): void {
    const msg = new Message(type, this.agentRef.getBeliefSet());

    this.agentRef.getApi().emitShout(msg.toObject());
  }

  sendUnicastMsg(agentId: string, type: MessageType): void {
    const msg = new Message(type, this.agentRef.getBeliefSet());
    this.agentRef.getApi().emitSay(agentId, msg.toObject());
  }

  private async beaconPresence(): Promise<void> {
    while (!this.agentRef.isStopped()) {
      this.sendBroadcastMsg(new HandshakeMsg());

      await new Promise((resolve) =>
        setTimeout(resolve, ConnectionManager.BEACON_INTERVAL_MS),
      );
    }
  }

  private async agentClusterGC(): Promise<void> {
    while (!this.agentRef.isStopped()) {
      const now = new Date();
      const agentBeliefs = this.agentRef.getBeliefSet();
      for (const agent of agentBeliefs.getGroupAgents()) {
        if (
          now.getTime() - agent.getLastSeen().getTime() >
          ConnectionManager.BEACON_INTERVAL_MS * 2
        ) {
          warn(
            `Agent ${agent.getId()} removed from known agents due to inactivity.`,
          );
          agentBeliefs.removeAgent(agent.getId());
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, ConnectionManager.BEACON_INTERVAL_MS),
      );
    }
  }
}

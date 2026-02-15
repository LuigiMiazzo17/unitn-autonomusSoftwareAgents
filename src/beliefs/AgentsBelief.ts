import { AgentFromUpdate } from "@unitn-asa/deliveroo-js-client";
import config from "config";
import { ExternalAgent, MeAgent } from "src/beliefs/agents";
import { Position } from "src/beliefs/types";
import { debug, error } from "src/utils/log";

export default class AgentsBelief {
  public me: MeAgent;
  private foreignAgents: Map<string, ExternalAgent> = new Map();
  private groupAgents: Map<string, ExternalAgent> = new Map();

  constructor(id: string, pos: Position) {
    this.me = new MeAgent(id, pos);
  }

  static fromJSON(o: object): AgentsBelief {
    const me = ExternalAgent.fromJSON(o["me"]);
    const belief = new AgentsBelief(me.getId(), me.getPos());
    belief.foreignAgents = new Map<string, ExternalAgent>(
      Object.entries(o["foreignAgents"]).map(([id, agent]) => [
        id,
        ExternalAgent.fromJSON(agent as object),
      ]),
    );
    belief.groupAgents = new Map<string, ExternalAgent>(
      Object.entries(o["groupAgents"]).map(([id, agent]) => [
        id,
        ExternalAgent.fromJSON(agent as object),
      ]),
    );
    return belief;
  }

  getGroupAgents(): MapIterator<ExternalAgent> {
    return this.groupAgents.values();
  }

  getAllAgents(): ExternalAgent[] {
    const allAgents: ExternalAgent[] = [
      ...this.foreignAgents.values(),
      ...this.groupAgents.values(),
    ];
    return allAgents;
  }

  getMasterAgentId(): string | null {
    if (this.groupAgents.size === 0) {
      return null;
    }
    const sortedGroupAgents = Array.from(this.groupAgents.values()).sort(
      (a, b) => a.getId().localeCompare(b.getId()),
    );
    return sortedGroupAgents[0].getId();
  }

  updateAgents(agents: AgentFromUpdate[]): Set<string> {
    for (const rawAgent of agents) {
      const agent = ExternalAgent.fromUpdateAgent(rawAgent);

      const optionalGroupAgent = this.groupAgents.get(agent.getId());

      if (optionalGroupAgent) this.setGroupAgent(agent);
      else this.setForeignAgent(agent);
    }

    const safetyMargin = 1;

    // Get all known agentIds that are within agent sensing range,
    // if not present in the update, remove them because they are expired.
    const deletedAgentIds = new Set<string>();
    for (const [agentId, agent] of this.foreignAgents) {
      const distance = this.me.manhattanDistance(agent.getPos());
      if (
        distance < config.agentSensingDistance - safetyMargin &&
        !agents.some((a) => a.id === agentId)
      ) {
        deletedAgentIds.add(agentId);
        debug(
          `Agent ${agentId} is within sensing range but not in the update, removing from foreign agents`,
        );
      }
    }
    this.removeForeignAgentsById(deletedAgentIds);

    // We don't want to remove group agents, because they are better handled
    // with the connection manager

    return deletedAgentIds;
  }

  removeAgent(agentId: string): void {
    if (this.groupAgents.has(agentId)) {
      debug(`Removing agent ${agentId} from group agents`);
      this.groupAgents.delete(agentId);
    } else if (this.foreignAgents.has(agentId)) {
      debug(`Removing agent ${agentId} from foreign agents`);
      this.foreignAgents.delete(agentId);
    } else {
      error(`Cannot remove agent ${agentId} - not found in known agents`);
    }
  }

  removeForeignAgentsById(agentIds: Set<string>): void {
    for (const agentId of agentIds) {
      if (this.foreignAgents.has(agentId)) {
        this.foreignAgents.delete(agentId);
        debug(`Removed agent ${agentId} from foreign agents`);
      }
    }
  }

  merge(otherAgentsBelief: AgentsBelief, updateSeen: boolean): void {
    const otherAgentId = otherAgentsBelief.me.getId();

    // First thing first, update the agent who sent the message
    const groupAgent = this.groupAgents.get(otherAgentId);
    if (groupAgent) {
      groupAgent.updatePos(otherAgentsBelief.me.getPos());
      if (updateSeen) {
        groupAgent.setSeen();
      }
    } else {
      this.setGroupAgent(ExternalAgent.fromMeAgent(otherAgentsBelief.me));
    }

    // If sender is in foreign agents, move it to group agents because we now know that it's in our group
    this.promoteToGroupAgent(ExternalAgent.fromMeAgent(otherAgentsBelief.me));

    // Now update all foreign agent knowledge
    for (const [
      foreignAgentId,
      foreignAgent,
    ] of otherAgentsBelief.foreignAgents) {
      if (foreignAgentId === this.me.getId()) {
        error(`Agent ${otherAgentId} thinks we are a foreign agent, ignoring`);
        continue;
      }

      this.upsertForeignAgent(foreignAgent);
    }

    for (const [groupAgentId, groupAgent] of otherAgentsBelief.groupAgents) {
      if (groupAgentId === this.me.getId()) {
        debug("Don't process our self in group update");
        continue;
      }

      this.upsertGroupAgent(groupAgent);
    }
  }

  clear() {
    this.foreignAgents.clear();
    this.groupAgents.clear();
  }

  /**
   * Adds a new foreign agent or updates an existing one if the new information is more recent.
   * @param newAgent The new or updated foreign agent to add.
   */
  private upsertForeignAgent(newAgent: ExternalAgent): void {
    const currentAgent = this.foreignAgents.get(newAgent.getId());
    if (!currentAgent || newAgent.getLastSeen() > currentAgent.getLastSeen()) {
      this.setForeignAgent(newAgent);
    }
  }

  private setForeignAgent(newAgent: ExternalAgent): void {
    this.foreignAgents.set(newAgent.getId(), newAgent);
  }

  private setGroupAgent(newAgent: ExternalAgent): void {
    this.groupAgents.set(newAgent.getId(), newAgent);
  }

  /**
   * Adds a new group agent or updates an existing one if the new information is more recent.
   * @param newAgent The new or updated group agent to add.
   */
  private upsertGroupAgent(newAgent: ExternalAgent): void {
    this.promoteToGroupAgent(newAgent);

    const currentAgent = this.groupAgents.get(newAgent.getId());
    if (!currentAgent || newAgent.getLastSeen() > currentAgent.getLastSeen()) {
      this.setGroupAgent(newAgent);
    }
  }

  private promoteToGroupAgent(newAgent: ExternalAgent): void {
    const agent = this.foreignAgents.get(newAgent.getId());
    if (agent) {
      this.foreignAgents.delete(agent.getId());
    }
    this.setGroupAgent(newAgent);
  }
}

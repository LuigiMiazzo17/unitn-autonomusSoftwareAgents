import { ReducedBeliefSet, ReducedBeliefSetWithout } from "src/beliefs";

export default class Message {
  private content: MsgType;
  private agentType: "svejaMacachi";
  private beliefSet: ReducedBeliefSet;

  constructor(type: MsgType, beliefSet: ReducedBeliefSet) {
    this.content = type;
    this.agentType = "svejaMacachi";
    this.beliefSet = beliefSet;
  }

  getType() {
    return this.content;
  }
  getAgentType() {
    return this.agentType;
  }

  getReducedBeliefSet() {
    return this.beliefSet;
  }

  getContent() {
    return this.content;
  }

  static fromObject(obj: any): Message {
    if (typeof obj.agentType !== "string") {
      throw new Error("Invalid message: agentType should be a string");
    }
    if (obj.agentType !== "svejaMacachi") {
      throw new Error(
        `Invalid message: agentType should be "svejaMacachi", got "${obj.agentType}"`,
      );
    }
    return new Message(
      MessageTypeFactory.fromObject(obj.content),
      ReducedBeliefSetWithout.fromObject(obj.beliefSet),
    );
  }

  toObject(): any {
    return {
      content: this.content.toObject(),
      agentType: this.agentType,
      beliefSet: this.beliefSet.toObject(),
    };
  }
}

export interface MsgType {
  type: "handshake" | "parcelsDeleted" | "agentsDeleted";
  toObject(): any;
}

export class HandshakeMsg implements MsgType {
  readonly type = "handshake";

  constructor() {}

  toObject(): any {
    return {
      type: this.type,
    };
  }
}

export class ParcelsDeletedMsg implements MsgType {
  readonly type = "parcelsDeleted";
  private parcelIds: string[];

  constructor(parcelIds: Set<string>) {
    this.parcelIds = Array.from(parcelIds);
  }

  getParcelIds(): Set<string> {
    return new Set(this.parcelIds);
  }

  toObject(): any {
    return {
      type: this.type,
      parcelIds: this.parcelIds,
    };
  }
}

export class AgentsDeletedMsg implements MsgType {
  readonly type = "agentsDeleted";
  private agentIds: string[];

  constructor(agentIds: Set<string>) {
    this.agentIds = Array.from(agentIds);
  }

  getAgentIds(): Set<string> {
    return new Set(this.agentIds);
  }

  toObject(): any {
    return {
      type: this.type,
      agentIds: this.agentIds,
    };
  }
}

export class MessageTypeFactory {
  static fromObject(obj: any): MsgType {
    if (typeof obj.type !== "string") {
      throw new Error("Invalid message type: type should be a string");
    }

    switch (obj.type) {
      case "handshake":
        return new HandshakeMsg();

      case "parcelsDeleted":
        if (!Array.isArray(obj.parcelIds)) {
          throw new Error(
            "Invalid parcelsDeleted message: parcelIds should be an array",
          );
        }
        const set = new Set<string>();
        for (const id of obj.parcelIds) {
          if (typeof id !== "string") {
            throw new Error(
              "Invalid parcelsDeleted message: each parcelId should be a string",
            );
          }
          set.add(id);
        }
        return new ParcelsDeletedMsg(set);

      case "agentsDeleted":
        if (!Array.isArray(obj.agentIds)) {
          throw new Error(
            "Invalid agentsDeleted message: agentIds should be an array",
          );
        }
        const agentSet = new Set<string>();
        for (const id of obj.agentIds) {
          if (typeof id !== "string") {
            throw new Error(
              "Invalid agentsDeleted message: each agentId should be a string",
            );
          }
          agentSet.add(id);
        }
        return new AgentsDeletedMsg(agentSet);

      default:
        throw new Error(`Unknown message type: ${obj.type}`);
    }
  }
}

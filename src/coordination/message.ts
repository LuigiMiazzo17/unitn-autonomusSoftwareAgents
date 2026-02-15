import { ReducedBeliefSet } from "src/beliefs";
import { Queue } from "queue-typed";
import { Action } from "src/planning/actions";
import { Intention } from "src/intentions";

export default class Message {
  private content: MessageType;
  private agentType: "svejaMacachi";
  private beliefSet: ReducedBeliefSet;

  constructor(type: MessageType, beliefSet: ReducedBeliefSet) {
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

  static fromJSON(obj: object): Message {
    if (obj.agentType !== "svejaMacachi") {
      throw new Error(
        `Invalid message: agentType should be "svejaMacachi", got "${obj.agentType}"`,
      );
    }
    return new Message(
      MessageTypeFactory.fromJSON(obj.content),
      ReducedBeliefSet.fromJSON(obj.beliefSet),
    );
  }

  toObject(): object {
    return {
      content: this.content.toObject(),
      agentType: this.agentType,
      beliefSet: this.beliefSet.toObject(),
    };
  }
}

export interface MessageType {
  type: "handshake" | "parcelsDeleted" | "agentsDeleted" | "intention";
  toObject(): object;
}

export class HandshakeMsg implements MessageType {
  readonly type = "handshake";

  constructor() {}

  toObject(): object {
    return {
      type: this.type,
    };
  }
}

export class ParcelsDeletedMsg implements MessageType {
  readonly type = "parcelsDeleted";
  private parcelIds: string[];

  constructor(parcelIds: Set<string>) {
    this.parcelIds = Array.from(parcelIds);
  }

  getParcelIds(): Set<string> {
    return new Set(this.parcelIds);
  }

  toObject(): object {
    return {
      type: this.type,
      parcelIds: this.parcelIds,
    };
  }
}

export class AgentsDeletedMsg implements MessageType {
  readonly type = "agentsDeleted";
  private agentIds: string[];

  constructor(agentIds: Set<string>) {
    this.agentIds = Array.from(agentIds);
  }

  getAgentIds(): Set<string> {
    return new Set(this.agentIds);
  }

  toObject(): object {
    return {
      type: this.type,
      agentIds: this.agentIds,
    };
  }
}

export class IntentionMsg implements MessageType {
  readonly type = "intention";
  private intention: Intention;

  constructor(intention: Intention) {
    this.intention = intention;
  }

  getIntention(): Intention {
    return this.intention;
  }

  toObject(): object {
    return {
      type: this.type,
      intention: this.intention,
    };
  }
}

export class MessageTypeFactory {
  static fromJSON(obj: object): MessageType {
    switch (obj.type) {
      case "handshake":
        return new HandshakeMsg();

      case "parcelsDeleted":
        return Object.assign(new ParcelsDeletedMsg(new Set<string>()), obj);

      case "agentsDeleted":
        return Object.assign(new AgentsDeletedMsg(new Set<string>()), obj);

      case "intention":
        return Object.assign(new IntentionMsg(new Queue<Action>()), obj);

      default:
        throw new Error(`Unknown message type: ${obj.type}`);
    }
  }
}

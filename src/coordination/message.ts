import { BeliefSetWithoutMap, BeliefSetWithoutMapFactory } from "src/beliefs";

export default class Message {
  private id: string;
  private content: MsgType;
  private agentType: "svejaMacachi";
  private beliefSet: BeliefSetWithoutMap;

  constructor(id: string, type: MsgType, beliefSet: BeliefSetWithoutMap) {
    this.id = id;
    this.content = type;
    this.agentType = "svejaMacachi";
    this.beliefSet = beliefSet;
  }

  getId() {
    return this.id;
  }

  getType() {
    return this.content;
  }
  getAgentType() {
    return this.agentType;
  }

  getBeliefSet() {
    return this.beliefSet;
  }

  static fromObject(obj: any): Message {
    if (typeof obj.id !== "string") {
      throw new Error("Invalid message: id should be a string");
    }
    if (typeof obj.agentType !== "string") {
      throw new Error("Invalid message: agentType should be a string");
    }
    if (obj.agentType !== "svejaMacachi") {
      throw new Error(
        `Invalid message: agentType should be "svejaMacachi", got "${obj.agentType}"`,
      );
    }
    return new Message(
      obj.id,
      MessageTypeFactory.fromObject(obj.content),
      BeliefSetWithoutMapFactory.fromObject(obj.beliefSet),
    );
  }
}

export interface MsgType {
  type: "handshake";
}

export class HandshakeMsg implements MsgType {
  readonly type = "handshake";
  private otherKnownAgentsIds: string[];

  constructor(otherAgentsIds: string[]) {
    this.otherKnownAgentsIds = otherAgentsIds;
  }

  getOtherKnownAgentsIds() {
    return this.otherKnownAgentsIds;
  }
}

export class MessageTypeFactory {
  static fromObject(obj: any): MsgType {
    switch (obj.type) {
      case "handshake":
        if (!Array.isArray(obj.otherKnownAgentsIds)) {
          throw new Error(
            "Invalid handshake message: otherKnownAgentsIds should be an array",
          );
        }
        return new HandshakeMsg(obj.otherKnownAgentsIds);
      default:
        throw new Error(`Unknown message type: ${obj.type}`);
    }
  }
}

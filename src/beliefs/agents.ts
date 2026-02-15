import { AgentFromUpdate } from "@unitn-asa/deliveroo-js-client";
import { Position } from "./types";

export class MeAgent {
  protected id: string;
  protected pos: Position;

  constructor(id: string, pos: Position) {
    this.id = id;
    this.pos = pos;
  }

  static fromJSON(o: object): MeAgent {
    return Object.assign(new MeAgent("", { x: 0, y: 0 }), o);
  }

  /**
   * Calculates the Manhattan distance from this agent's position to the given position.
   * @param pos The position to calculate the distance to.
   * @returns The Manhattan distance as a number.
   */
  manhattanDistance(pos: Position): number {
    return Math.abs(this.pos.x - pos.x) + Math.abs(this.pos.y - pos.y);
  }

  isOn(pos: Position): boolean {
    return Math.floor(this.pos.x) === pos.x && Math.floor(this.pos.y) === pos.y;
  }

  getId(): string {
    return this.id;
  }

  getPos(): Position {
    return this.pos;
  }

  updatePos(pos: Position): void {
    this.pos = pos;
  }
}

export class ExternalAgent extends MeAgent {
  private lastSeen: Date;

  constructor(id: string, pos: Position, lastSeen?: Date) {
    super(id, pos);
    this.lastSeen = lastSeen ?? new Date();
  }

  static fromUpdateAgent(agent: AgentFromUpdate): ExternalAgent {
    return new ExternalAgent(
      agent.id,
      {
        x: Math.floor(agent.x),
        y: Math.floor(agent.y),
      },
      new Date(),
    );
  }

  static fromMeAgent(me: MeAgent): ExternalAgent {
    return new ExternalAgent(me.getId(), me.getPos(), new Date());
  }

  static fromJSON(o: object): ExternalAgent {
    const ea = Object.assign(new ExternalAgent("", { x: 0, y: 0 }), o);
    ea.lastSeen = new Date(o["lastSeen"]);
    return ea;
  }

  getLastSeen() {
    return this.lastSeen;
  }

  setSeen() {
    this.lastSeen = new Date();
  }
}

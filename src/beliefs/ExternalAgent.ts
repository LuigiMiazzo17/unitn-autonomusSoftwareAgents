import { AgentFromUpdate } from "@unitn-asa/deliveroo-js-client";
import { Position } from "./types";

export default class ExternalAgent {
  private id: string;
  private pos: Position;
  private lastSeen: Date;

  constructor(id: string, pos: Position, lastSeen?: Date) {
    this.id = id;
    this.pos = pos;
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

  static fromJSON(o: object): ExternalAgent {
    const ea = Object.assign(new ExternalAgent("", { x: 0, y: 0 }), o);
    ea.lastSeen = new Date(o["lastSeen"]);
    return ea;
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

  getLastSeen() {
    return this.lastSeen;
  }

  setSeen() {
    this.lastSeen = new Date();
  }
}

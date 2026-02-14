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

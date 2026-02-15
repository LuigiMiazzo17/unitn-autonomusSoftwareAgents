import { Parcel as DeliverooParcelType } from "@unitn-asa/deliveroo-js-client";
import { Position } from "src/beliefs/types";

export default class Parcel {
  private id: string;
  private pos: Position;
  private carriedBy?: string;
  private reward: number;
  private lastSeen: Date;

  constructor(
    id: string,
    pos: Position,
    reward: number,
    carriedBy?: string,
    lastSeen?: Date,
  ) {
    this.id = id;
    this.pos = pos;
    this.reward = reward;
    this.carriedBy = carriedBy;
    this.lastSeen = lastSeen ?? new Date();
  }

  static fromUpdateParcel(parcel: DeliverooParcelType): Parcel {
    return new Parcel(
      parcel.id,
      { x: Math.floor(parcel.x), y: Math.floor(parcel.y) },
      parcel.reward,
      parcel.carriedBy,
    );
  }

  getId(): string {
    return this.id;
  }

  getPos(): Position {
    return this.pos;
  }

  setPos(pos: Position): void {
    this.pos = pos;
  }

  getReward(): number {
    return this.reward;
  }

  setReward(reward: number): void {
    this.reward = reward;
  }

  getCarriedBy(): string | undefined {
    return this.carriedBy;
  }

  setCarriedBy(agentId?: string): void {
    this.carriedBy = agentId;
  }

  getLastSeen(): Date {
    return this.lastSeen;
  }

  setSeen(): void {
    this.lastSeen = new Date();
  }
}

import {
  Agent as DeliverooAgentType,
  Parcel,
  Tile,
} from "@unitn-asa/deliveroo-js-client";

enum TileType {
  WALL,
  SPAWNABLE,
  EMPTY,
  DELIVERY,
}

export type Position = {
  x: number;
  y: number;
};

export class BelifsSet {
  private pos: Position;
  private map: TileType[][];
  private parcels: Parcel[] = [];
  private agents: DeliverooAgentType[] = [];

  constructor(
    map: { width: number; height: number; tiles: Tile[] },
    pos: Position,
  ) {
    this.map = BelifsSet.convertMap(map);
    this.pos = pos;
  }

  updatePos(pos: Position): void {
    this.pos = pos;
  }

  getPos(): Position {
    return this.pos;
  }

  updateMap(width: number, height: number, tiles: Tile[]): void {
    this.map = BelifsSet.convertMap({ width, height, tiles });
  }

  updateParcels(parcels: Parcel[]): void {
    for (const parcel of parcels) {
      const index = this.parcels.findIndex((p) => p.id === parcel.id);
      if (index !== -1) {
        this.parcels[index] = parcel;
      } else {
        this.parcels.push(parcel);
      }
    }
  }

  updateAgents(agents: DeliverooAgentType[]): void {
    for (const agent of agents) {
      const index = this.agents.findIndex((a) => a.id === agent.id);
      if (index !== -1) {
        this.agents[index] = agent;
      } else {
        this.agents.push(agent);
      }
    }
  }

  static convertMap(m: {
    width: number;
    height: number;
    tiles: Tile[];
  }): TileType[][] {
    const map = Array.from({ length: m.height }, () =>
      Array(m.width).fill(TileType.EMPTY),
    );

    for (const tile of m.tiles) {
      if (tile.type === 0) {
        map[tile.y][tile.x] = TileType.EMPTY;
      } else if (tile.type === 1) {
        map[tile.y][tile.x] = TileType.SPAWNABLE;
      } else if (tile.type === 2) {
        map[tile.y][tile.x] = TileType.DELIVERY;
      } else if (tile.type === 3) {
        map[tile.y][tile.x] = TileType.WALL;
      } else {
        throw new Error(`Unknown tile type: ${tile.type}`);
      }
    }

    return map;
  }

  definePddlProblem(): string {
    const objects = ["agent1 - agent"];
    const init = [];

    for (let y = 0; y < this.map.length; y++) {
      for (let x = 0; x < this.map[y].length; x++) {
        const tile = this.map[y][x];
        if (tile === TileType.WALL) {
          continue;
        }
        objects.push(`tile${x}_${y} - tile`);

        if (tile === TileType.SPAWNABLE) {
          init.push(`(delivery_tile tile${x}_${y})`);
        }

        const directions = [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ];

        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;
          if (
            nx >= 0 &&
            nx < this.map[0].length &&
            ny >= 0 &&
            ny < this.map.length &&
            this.map[ny][nx] !== TileType.WALL
          ) {
            init.push(`(adjacent tile${x}_${y} tile${nx}_${ny})`);
          }
        }
      }
    }

    for (const parcel of this.parcels) {
      if (parcel.carriedBy) {
        continue;
      }
      objects.push(`parcel${parcel.id} - parcel`);
      init.push(`(parcel_at parcel${parcel.id} tile${parcel.x}_${parcel.y})`);
      init.push(`(not (delivered parcel${parcel.id}))`);
    }

    for (const agent of this.agents) {
      init.push(`(blocked tile${agent.x}_${agent.y})`);
    }

    // init.push(`(at agent1 tile${this.pos.x}_${this.pos.y})`);
    init.push(`(at agent1 tile2_3)`);

    const goal = [];
    for (const parcel of this.parcels) {
      if (parcel.carriedBy) {
        continue;
      }
      goal.push(`(delivered parcel${parcel.id})`);
    }

    return `(define (problem deliveroo-problem) (:domain deliveroo) (:objects ${objects.join("\n")}) (:init ${init.join("\n")}) (:goal (and ${goal.join("\n")})))`;
  }
}

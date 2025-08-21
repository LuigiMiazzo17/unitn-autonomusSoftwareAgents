import {
  Agent as AgentFromMeType,
  DeliverooApi,
  Parcel,
  Tile,
} from "@unitn-asa/deliveroo-js-client";
import config from "config";
import { debug, info } from "src/utils/log";

const FRAME_ADVANCE_INTERVAL = 10;

export type AgentOptions = {
  token?: string | null;
};

type Position = {
  x: number;
  y: number;
};

enum TileType {
  WALL,
  SPAWNABLE,
  EMPTY,
  DELIVERY,
}

export default class Agent {
  apiConnection: DeliverooApi;
  frame: number = 0;
  id: string;
  pos: Position;
  map: TileType[][];

  onMap: (width: number, height: number, tiles: Tile[]) => void = (
    width,
    height,
    tiles,
  ) => {
    info(`Map update event: ${width}x${height}`, this.id);
    this.map = Agent.convertMap({ width, height, tiles });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMsg: (msg: any) => void = (msg) => {
    info(`Received message: ${JSON.stringify(msg)}`, this.id);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAgentConnected: (state: string, agent: any) => void = (state, agent) => {
    info(
      `Agent connected: '${JSON.stringify(agent)}’ is now ${state}`,
      this.id,
    );
  };

  onParcelSensing: (parcels: Parcel[]) => void = (parcels) => {
    info(`Parcels sensing event: ${parcels.length} parcels`, this.id);
  };

  onAgentsSensing: (agents: AgentFromMeType[]) => void = (agents) => {
    info(`Agents sensing event: ${agents.length} agents`, this.id);
  };

  constructor(
    apiConnection: DeliverooApi,
    me: AgentFromMeType,
    map: { width: number; height: number; tiles: Tile[] },
  ) {
    this.apiConnection = apiConnection;

    this.id = me.id;
    this.pos = {
      x: me.x,
      y: me.y,
    };

    this.map = Agent.convertMap(map);
    this.apiConnection.onMap(this.onMap);
    this.apiConnection.onAgentConnected(this.onAgentConnected);
    this.apiConnection.onMsg(this.onMsg);
    this.apiConnection.onParcelsSensing(this.onParcelSensing);
    this.apiConnection.onAgentsSensing(this.onAgentsSensing);
  }

  static async build(options: AgentOptions): Promise<Agent> {
    const apiConnection = new DeliverooApi(config.host, options.token);

    return new Agent(
      apiConnection,
      await apiConnection.me,
      await apiConnection.map,
    );
  }

  async run(): Promise<void> {
    this.apiConnection.connect();

    info(`Agent started at position (${this.pos.x}, ${this.pos.y})`, this.id);

    while (true) {
      const start = Date.now();
      await this.frameAdvance();

      const elapsed = Date.now() - start;
      if (elapsed < FRAME_ADVANCE_INTERVAL) {
        await new Promise((resolve) =>
          setTimeout(resolve, FRAME_ADVANCE_INTERVAL - elapsed),
        );
      }
    }
  }

  async frameAdvance(): Promise<void> {
    if (this.frame % 100 === 0) {
      debug(`Frame advanced to ${this.frame}`, this.id);
    }

    this.frame++;
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
}

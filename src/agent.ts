import {
  Agent as DeliverooAgentType,
  DeliverooApi,
  Parcel,
  Tile,
} from "@unitn-asa/deliveroo-js-client";
import config from "config";
import { BelifsSet } from "src/belifs";
import { debug, info } from "src/utils/log";

const FRAME_ADVANCE_INTERVAL = 10;

export type AgentOptions = {
  token?: string | null;
};

type Position = {
  x: number;
  y: number;
};

export default class Agent {
  private apiConnection: DeliverooApi;
  private frame: number = 0;
  private id: string;
  private pos: Position;
  private belifs: BelifsSet;

  onMap: (width: number, height: number, tiles: Tile[]) => void = (
    width,
    height,
    tiles,
  ) => {
    info(`Map update event: ${width}x${height}`, this.id);
    this.belifs.updateMap(width, height, tiles);
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
    this.belifs.updateParcels(parcels);
  };

  onAgentsSensing: (agents: DeliverooAgentType[]) => void = (agents) => {
    info(`Agents sensing event: ${agents.length} agents`, this.id);
    this.belifs.updateAgents(agents);
  };

  constructor(
    apiConnection: DeliverooApi,
    me: DeliverooAgentType,
    map: { width: number; height: number; tiles: Tile[] },
  ) {
    this.apiConnection = apiConnection;

    this.id = me.id;
    this.pos = {
      x: me.x,
      y: me.y,
    };

    this.apiConnection.onMap(this.onMap);
    this.apiConnection.onAgentConnected(this.onAgentConnected);
    this.apiConnection.onMsg(this.onMsg);
    this.apiConnection.onParcelsSensing(this.onParcelSensing);
    this.apiConnection.onAgentsSensing(this.onAgentsSensing);

    this.belifs = new BelifsSet(map);
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
}

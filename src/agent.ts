import {
  DeliverooApi,
  Agent as AgentFromMeType,
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

export default class Agent {
  apiConnection: DeliverooApi;
  frame: number = 0;
  id: string;
  pos: Position;

  constructor(apiConnection: DeliverooApi, me: AgentFromMeType) {
    this.apiConnection = apiConnection;

    this.id = me.id;
    this.pos = {
      x: me.x,
      y: me.y,
    };
  }

  static async build(options: AgentOptions): Promise<Agent> {
    const apiConnection = new DeliverooApi(config.host, options.token, true);

    return new Agent(apiConnection, await apiConnection.me);
  }

  async run(): Promise<void> {
    this.apiConnection.connect();
    // const map = await this.apiConnection.map;

    info(`Agent ${this.id} started at position (${this.pos.x}, ${this.pos.y})`);

    while (true) {
      const start = Date.now();
      await this.frame_advance();

      const elapsed = Date.now() - start;
      if (elapsed < FRAME_ADVANCE_INTERVAL) {
        await new Promise((resolve) =>
          setTimeout(resolve, FRAME_ADVANCE_INTERVAL - elapsed),
        );
      }
    }
  }

  async frame_advance(): Promise<void> {
    if (this.frame % 100 === 0) {
      debug("", `Frame ${this.frame} for agent ${this.id}`);
    }

    this.frame++;
  }
}

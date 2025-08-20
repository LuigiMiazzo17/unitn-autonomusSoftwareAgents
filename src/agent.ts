import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import config from "config";
import { error } from "src/utils/log";

export type AgentOptions = {
  token?: string | null;
};

export default class Agent {
  apiConnection: DeliverooApi;

  constructor(options: AgentOptions) {
    this.apiConnection = new DeliverooApi(config.host, options.token);
  }

  async run(): Promise<void> {
    error("Agent is not implemented yet");
  }
}

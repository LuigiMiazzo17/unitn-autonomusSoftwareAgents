declare module "@unitn-asa/deliveroo-js-client" {
  // replicate typedefs from ioTypedSocket
  export interface Agent {
    id: string;
    name: string;
    teamId: string;
    teamName: string;
    x: number;
    y: number;
    score: number;
    penalty: number;
  }

  export interface Parcel {
    id: string;
    x: number;
    y: number;
    carriedBy?: string;
    reward: number;
  }

  export interface Tile {
    x: number;
    y: number;
    type: string;
  }

  export interface Timestamp {
    ms: number;
    frame: number;
  }

  export interface ClientEvents {
    disconnect: () => void;
    move: (
      dir: "up" | "right" | "left" | "down" | { x: number; y: number },
      cb?: (xy: { x: number; y: number } | false) => void,
    ) => { x: number; y: number } | false;
    pickup: (cb?: (parcels: { id: string }[]) => void) => { id: string }[];
    putdown: (
      ids?: string[],
      cb?: (parcels: { id: string }[]) => void,
    ) => { id: string }[];
    say: (to: string, msg: any, cb: (status: "successful") => void) => void;
    ask: (to: string, msg: any, cb: (reply: any) => void) => void;
    shout: (msg: any, cb: (reply: any) => void) => void;
    parcel: (
      action: "create" | "dispose" | "set",
      data: { x: number; y: number } | { id: string; reward?: number },
    ) => void;
    restart: () => void;
    tile: (tile: Tile) => void;
    log: (...args: any[]) => void;
  }

  export interface ServerEvents {
    connect: () => void;
    disconnect: () => void;
    config: (cfg: any) => void;
    map: (width: number, height: number, tiles: Tile[]) => void;
    tile: (tile: Tile, ts: Timestamp) => void;
    controller: (
      state: "connected" | "disconnected",
      info: {
        id: string;
        name: string;
        teamId: string;
        teamName: string;
        score: number;
      },
    ) => void;
    you: (agent: Agent, ts: Timestamp) => void;
    "agents sensing": (agents: Agent[], ts: Timestamp) => void;
    "parcels sensing": (parcels: Parcel[], ts: Timestamp) => void;
    msg: (
      fromId: string,
      fromName: string,
      msg: object,
      reply: (obj: object) => void,
    ) => object;
    log: (
      info: {
        src: "server" | "client";
        ms: number;
        frame: number;
        socket: string;
        id: string;
        name: string;
      },
      ...args: any[]
    ) => void;
  }

  // base generic interface
  export class IoTypedSocket<
    OnEv extends Record<string, (...a: any[]) => any>,
    EmitEv extends Record<string, (...a: any[]) => any>,
  > {
    id: string;
    disconnect(): void;
    on<K extends keyof OnEv>(event: K, listener: OnEv[K]): void;
    onAny(listener: (event: string, ...args: any[]) => void): void;
    once<K extends keyof OnEv>(event: K, listener: OnEv[K]): void;
    emit<K extends keyof EmitEv>(
      event: K,
      ...args: Parameters<EmitEv[K]>
    ): void;
    emitAndResolveOnAck<K extends keyof EmitEv>(
      event: K,
      ...args: Parameters<EmitEv[K]>
    ): Promise<any>;
  }

  // ioClientSocket specializes it
  export class IoClientSocket extends IoTypedSocket<
    ServerEvents,
    ClientEvents
  > {
    token: Promise<string>;
    me: Promise<Agent>;
    config: Promise<any>;
    map: Promise<{ width: number; height: number; tiles: Tile[] }>;

    connect(): void;
    disconnect(): void;
    onConnect(cb: () => void): void;
    onDisconnect(cb: () => void): void;
    onConfig(cb: (cfg: any) => void): void;
    onMap(cb: (w: number, h: number, tiles: Tile[]) => void): void;
    onTile(cb: (tile: Tile, ts: Timestamp) => void): void;
    onAgentConnected(cb: (state: string, agent: any) => void): void;
    onYou(cb: (agent: Agent, ts: Timestamp) => void): void;
    onceYou(cb: (agent: Agent, ts: Timestamp) => void): void;
    onAgentsSensing(cb: (agents: Agent[]) => void): void;
    onParcelsSensing(cb: (parcels: Parcel[]) => void): void;
    onMsg(
      cb: (
        id: string,
        name: string,
        msg: any,
        reply: (any: any) => void,
      ) => void,
    ): void;
    emitSay(toId: string, msg: any): Promise<"successful">;
    emitAsk(toId: string, msg: any): Promise<any>;
    emitShout(msg: any): Promise<any>;
    emitMove(
      dir: "up" | "right" | "left" | "down" | { x: number; y: number },
    ): Promise<{ x: number; y: number } | false>;
    emitPickup(): Promise<{ id: string }[]>;
    emitPutdown(selected?: string[] | null): Promise<{ id: string }[]>;
    emitLog(...msg: any[]): void;
    onLog(
      cb: (
        info: {
          src: "server" | "client";
          ms: number;
          frame: number;
          socket: string;
          id: string;
          name: string;
        },
        ...args: any[]
      ) => void,
    ): void;
  }

  // DeliverooApi extends ioClientSocket
  export class DeliverooApi extends IoClientSocket {
    constructor(host: string, token?: string | null, autoconnect?: boolean);
  }
}

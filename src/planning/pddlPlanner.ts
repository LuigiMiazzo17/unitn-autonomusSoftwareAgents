import config from "config";
import fs from "fs";
import path from "path";
import { Queue } from "queue-typed";
import { BeliefSet } from "src/beliefs";
import { TileType } from "src/beliefs/types";
import { Action } from "src/planning/actions";
import { debug, error, info } from "src/utils/log";
import { fileURLToPath } from "url";

export class PddlPlanner {
  private agentId: string;
  private beliefSet: BeliefSet;
  private static_objects: string[] = [];
  private staticInit: string[] = [];
  private dynamicObjects: string[] = [];
  private dynamicInit: string[] = [];
  private goal: string = "";
  private id: string | null = null;

  constructor(agentId: string, beliefSet: BeliefSet) {
    this.agentId = agentId;
    this.beliefSet = beliefSet;
  }

  static async build(
    agentId: string,
    beliefSet: BeliefSet,
  ): Promise<PddlPlanner> {
    const planner = new PddlPlanner(agentId, beliefSet);

    info("PddlExecutor initialized", agentId);

    return planner;
  }

  private getStaticObjectsAndInit(): [string[], string[]] {
    const map = this.beliefSet.getMap();

    const objects = ["agent1 - agent"];
    const init = [];

    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        const tile = map[y][x];
        if (tile === TileType.WALL) {
          continue;
        }
        objects.push(`tile${x}_${y} - tile`);

        if (tile === TileType.DELIVERY) {
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
            nx < map[0].length &&
            ny >= 0 &&
            ny < map.length &&
            map[ny][nx] !== TileType.WALL
          ) {
            init.push(`(adjacent tile${x}_${y} tile${nx}_${ny})`);
          }
        }
      }
    }
    init.push(`(= (total-cost) 0)`);

    return [objects, init];
  }

  private getDynamicObjectsAndInitAndGoal(): [string[], string[], string] {
    const parcels = this.beliefSet.getParcels();
    const agents = this.beliefSet
      .getAllAgents()
      .filter((a) => a.getId() !== this.agentId);

    const pos = this.beliefSet.getAgentPos();

    const objects = [];
    const init = [];

    for (const parcel of parcels) {
      if (
        parcel.getCarriedBy() !== null &&
        parcel.getCarriedBy() !== this.agentId
      ) {
        continue;
      }
      objects.push(`parcel${parcel.getId()} - parcel`);
      init.push(
        `(parcel_at parcel${parcel.getId()} tile${parcel.getPos().x}_${parcel.getPos().y})`,
      );
      if (parcel.getCarriedBy() === this.agentId) {
        init.push(`(carrying agent1 parcel${parcel.getId()})`);
      } else {
        init.push(`(not (carrying agent1 parcel${parcel.getId()}))`);
      }

      init.push(`(not (delivered parcel${parcel.getId()}))`);
    }

    for (const agent of agents) {
      init.push(
        `(blocked tile${Math.floor(agent.getPos().x)}_${Math.floor(agent.getPos().y)})`,
      );
    }

    init.push(`(at agent1 tile${pos.x}_${pos.y})`);

    const goal = [];
    for (const parcel of parcels) {
      if (parcel.getCarriedBy()) {
        continue;
      }
      goal.push(`(delivered parcel${parcel.getId()})`);
    }

    debug("PddlProblem dynamic objects generated", this.agentId);
    let goalStr = goal.length > 1 ? "\n        (and\n        " : "\n        ";
    goalStr += goal.join("\n        ");
    if (goal.length > 1) {
      goalStr += "\n        )";
    }

    return [objects, init, goalStr];
  }

  private async getPddlSolution(): Promise<string[] | null> {
    const [dynamicObjects, dynamicInit, goal] =
      this.getDynamicObjectsAndInitAndGoal();

    const objectsDiff: { add: string[]; remove: string[] } = {
      add: [],
      remove: [],
    };
    const initDiff: { add: string[]; remove: string[] } = {
      add: [],
      remove: [],
    };
    let goalDiff: string | null = null;

    if (this.id === null) {
      let pddlDomain = "";
      try {
        const pddlDomainFilePath = path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "domain.pddl",
        );
        pddlDomain = await fs.promises.readFile(pddlDomainFilePath, "utf-8");
      } catch (err) {
        error(`Error reading PDDL domain file: ${err || "Unknown error"}`);
        throw err;
      }

      [this.static_objects, this.staticInit] = this.getStaticObjectsAndInit();

      [this.dynamicObjects, this.dynamicInit, this.goal] =
        this.getDynamicObjectsAndInitAndGoal();

      const objects = [...this.static_objects, ...dynamicObjects];
      const init = [...this.staticInit, ...dynamicInit];

      const pddlProblem = `(define (problem deliveroo)
          (:domain deliveroo)
          (:objects
        ${objects.join("\n        ")}
          )
          (:init
        ${init.join("\n        ")}
          )
          (:goal ${this.goal}
          )
          (:metric minimize (total-cost)
          )
        )`;

      info("Creating new PDDL problem", this.agentId);
      this.id = await fetch(config.solverHost + "/problem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          problem: pddlProblem,
          domain: pddlDomain,
        }),
      })
        .then((res) => res.json())
        .then((json) => {
          if (json.status === "error") {
            error(
              `Error from PDDL solver: ${json.msg || "Unknown error"}`,
              this.agentId,
            );
            throw new Error(json.msg || "Unknown error");
          }
          if (json.id === undefined) {
            throw new Error("No id returned from PDDL solver");
          }
          return json.id;
        });
      info(`PDDL problem created with id ${this.id}`, this.agentId);
    } else {
      objectsDiff.add = dynamicObjects.filter(
        (obj) => !this.dynamicObjects.includes(obj),
      );
      objectsDiff.remove = this.dynamicObjects.filter(
        (obj) => !dynamicObjects.includes(obj),
      );

      initDiff.add = dynamicInit.filter(
        (init) => !this.dynamicInit.includes(init),
      );
      initDiff.remove = this.dynamicInit.filter(
        (init) => !dynamicInit.includes(init),
      );

      if (goal !== this.goal) {
        goalDiff = goal;
      }

      this.dynamicObjects = dynamicObjects;
      this.dynamicInit = dynamicInit;
      this.goal = goal;
      debug("PDDL problem updated", this.agentId);
    }

    debug("Posting PDDL problem update", this.agentId);
    return await fetch(config.solverHost + "/solve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: this.id,
        differences: {
          objects: objectsDiff,
          init: initDiff,
          goal: goalDiff,
        },
      }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.status === "error") {
          error(`Error from PDDL solver: ${json.msg || "Unknown error"}`);
          throw new Error(json.msg || "Unknown error");
        }
        if (json.status === "success" && Array.isArray(json.plan)) {
          return json.plan;
        } else {
          return null;
        }
      })
      .catch((err) => {
        error(`Error solving PDDL problem: ${err || "Unknown error"}`);
        fetch(config.solverHost + "/problem", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: this.id,
          }),
        });
        this.id = null;
        error("PDDL problem deleted due to error", this.agentId);
        return null;
      });
  }

  async solvePddlProblem(): Promise<Queue<Action> | null> {
    debug("Solving PDDL problem", this.agentId);

    const planSteps = await this.getPddlSolution();
    if (planSteps === null) {
      debug("No plan found", this.agentId);
      return null;
    }

    debug("Plan found!, parsing it!", this.agentId);

    const queue = new Queue<Action>();
    for (const step of planSteps) {
      let action = undefined;

      if (step.startsWith("move")) {
        const parts = step
          .substring(5, step.length - 1)
          .split(", ")
          .map((s: string) => s.trim());
        const from = parts[1];
        const to = parts[2];
        const [fromX, fromY] = from
          .substring(4)
          .split("_")
          .map((v: string) => parseInt(v));
        const [toX, toY] = to
          .substring(4)
          .split("_")
          .map((v: string) => parseInt(v));

        if (toX === fromX + 1 && toY === fromY) {
          action = Action.MOVE_RIGHT;
        } else if (toX === fromX - 1 && toY === fromY) {
          action = Action.MOVE_LEFT;
        } else if (toX === fromX && toY === fromY + 1) {
          action = Action.MOVE_UP;
        } else if (toX === fromX && toY === fromY - 1) {
          action = Action.MOVE_DOWN;
        } else {
          error(
            `Invalid MOVE action in PDDL plan: from ${from} to ${to}`,
            this.agentId,
          );
          return null;
        }
      } else if (step.startsWith("pickup")) {
        action = Action.PICKUP;
      } else if (step.startsWith("deliver")) {
        action = Action.DELIVER;
      } else {
        error(`Unknown action in PDDL plan: ${step}`, this.agentId);
        return null;
      }

      if (action !== undefined) {
        queue.push(action);
      }
    }
    return queue;
  }
}

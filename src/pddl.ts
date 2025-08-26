import { onlineSolver } from "@unitn-asa/pddl-client";
import { debug, info, error } from "src/utils/log";
import { Intent } from "src/itents";
import fs from "fs";
import { BelifsSet, TileType } from "src/belifs";
import config from "config";

export class PddlPlanner {
  private domain: string;
  private agentId: string;
  private belifsSet: BelifsSet;

  constructor(agentId: string, belifsSet: BelifsSet) {
    this.agentId = agentId;
    this.belifsSet = belifsSet;

    try {
      this.domain = fs.readFileSync(config.pddlDomain, "utf-8");
    } catch (err) {
      error(
        `Error reading PDDL domain file: ${err || "Unknown error"}`,
        this.agentId,
      );
      throw err;
    }
    info("PddlExecutor initialized", agentId);
  }

  private definePddlProblem(): string {
    const pos = this.belifsSet.getPos();
    const map = this.belifsSet.getMap();
    const parcels = this.belifsSet.getParcels();
    const agents = this.belifsSet.getAgents();

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

    for (const parcel of parcels) {
      if (parcel.carriedBy) {
        continue;
      }
      objects.push(`parcel${parcel.id} - parcel`);
      init.push(`(parcel_at parcel${parcel.id} tile${parcel.x}_${parcel.y})`);
      init.push(`(not (delivered parcel${parcel.id}))`);
    }

    for (const agent of agents) {
      init.push(`(blocked tile${agent.x}_${agent.y})`);
    }

    init.push(`(at agent1 tile${pos.x}_${pos.y})`);

    const goal = [];
    for (const parcel of parcels) {
      if (parcel.carriedBy) {
        continue;
      }
      goal.push(`(delivered parcel${parcel.id})`);
    }

    debug("PddlProblem Generated", this.agentId);

    let goalStr = goal.length > 1 ? "\n        (and\n        " : "\n        ";
    goalStr += goal.join("\n        ");
    if (goal.length > 1) {
      goalStr += "\n        )";
    }

    init.push(`(= (total-cost) 0)`);

    return `(define (problem deliveroo)
  (:domain deliveroo)
  (:objects
    ${objects.join("\n        ")}
  )
  (:init
    ${init.join("\n        ")}
  )
  (:goal ${goalStr}
  )
  (:metric minimize (total-cost)
  )
)`;
  }

  async solvePddlProblem(): Promise<Intent[]> {
    info("Solving PDDL problem", this.agentId);

    const pddlProblem = this.definePddlProblem();
    const plan = await onlineSolver(this.domain, pddlProblem);
    console.log(plan);

    if (!Array.isArray(plan)) {
      error(
        `PDDL solver returned an invalid plan, stdout: '${plan.result.stdout}', stderr: '${plan.result.stderr}`,
        this.agentId,
      );
      return [];
    }

    for (const step of plan) {
      info(
        `PDDL Plan Step: ${step.action}(${step.args.join(", ")})`,
        this.agentId,
      );
    }

    return [];
  }
}

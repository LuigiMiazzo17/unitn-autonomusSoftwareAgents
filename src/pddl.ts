import { Queue } from "queue-typed";
import { BelifsSet, TileType } from "src/belifs";
import config from "config";
import { Intent } from "src/itents";
import { debug, error, info } from "src/utils/log";

export class PddlPlanner {
  private agentId: string;
  private belifsSet: BelifsSet;

  constructor(agentId: string, belifsSet: BelifsSet) {
    this.agentId = agentId;
    this.belifsSet = belifsSet;

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
      if (parcel.carriedBy !== null) {
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

  async solvePddlProblem(): Promise<Queue<Intent> | null> {
    debug("Solving PDDL problem", this.agentId);

    const pddlProblem = this.definePddlProblem();
    const plan = await fetch(config.solverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        problem: pddlProblem,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            `HTTP error while solving PDDL, status: ${res.status}`,
          );
        }
        return res;
      })
      .then((res) => res.json())
      .then((json) => {
        if (json.status === "success" && Array.isArray(json.plan)) {
          const queue = new Queue<Intent>();
          for (const step of json.plan) {
            let intent = undefined;

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
                intent = Intent.MOVE_RIGHT;
              } else if (toX === fromX - 1 && toY === fromY) {
                intent = Intent.MOVE_LEFT;
              } else if (toX === fromX && toY === fromY + 1) {
                intent = Intent.MOVE_UP;
              } else if (toX === fromX && toY === fromY - 1) {
                intent = Intent.MOVE_DOWN;
              } else {
                error(
                  `Invalid MOVE action in PDDL plan: from ${from} to ${to}`,
                  this.agentId,
                );
                return null;
              }
            } else if (step.startsWith("pickup")) {
              intent = Intent.PICKUP;
            } else if (step.startsWith("deliver")) {
              intent = Intent.DELIVER;
            } else {
              error(`Unknown action in PDDL plan: ${step}`, this.agentId);
              return null;
            }

            if (intent !== undefined) {
              queue.push(intent);
            }
          }
          return queue;
        } else {
          return null;
        }
      })
      .catch((err) => {
        error(`Error solving PDDL problem: ${err || "Unknown error"}`);
        process.exit(1);
      });

    return plan;
  }
}

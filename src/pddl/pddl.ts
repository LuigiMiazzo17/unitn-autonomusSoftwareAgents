import { PddlProblem, onlineSolver } from "@unitn-asa/pddl-client";
import { info, error } from "src/utils/log";
import { Intent } from "src/itents";
import fs from "fs";

const PDDL_DOMAIN_FILE = "./deliveroo.pddl";

export class PddlExecutor {
  private domain: string;
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
    try {
      this.domain = fs.readFileSync(PDDL_DOMAIN_FILE, "utf-8");
    } catch (err) {
      error(
        `Error reading PDDL domain file: ${err || "Unknown error"}`,
        this.agentId,
      );
      throw err;
    }
    info("PddlExecutor initialized", agentId);
  }

  async solvePddlProblem(
    objects: string,
    init: string,
    goal: string,
  ): Promise<Intent[]> {
    info("Solving PDDL problem", this.agentId);

    const pddlProblem = new PddlProblem("deliveroo", objects, init, goal);
    const plan = await onlineSolver(this.domain, pddlProblem.toPddlString());

    for (const step of plan) {
      info(
        `PDDL Plan Step: ${step.action}(${step.args.join(", ")})`,
        this.agentId,
      );
    }

    return [];
  }
}

#!/usr/bin/env python3
from pathlib import Path

from flask import Flask, jsonify, request
from unified_planning.io import PDDLReader
from unified_planning.shortcuts import OneshotPlanner

app = Flask(__name__)
reader = PDDLReader()
domain = (Path(__file__).parent / "domain.pddl").read_text()


@app.route("/solve", methods=["POST"])
def solve_route():
    try:
        problem = request.get_json().get("problem")

        problem = reader.parse_problem_string(domain, problem)

        with OneshotPlanner(name="aries") as planner:
            result = planner.solve(problem)
            plan = result.plan

        return jsonify(
            {"status": "success", "plan": [str(action) for action in plan.actions]}
        )
    except Exception as e:
        return jsonify({"status": "error", "msg": str(e)}), 500


if __name__ == "__main__":
    app.run(host="localhost", port=5001)

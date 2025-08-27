#!/usr/bin/env python3
from unified_planning.io import PDDLReader
from unified_planning.shortcuts import OneshotPlanner
from flask import Flask, request, jsonify


app = Flask(__name__)
reader = PDDLReader()


@app.route("/solve", methods=["POST"])
def solve_route():
    try:
        domain = request.get_json().get("domain")
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

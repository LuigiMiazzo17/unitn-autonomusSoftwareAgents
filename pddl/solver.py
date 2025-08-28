#!/usr/bin/env python3
from pathlib import Path

from datetime import datetime
from flask import Flask, jsonify, request
from unified_planning.io import PDDLReader
from unified_planning.shortcuts import AnytimePlanner


app = Flask(__name__)
reader = PDDLReader()
domain = (Path(__file__).parent / "domain.pddl").read_text()


@app.route("/solve", methods=["POST"])
def solve_route():
    # try:
    problem = request.get_json().get("problem")

    start = datetime.now()
    problem = reader.parse_problem_string(domain, problem)

    timeout = request.get_json().get("timeout", 1000)
    plan = None
    with AnytimePlanner(
        problem_kind=problem.kind, anytime_guarantee="INCREASING_QUALITY"
    ) as planner:
        for p in planner.get_solutions(problem, timeout=timeout):
            if p.plan:
                plan = p.plan
    print("Time taken:", datetime.now() - start)

    if plan:
        return jsonify(
            {"status": "success", "plan": [str(action) for action in plan.actions]}
        )
    else:
        return (
            jsonify({"status": "error", "msg": "No plan found within the time limit"}),
            404,
        )
    # except Exception as e:
    #     return jsonify({"status": "error", "msg": str(e)}), 500


if __name__ == "__main__":
    app.run(host="localhost", port=5001)

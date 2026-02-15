import random
import string

from flask import Flask, jsonify, request
from unified_planning.engines.engine import Engine
from unified_planning.io import PDDLReader
from unified_planning.model import Object
from unified_planning.model.expression import ExpressionManager
from unified_planning.model.fluent import Fluent
from unified_planning.model.problem import Problem
from unified_planning.model.types import Type
from unified_planning.shortcuts import Replanner

app = Flask(__name__)

REPLANNERS = {}


class CustomReplanner:
    replanner: Engine
    expression_manager: ExpressionManager
    problem: Problem
    fluents: dict[str, Fluent]
    types: dict[str, Type]

    def __init__(self, problem):
        self.replanner = Replanner(problem)
        self.problem = self.replanner._problem
        self.expression_manager = self.problem._env.expression_manager
        self.fluents = {f.name: f for f in problem.fluents}
        self.types = {t.name: t for t in problem.user_types}

    def resolve(self, timeout: int):
        return self.replanner.resolve(timeout=timeout)

    def get_fluent(self, name: str) -> Fluent:
        if name not in self.fluents:
            raise ValueError(f"Fluent {name} not found")
        return self.fluents[name]

    def get_object(self, name: str):
        for obj in self.problem.all_objects:
            if obj.name == name:
                return obj
        raise ValueError(f"Object {name} not found")

    def get_object_name_and_type(self, stmt: str) -> tuple[str, Type]:
        stmts = CustomReplanner.parse_statement(stmt)
        if len(stmts) != 1:
            raise ValueError("Only single objects are supported")
        object_parts = [p.strip() for p in stmts[0].split("-")]
        if len(object_parts) != 2:
            raise ValueError("Invalid object definition")

        obj_name = object_parts[0]
        obj_type = self.types.get(object_parts[1], None)
        if obj_type is None:
            raise ValueError(f"Type {object_parts[1]} not found")
        return obj_name, obj_type

    def add_object(self, stmt: str) -> None:
        obj_name, obj_type = self.get_object_name_and_type(stmt)
        if obj_name in [o.name for o in self.problem.all_objects]:
            raise ValueError(f"Object {obj_name} already exists")
        self.problem.add_object(Object(obj_name, obj_type))

    def remove_object(self, stmt: str) -> None:
        obj_name, obj_type = self.get_object_name_and_type(stmt)
        obj = self.get_object(obj_name)
        if obj.type != obj_type:
            raise ValueError(f"Object {obj_name} is not of type {obj_type}")
        self.problem.all_objects.remove(obj)

        to_remove = []
        for iv in self.problem.initial_values.keys():
            if obj in iv.get_contained_names():
                to_remove.append(iv)
        for iv in to_remove:
            del self.problem.initial_values[iv]
        to_remove = []
        for g in self.problem.goals:
            if obj in g.get_contained_names():
                to_remove.append(g)

    def add_initial_value(self, stmt: str) -> None:
        stmts = CustomReplanner.parse_statement(stmt)

        value = self.expression_manager.TRUE()
        if stmts[0] == "not":
            value = self.expression_manager.FALSE()
            stmts = stmts[1:]

        if len(stmts) == 0:
            raise ValueError("Invalid initial value, got only 'not'")
        elif len(stmts) > 1:
            raise ValueError("Only single fluents are supported in initial values")

        initial_value_parts = stmts[0].split(" ")

        fluent = self.get_fluent(initial_value_parts[0])
        expr = self.expression_manager.FluentExp(
            fluent, tuple([self.get_object(arg) for arg in initial_value_parts[1:]])
        )
        self.problem.set_initial_value(expr, value)

    def remove_initial_value(self, stmt: str) -> None:
        stmts = CustomReplanner.parse_statement(stmt)

        if stmts[0] == "not":
            stmts = stmts[1:]

        if len(stmts) == 0:
            raise ValueError("Invalid initial value, got only 'not'")
        elif len(stmts) > 1:
            raise ValueError("Only single fluents are supported in initial values")

        initial_value_parts = stmts[0].split(" ")

        fluent = self.get_fluent(initial_value_parts[0])
        conained_names_set = set(initial_value_parts)
        try:
            stmt = next(
                v
                for v in self.problem.initial_values.keys()
                if v.fluent() == fluent
                and conained_names_set == v.get_contained_names()
            )
        except StopIteration:
            raise ValueError(f"Initial value {stmt} not found")
        del self.problem.initial_values[stmt]

    def update_goal(self, stmt: str) -> None:
        self.problem.clear_goals()
        stmts = CustomReplanner.parse_statement(stmt)

        if stmts[0] == "and":
            stmts = stmts[1:]

        if len(stmts) == 0:
            raise ValueError("Invalid goal")

        expected_values = []
        for stmt in stmts:
            expected_value_parts = stmt.split(" ")
            fluent = self.get_fluent(expected_value_parts[0])
            expr = self.expression_manager.FluentExp(
                fluent,
                tuple([self.get_object(arg) for arg in expected_value_parts[1:]]),
            )
            expected_values.append(expr)
        if len(expected_values) == 1:
            self.problem.add_goal(expected_values[0])
        else:
            self.problem.add_goal(self.expression_manager.And(expected_values))

    @staticmethod
    def parse_statement(stmt: str) -> list[str]:
        """Parses a statement into its components, support conjunctions (and)."""
        stmt = stmt.replace("\n", " ").strip()
        while "  " in stmt:
            stmt = stmt.replace("  ", " ")
        if stmt.startswith("(") and stmt.endswith(")"):
            stmt = stmt[1:-1].strip()
        stmts = []
        depth = 0
        current_stmt = ""
        for i, char in enumerate(stmt):
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
            if char == " " and depth == 0 and stmt[i + 1] == "(":
                if current_stmt:
                    stmts.append(current_stmt.strip("() "))
                    current_stmt = ""
            else:
                current_stmt += char
        if current_stmt:
            stmts.append(current_stmt.strip("() "))

        if len(stmts) == 0:
            raise ValueError("Parsing failed, got empty statement")
        return stmts


@app.route("/solve", methods=["POST"])
def solve_route():
    if not request.json:
        return jsonify({"status": "error", "msg": "No JSON body provided"}), 400

    id = request.json.get("id", None)
    if id is None:
        return jsonify({"status": "error", "msg": "No id provided"}), 400
    if id not in REPLANNERS:
        return jsonify({"status": "error", "msg": "Invalid id"}), 404

    differences = request.json.get("differences", None)
    if not differences:
        return jsonify({"status": "error", "msg": "No differences provided"}), 400

    if "objects" not in differences:
        return jsonify({"status": "error", "msg": "No objects provided"}), 400
    elif "add" not in differences["objects"]:
        return (
            jsonify({"status": "error", "msg": "No objects to add provided"}),
            400,
        )
    elif "remove" not in differences["objects"]:
        return (
            jsonify({"status": "error", "msg": "No objects to remove provided"}),
            400,
        )

    if "init" not in differences:
        return jsonify({"status": "error", "msg": "No init provided"}), 400
    elif "add" not in differences["init"]:
        return jsonify({"status": "error", "msg": "No init to add provided"}), 400
    elif "remove" not in differences["init"]:
        return jsonify({"status": "error", "msg": "No init to remove provided"}), 400

    if "goal" not in differences:
        return jsonify({"status": "error", "msg": "No goal provided"}), 400

    time_limit = request.json.get("time_limit", 1000)
    try:
        time_limit = int(time_limit)
    except ValueError:
        return jsonify({"status": "error", "msg": "Invalid time limit"}), 400

    replanner: CustomReplanner = REPLANNERS[id]

    for obj in differences["objects"]["add"]:
        try:
            replanner.add_object(obj.strip("()").strip())
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 400
    for obj in differences["objects"]["remove"]:
        try:
            replanner.remove_object(obj.strip("()").strip())
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 400

    for initial_value in differences["init"]["add"]:
        try:
            replanner.add_initial_value(initial_value.strip("()").strip())
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 400
    for initial_value in differences["init"]["remove"]:
        try:
            replanner.remove_initial_value(initial_value.strip("()").strip())
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 400

    if differences["goal"] is not None:
        try:
            replanner.update_goal(differences["goal"].strip("()").strip())
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 400

    plan = replanner.resolve(timeout=time_limit)

    if plan:
        return jsonify(
            {"status": "success", "plan": [str(action) for action in plan.plan.actions]}
        )
    else:
        return (
            jsonify({"status": "error", "msg": "No plan found within the time limit"}),
            404,
        )


@app.route("/problem", methods=["POST"])
def define_problem():
    if not request.json:
        return jsonify({"status": "error", "msg": "No JSON body provided"}), 400

    domain = request.json.get("domain", None)
    if domain is None:
        return jsonify({"status": "error", "msg": "No domain provided"}), 400
    pddl_problem_str = request.json.get("problem", None)
    if pddl_problem_str is None:
        return jsonify({"status": "error", "msg": "No problem provided"}), 400

    id = "".join(random.choices(string.ascii_uppercase + string.digits, k=12))
    problem = PDDLReader().parse_problem_string(domain, pddl_problem_str)
    REPLANNERS[id] = CustomReplanner(problem)
    return jsonify({"status": "success", "id": id}), 201


@app.route("/problem", methods=["DELETE"])
def delete_problem():
    if not request.json:
        return jsonify({"status": "error", "msg": "No JSON body provided"}), 400

    id = request.json.get("id", None)
    if id is None:
        return jsonify({"status": "error", "msg": "No id provided"}), 400
    if id not in REPLANNERS:
        return jsonify({"status": "success", "msg": "Was already deleted"}), 200

    del REPLANNERS[id]
    return jsonify({"status": "success", "msg": f"Problem with id {id} deleted"}), 200


if __name__ == "__main__":
    app.run(host="localhost", port=5001)

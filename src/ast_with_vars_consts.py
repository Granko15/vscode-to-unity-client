# ast_with_vars_consts.py
import ast
import json
from graphviz import Digraph
import sys
import os

def get_node_label(node):
    if isinstance(node, ast.FunctionDef) and node.name not in ('__init__', 'main'):
        return f"Function: {node.name}"
    elif isinstance(node, ast.ClassDef):
        return f"Class: {node.name}"
    elif isinstance(node, ast.Assign):
        targets = ', '.join([t.id for t in node.targets if isinstance(t, ast.Name)])
        return f"Assign: {targets} = ..."
    elif isinstance(node, ast.Constant):
        return f"Constant: {node.value}"
    elif isinstance(node, ast.Name):
        return f"Variable: {node.id}"
    return type(node).__name__

def traverse_ast(node, graph=None, ast_data=None, parent_id=None):
    if graph is None:
        graph = Digraph()
    if ast_data is None:
        ast_data = []

    if isinstance(node, ast.FunctionDef) and node.name in ('__init__', 'main'):
        return graph, ast_data

    node_id = str(id(node))
    node_label = get_node_label(node)
    graph.node(node_id, label=node_label)
    node_data = {"type": type(node).__name__, "label": node_label}

    if parent_id:
        graph.edge(parent_id, node_id)

    ast_data.append(node_data)

    for child in ast.iter_child_nodes(node):
        traverse_ast(child, graph, node_data.setdefault("children", []), node_id)

    return graph, ast_data

def generate_ast_visualization_and_json(file_path):
    with open(file_path, 'r') as f:
        tree = ast.parse(f.read())
    ast_graph, ast_data = traverse_ast(tree)
    
    output_pdf = os.path.splitext(file_path)[0] + '_vars_consts_ast.pdf'
    ast_graph.render(output_pdf, format='pdf', cleanup=True)
    json_output_file = os.path.splitext(file_path)[0] + '_vars_consts_ast.json'
    with open(json_output_file, 'w') as json_file:
        json.dump(ast_data, json_file, indent=4)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python ast_with_vars_consts.py <file_path>")
        sys.exit(1)
    file_path = sys.argv[1]
    generate_ast_visualization_and_json(file_path)

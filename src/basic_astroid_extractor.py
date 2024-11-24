# basic_astroid_extractor.py
import astroid
import json
import sys
import os
from graphviz import Digraph

def generate_basic_ast(file_path):
    with open(file_path, 'r') as f:
        code = f.read()
    
    # Parse the code into an AST using astroid
    ast_tree = astroid.parse(code)

    # Convert AST to a JSON-friendly format
    def ast_to_dict(node):
        return {
            "type": type(node).__name__,
            "name": getattr(node, 'name', None),
            "lineno": getattr(node, 'lineno', None),
            "children": [ast_to_dict(child) for child in node.get_children()]
        }

    ast_json = ast_to_dict(ast_tree)

    # Save AST as JSON
    json_path = f"{os.path.splitext(file_path)[0]}_basic_astroid.json"
    with open(json_path, "w") as json_file:
        json.dump(ast_json, json_file, indent=4)

    # Visualize AST
    dot = Digraph(comment="Basic Astroid AST")
    def add_nodes_edges(node, parent_id=None):
        node_id = str(id(node))
        label = f"{node['type']} ({node['name']})" if node["name"] else node["type"]
        dot.node(node_id, label)
        if parent_id:
            dot.edge(parent_id, node_id)
        for child in node['children']:
            add_nodes_edges(child, node_id)

    add_nodes_edges(ast_json)
    pdf_path = f"{os.path.splitext(file_path)[0]}_basic_astroid.pdf"
    dot.render(pdf_path, format="pdf", cleanup=False)

    print(f"Basic Astroid AST saved to {json_path}")
    print(f"Basic Astroid AST visualization saved to {pdf_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python basic_astroid_extractor.py <file_path>")
        sys.exit(1)

    file_path = sys.argv[1]
    generate_basic_ast(file_path)

import ast
import json
from graphviz import Digraph
import sys
import os

def get_node_label(node):
    """Returns a label for a given AST node with type and key details."""
    if isinstance(node, ast.FunctionDef) and node.name not in ('__init__', 'main'):
        return f"Function: {node.name}\nReturns: {get_return_type(node)}"
    elif isinstance(node, ast.ClassDef):
        return f"Class: {node.name}"
    elif isinstance(node, ast.Assign):
        targets = ', '.join([t.id for t in node.targets if isinstance(t, ast.Name)])
        return f"Assign: {targets} = ..."
    elif isinstance(node, ast.arg):
        return f"Argument: {node.arg}"
    elif isinstance(node, ast.Constant):
        return f"Constant: {node.value}"
    elif isinstance(node, ast.Name):
        return f"Variable: {node.id}"
    elif isinstance(node, ast.Call):
        return f"Call: {node.func.id if isinstance(node.func, ast.Name) else 'Unknown'}()"
    elif isinstance(node, ast.Import):
        imports = ', '.join([alias.name for alias in node.names])
        return f"Import: {imports}"
    elif isinstance(node, ast.ImportFrom):
        module = node.module if node.module else ""
        names = ', '.join([alias.name for alias in node.names])
        return f"From {module} import {names}"
    return type(node).__name__

def get_return_type(func_node):
    """Helper function to get the return type of a function."""
    if func_node.returns:
        if isinstance(func_node.returns, ast.Name):
            return func_node.returns.id  # Simple type (e.g., `int`, `str`)
        elif isinstance(func_node.returns, ast.Subscript):
            return ast.unparse(func_node.returns)  # More complex types like List[int]
    return "None"

def traverse_ast(node, graph=None, ast_data=None, parent_id=None):
    """Recursive function to add all AST nodes to the graph and JSON structure."""
    if graph is None:
        graph = Digraph()
    if ast_data is None:
        ast_data = []

    # Skip __init__ and main functions
    if isinstance(node, ast.FunctionDef) and node.name in ('__init__', 'main'):
        return graph, ast_data

    node_id = str(id(node))
    node_label = get_node_label(node)
    graph.node(node_id, label=node_label)

    node_data = {"type": type(node).__name__, "label": node_label, "fields": {}}

    # Gather key fields in the node for the JSON structure
    for field_name, value in ast.iter_fields(node):
        if isinstance(value, ast.AST):
            # Recursively process child AST nodes
            traverse_ast(value, graph, node_data.setdefault("children", []), node_id)
        elif isinstance(value, list):
            # Process lists of AST nodes
            children = []
            for item in value:
                if isinstance(item, ast.AST):
                    traverse_ast(item, graph, children, node_id)
            if children:
                node_data["fields"][field_name] = children
        else:
            # Store basic data like constants, names, etc.
            node_data["fields"][field_name] = str(value)

    # Add a link from parent to this node in the graph
    if parent_id:
        graph.edge(parent_id, node_id)

    ast_data.append(node_data)

    return graph, ast_data

def generate_ast_visualization_and_json(file_path):
    # Read and parse the file to create the AST
    with open(file_path, 'r') as f:
        tree = ast.parse(f.read())

    # Generate the AST visualization and JSON data
    ast_graph, ast_data = traverse_ast(tree)
    
    # Save the visualization as a PDF file
    output_pdf = os.path.splitext(file_path)[0] + '_detailed_ast.pdf'
    ast_graph.render(output_pdf, format='pdf', cleanup=True)
    print(f"Detailed AST graph saved to {output_pdf}")

    # Save the AST data to a JSON file
    json_output_file = os.path.splitext(file_path)[0] + '_detailed_ast.json'
    with open(json_output_file, 'w') as json_file:
        json.dump(ast_data, json_file, indent=4)
    print(f"AST data saved to {json_output_file}")

# Run the function if script is executed directly
if __name__ == "__main__":
    # Ensure the correct usage
    if len(sys.argv) != 2:
        print("Usage: python ast_extractor.py <file_path>")
        sys.exit(1)
    
    # Run the main function with the file path provided as an argument
    file_path = sys.argv[1]
    generate_ast_visualization_and_json(file_path)

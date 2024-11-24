import os
import ast
import argparse
import json

class ProjectAnalyzer(ast.NodeVisitor):
    def __init__(self):
        self.classes = {}  # Store class details
        self.functions = []  # Store standalone functions
        self.imports = []  # Store imported modules
        self.current_file = None  # Track the current file being analyzed

    def visit_ClassDef(self, node):
        class_name = node.name
        bases = [base.id for base in node.bases if isinstance(base, ast.Name)]

        # Initialize class entry
        self.classes[class_name] = {
            "file_path": self.current_file,
            "methods": [],
            "attributes": [],
            "base_classes": bases,
            "composition": set(),
            "uses": set()
        }

        # Parse class body
        for item in node.body:
            if isinstance(item, ast.FunctionDef):
                # Detect methods
                self.classes[class_name]["methods"].append(item.name)

                # Inspect method body for 'uses' relationships
                for stmt in item.body:
                    if isinstance(stmt, ast.Assign):
                        # Detect composition (e.g., self.books = [])
                        if isinstance(stmt.targets[0], ast.Attribute) and isinstance(stmt.targets[0].value, ast.Name):
                            if stmt.targets[0].value.id == "self" and isinstance(stmt.value, ast.Call):
                                if isinstance(stmt.value.func, ast.Name):
                                    self.classes[class_name]["composition"].add(stmt.value.func.id)

                    elif isinstance(stmt, ast.Expr):
                        # Detect usage via method calls or attribute access
                        if isinstance(stmt.value, ast.Call) and isinstance(stmt.value.func, ast.Name):
                            self.classes[class_name]["uses"].add(stmt.value.func.id)
                        elif isinstance(stmt.value, ast.Call) and isinstance(stmt.value.func, ast.Attribute):
                            if isinstance(stmt.value.func.value, ast.Name):
                                self.classes[class_name]["uses"].add(stmt.value.func.value.id)

                    # ** New logic: Detect object instantiations **
                    if isinstance(stmt, ast.Assign) and isinstance(stmt.value, ast.Call):
                        if isinstance(stmt.value.func, ast.Name):  # Direct call, e.g., Book(...)
                            self.classes[class_name]["uses"].add(stmt.value.func.id)
                        elif isinstance(stmt.value.func, ast.Attribute):  # Attribute call, e.g., module.Book(...)
                            if isinstance(stmt.value.func.value, ast.Name):
                                self.classes[class_name]["uses"].add(stmt.value.func.attr)

            elif isinstance(item, ast.Assign):
                # Detect class-level attributes
                for target in item.targets:
                    if isinstance(target, ast.Name):
                        self.classes[class_name]["attributes"].append(target.id)

        self.generic_visit(node)



    def visit_FunctionDef(self, node):
        self.functions.append(node.name)

    def visit_Import(self, node):
        for alias in node.names:
            self.imports.append(alias.name)

    def visit_ImportFrom(self, node):
        if node.module:
            self.imports.append(node.module)

    def analyze(self, directory):
        for root, _, files in os.walk(directory):
            for file in files:
                if file.endswith(".py"):
                    file_path = os.path.join(root, file)
                    self.current_file = file_path  # Set the current file
                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            tree = ast.parse(f.read(), filename=file_path)
                            self.visit(tree)
                    except (SyntaxError, UnicodeDecodeError) as e:
                        print(f"Skipping {file_path}: {e}")

    def to_json(self, output_file):
        # Convert sets to lists and include file paths
        json_ready_classes = {
            class_name: {
                **details,
                "composition": list(details["composition"]),  # Convert set to list
                "uses": list(details["uses"])  # Convert set to list
            }
            for class_name, details in self.classes.items()
        }
        
        data = {
            "classes": json_ready_classes,
            "functions": self.functions,
            "imports": self.imports,
        }

        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        print(f"Class structure saved to {output_file}")

    def to_plantuml(self, output_file):
        with open(output_file, "w", encoding="utf-8") as f:
            f.write("@startuml\n")
            for class_name, details in self.classes.items():
                # Define the class
                f.write(f'class "{class_name}" as {class_name} {{\n')
                # Add attributes
                if details["attributes"]:
                    f.write("    .. Attributes ..\n")
                    for attr in details["attributes"]:
                        f.write(f"    {attr}\n")
                # Add methods
                if details["methods"]:
                    f.write("    .. Methods ..\n")
                    for method in details["methods"]:
                        f.write(f"    {method}()\n")
                # Include file path as a note
                f.write("    .. File Path ..\n")
                f.write(f"    {details['file_path']}\n")
                f.write("}\n")
                
                # Add inheritance relationships
                for base in details["base_classes"]:
                    f.write(f"{base} <|-- {class_name}\n")
                
                # Add composition relationships
                for comp in details["composition"]:
                    f.write(f"{class_name} --> {comp} : composed of\n")
                
                # Add usage relationships
                for use in details["uses"]:
                    f.write(f"{class_name} ..> {use} : uses\n")
            
            # Include a legend for better readability
            f.write("legend left\n")
            f.write("| <|-- | Inheritance |\n")
            f.write("| -->   | Composition |\n")
            f.write("| ..>   | Uses        |\n")
            f.write("endlegend\n")

            f.write("@enduml\n")
        print(f"PlantUML diagram source saved to {output_file}")


def main():
    parser = argparse.ArgumentParser(description="Generate a project class diagram.")
    parser.add_argument("project_dir", type=str, help="Path to the Python project directory.")
    parser.add_argument("-o", "--output", type=str, default="diagram", help="Base output file name (default: diagram).")
    parser.add_argument("-f", "--format", type=str, choices=["graphviz", "plantuml", "both"], default="both",
                        help="Diagram format (default: both).")
    args = parser.parse_args()

    if not os.path.isdir(args.project_dir):
        print(f"Error: {args.project_dir} is not a valid directory.")
        return

    analyzer = ProjectAnalyzer()
    analyzer.analyze(args.project_dir)

    json_output = f"{args.output}.json"
    analyzer.to_json(json_output)

    if args.format in {"plantuml", "both"}:
        plantuml_output = f"{args.output}.puml"
        analyzer.to_plantuml(plantuml_output)

        # Render PlantUML diagram if the `plantuml` command is installed
        try:
            os.system(f"plantuml {plantuml_output}")
            print(f"PlantUML diagram rendered as {args.output}.png")
        except Exception as e:
            print(f"Could not render PlantUML diagram: {e}")

if __name__ == "__main__":
    main()

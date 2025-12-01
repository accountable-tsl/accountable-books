#!/usr/bin/env python3
"""
Python helper script to generate Pydantic models from JSON Schema files.
Called by the TypeScript generation script.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Optional

try:
    from datamodel_code_generator import generate, InputFileType, DataModelType
except ImportError:
    print("Error: datamodel-code-generator is not installed.", file=sys.stderr)
    print("Run: pip install datamodel-code-generator", file=sys.stderr)
    sys.exit(1)


def normalize_generated_file(file_path: Path) -> None:
    """Normalize a generated file to ensure consistent formatting.
    
    - Ensures LF line endings
    - Normalizes timestamp to a deterministic value (removes timestamp to avoid spurious diffs)
    """
    try:
        # Read file content
        content = file_path.read_text(encoding="utf-8")
        
        # Normalize line endings to LF (remove any CRLF)
        content = content.replace("\r\n", "\n").replace("\r", "\n")
        
        # Remove or normalize timestamp in header comments
        # Replace timestamp with a placeholder to avoid spurious diffs
        # Pattern: #   timestamp: YYYY-MM-DDTHH:MM:SS+00:00
        timestamp_pattern = r"#\s+timestamp:\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+\d{2}:\d{2}"
        content = re.sub(timestamp_pattern, "#   timestamp: <generated>", content)
        
        # Write back with explicit LF line endings
        file_path.write_text(content, encoding="utf-8", newline="\n")
    except Exception as e:
        print(f"Warning: Could not normalize {file_path}: {e}", file=sys.stderr)


def generate_pydantic_from_json_schema(
    json_schema_path: Path, output_path: Path, module_name: str
) -> None:
    """Generate Pydantic models from a JSON Schema file."""
    try:
        # Read and validate JSON Schema
        with open(json_schema_path, "r", encoding="utf-8") as f:
            schema_data = json.load(f)

        # Generate Pydantic models
        generate(
            input_=json_schema_path,
            input_file_type=InputFileType.JsonSchema,
            output=output_path,
            output_model_type=DataModelType.PydanticV2BaseModel,
            use_schema_description=True,
            use_field_description=True,
            use_standard_collections=True,
            use_generic_container_types=True,
            use_annotated=True,
            field_constraints=True,
            snake_case_field=True,
            strip_default_none=True,
        )
        
        # Normalize the generated file (line endings and timestamp)
        normalize_generated_file(output_path)

        print(f"✓ Generated Pydantic models from {json_schema_path.name} -> {output_path}")
    except Exception as e:
        print(f"Error generating Pydantic models from {json_schema_path}: {e}", file=sys.stderr)
        sys.exit(1)


def extract_main_class_name(json_schema_path: Path) -> Optional[str]:
    """Extract the main class name from a JSON schema file.
    
    Reads the 'title' field from the JSON schema (camelCase) and converts
    it to PascalCase for the Python class name.
    
    Args:
        json_schema_path: Path to the JSON schema file
        
    Returns:
        The class name in PascalCase, or None if title is not found
    """
    try:
        with open(json_schema_path, "r", encoding="utf-8") as f:
            schema_data = json.load(f)
        
        title = schema_data.get("title")
        if not title:
            return None
        
        # Convert camelCase to PascalCase
        # e.g., "mlPredictionResponse" -> "MlPredictionResponse"
        return title[0].upper() + title[1:] if title else None
    except Exception as e:
        print(f"Warning: Could not read JSON schema {json_schema_path}: {e}", file=sys.stderr)
        return None


def extract_all_classes_and_enums(py_file_path: Path) -> list[str]:
    """Extract all class and enum names from a generated Python file.
    
    Args:
        py_file_path: Path to the generated Python file
        
    Returns:
        List of class and enum names found in the file
    """
    classes_and_enums: list[str] = []
    
    if not py_file_path.exists():
        return classes_and_enums
    
    try:
        content = py_file_path.read_text(encoding="utf-8")
        
        # Match class definitions: class ClassName(...):
        class_pattern = r"^class\s+(\w+)\s*(?:\(|:)"
        # Match enum definitions: class EnumName(Enum):
        enum_pattern = r"^class\s+(\w+)\s*\(.*Enum.*\):"
        
        for line in content.split("\n"):
            # Check for enum first (more specific)
            enum_match = re.match(enum_pattern, line.strip())
            if enum_match:
                classes_and_enums.append(enum_match.group(1))
                continue
            
            # Check for class
            class_match = re.match(class_pattern, line.strip())
            if class_match:
                classes_and_enums.append(class_match.group(1))
    
    except Exception as e:
        print(f"Warning: Could not parse {py_file_path}: {e}", file=sys.stderr)
    
    return classes_and_enums


# def generate_init_files(output_dir: Path, json_schema_files: list[Path]) -> None:
#     """Generate __init__.py files with all model exports.
    
#     Generates two __init__.py files:
#     1. schema/py/__init__.py - imports from individual modules
#     2. schema/__init__.py - re-exports from schema.py
    
#     Args:
#         output_dir: Directory containing generated Python files
#         json_schema_files: List of JSON schema files that were processed
#     """
#     # Build mapping of (filename, class_name) -> all exports from that file
#     # This includes nested classes and enums, not just the main class
#     all_exports: dict[tuple[str, str], list[str]] = {}
    
#     for json_schema_path in json_schema_files:
#         if not json_schema_path.exists():
#             continue
        
#         # Get the Python filename (same as JSON filename stem)
#         filename = json_schema_path.stem
#         py_file_path = output_dir / f"{filename}.py"
        
#         # Extract all classes and enums from the generated Python file
#         all_classes = extract_all_classes_and_enums(py_file_path)
        
#         if all_classes:
#             # Use the main class name as the key (for backward compatibility)
#             main_class = extract_main_class_name(json_schema_path)
#             if main_class:
#                 all_exports[(filename, main_class)] = all_classes
    
#     if not all_exports:
#         print("Warning: No class mappings found for __init__.py generation", file=sys.stderr)
#         return
    
#     # Collect all unique exports (flatten the nested lists)
#     all_class_names: set[str] = set()
#     for exports in all_exports.values():
#         all_class_names.update(exports)
    
#     # Sort for consistent output
#     sorted_exports = sorted(all_class_names)
    
#     # Build imports - need to import from the correct module
#     # Map each class to its module
#     class_to_module: dict[str, str] = {}
#     for (filename, main_class), exports in all_exports.items():
#         for export_name in exports:
#             # If multiple modules have the same class name, prefer the one from the main schema
#             if export_name not in class_to_module:
#                 class_to_module[export_name] = filename
#             # Special handling: prefer exports from files where they're the main class
#             elif export_name == main_class:
#                 class_to_module[export_name] = filename
    
#     # Generate schema/py/__init__.py
#     py_init_path = output_dir / "__init__.py"
    
#     # Group imports by module to avoid duplicate imports
#     imports_by_module: dict[str, list[str]] = {}
#     for class_name in sorted_exports:
#         module = class_to_module.get(class_name)
#         if module:
#             if module not in imports_by_module:
#                 imports_by_module[module] = []
#             imports_by_module[module].append(class_name)
    
#     # Generate imports
#     py_imports = "\n".join(
#         f"from .{module} import {', '.join(sorted(classes))}"
#         for module, classes in sorted(imports_by_module.items())
#     )
#     py_all_exports = ",\n    ".join(f'"{name}"' for name in sorted_exports)
    
#     py_init_content = f'''"""Generated Pydantic models from Zod schemas."""

{py_imports}

__all__ = [
    {py_all_exports},
]
'''
    
    py_init_path.write_text(py_init_content, encoding="utf-8", newline="\n")
    print(f"✓ Generated {py_init_path} with {len(sorted_exports)} exports")
    
    # Generate schema/__init__.py
    schema_init_path = output_dir.parent / "__init__.py"
    
    # For schema/__init__.py, we need to import from the specific modules
    # when classes come from different modules (e.g., Key from globalintentclassifier)
    schema_imports_list: list[str] = []
    
    # First, add simple imports for classes that come from their main module
    simple_imports: dict[str, list[str]] = {}
    for class_name in sorted_exports:
        module = class_to_module.get(class_name)
        if module:
            # Check if this is the main class for this module
            main_class_for_module = next(
                (main for (fname, main), _ in all_exports.items() if fname == module),
                None
            )
            if class_name == main_class_for_module or class_name not in [m for _, m in class_to_module.items() if m != module]:
                if module not in simple_imports:
                    simple_imports[module] = []
                simple_imports[module].append(class_name)
    
    # Add simple imports
    for module, classes in sorted(simple_imports.items()):
        schema_imports_list.append(f"from .py import {', '.join(sorted(classes))}")
    
    # Add specific imports for nested classes/enums that need explicit module paths
    nested_imports: dict[str, list[str]] = {}
    for class_name in sorted_exports:
        module = class_to_module.get(class_name)
        if module:
            main_class_for_module = next(
                (main for (fname, main), _ in all_exports.items() if fname == module),
                None
            )
            # If it's not the main class, use explicit import
            if class_name != main_class_for_module:
                if module not in nested_imports:
                    nested_imports[module] = []
                nested_imports[module].append(class_name)
    
    for module, classes in sorted(nested_imports.items()):
        schema_imports_list.append(f"from .py.{module} import {', '.join(sorted(classes))}")
    
    schema_imports = "\n".join(schema_imports_list)
    schema_all_exports = ",\n    ".join(f'"{name}"' for name in sorted_exports)
    
    schema_init_content = f'''"""Schema definitions and generated models."""

# Re-export all Pydantic models from py submodule
{schema_imports}

__all__ = [
    {schema_all_exports},
]
'''
    
    schema_init_path.write_text(schema_init_content, encoding="utf-8", newline="\n")
    print(f"✓ Generated {schema_init_path} with {len(sorted_exports)} exports")


def main():
    parser = argparse.ArgumentParser(
        description="Generate Pydantic models from JSON Schema files"
    )
    parser.add_argument(
        "json_schema_files",
        nargs="+",
        type=Path,
        help="JSON Schema file paths",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Output directory for generated Pydantic models",
    )

    args = parser.parse_args()

    # Create output directory if it doesn't exist
    args.output_dir.mkdir(parents=True, exist_ok=True)

    # Generate models for each JSON Schema file
    for json_schema_path in args.json_schema_files:
        if not json_schema_path.exists():
            print(f"Warning: JSON Schema file not found: {json_schema_path}", file=sys.stderr)
            continue

        # Determine output filename based on input filename
        # e.g., enrichment.json -> enrichment.py
        output_filename = json_schema_path.stem + ".py"
        output_path = args.output_dir / output_filename

        generate_pydantic_from_json_schema(json_schema_path, output_path, json_schema_path.stem)

    # Generate __init__.py files with exports
    print("\n📦 Generating __init__.py files with exports...")
    generate_init_files(args.output_dir, args.json_schema_files)

    print(f"\n✓ All Pydantic models generated in {args.output_dir}")


if __name__ == "__main__":
    main()


#!/usr/bin/env python3
"""
Python helper script to generate Pydantic models from JSON Schema files.
Called by the TypeScript generation script.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Optional

try:
    from datamodel_code_generator import generate, InputFileType, DataModelType
except ImportError:
    print("Error: datamodel-code-generator is not installed.", file=sys.stderr)
    print("Run: pip install datamodel-code-generator", file=sys.stderr)
    sys.exit(1)


def generate_pydantic_from_json_schema(
    json_schema_path: Path, output_path: Path, module_name: str
) -> None:
    """Generate Pydantic models from a JSON Schema file."""
    try:
        # Read and validate JSON Schema
        with open(json_schema_path, "r") as f:
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


def generate_init_files(output_dir: Path, json_schema_files: list[Path]) -> None:
    """Generate __init__.py files with all model exports.
    
    Generates two __init__.py files:
    1. schema/py/__init__.py - imports from individual modules
    2. schema/__init__.py - re-exports from schema.py
    
    Args:
        output_dir: Directory containing generated Python files
        json_schema_files: List of JSON schema files that were processed
    """
    # Build mapping of filename -> class name
    class_mappings: list[tuple[str, str]] = []
    
    for json_schema_path in json_schema_files:
        if not json_schema_path.exists():
            continue
        
        # Get the Python filename (same as JSON filename stem)
        filename = json_schema_path.stem
        
        # Extract class name from JSON schema title
        class_name = extract_main_class_name(json_schema_path)
        if class_name:
            class_mappings.append((filename, class_name))
    
    if not class_mappings:
        print("Warning: No class mappings found for __init__.py generation", file=sys.stderr)
        return
    
    # Sort by class name for consistent output
    class_mappings.sort(key=lambda x: x[1])
    
    # Generate schema/py/__init__.py
    py_init_path = output_dir / "__init__.py"
    py_imports = "\n".join(
        f"from .{filename} import {class_name}"
        for filename, class_name in class_mappings
    )
    py_all_exports = ",\n    ".join(f'"{class_name}"' for _, class_name in class_mappings)
    
    py_init_content = f'''"""Generated Pydantic models from Zod schemas."""

{py_imports}

__all__ = [
    {py_all_exports},
]
'''
    
    py_init_path.write_text(py_init_content, encoding="utf-8")
    print(f"✓ Generated {py_init_path} with {len(class_mappings)} exports")
    
    # Generate schema/__init__.py
    schema_init_path = output_dir.parent / "__init__.py"
    schema_imports = "\n".join(
        f"from .py import {class_name}"
        for _, class_name in class_mappings
    )
    schema_all_exports = ",\n    ".join(f'"{class_name}"' for _, class_name in class_mappings)
    
    schema_init_content = f'''"""Schema definitions and generated models."""

# Re-export all Pydantic models from py submodule
{schema_imports}

__all__ = [
    {schema_all_exports},
]
'''
    
    schema_init_path.write_text(schema_init_content, encoding="utf-8")
    print(f"✓ Generated {schema_init_path} with {len(class_mappings)} exports")


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


#!/usr/bin/env python3
"""
Python helper script to generate Pydantic models from JSON Schema files.
Called by the TypeScript generation script.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

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

    # Create __init__.py files for proper Python package structure
    # Create __init__.py in output directory
    init_file = args.output_dir / "__init__.py"
    if not init_file.exists():
        init_file.write_text('"""Generated Pydantic models from Zod schemas."""\n')
        print(f"✓ Created {init_file}")

    # Create __init__.py in parent schema directory if it doesn't exist
    schema_init = args.output_dir.parent / "__init__.py"
    if not schema_init.exists():
        schema_init.write_text('"""Schema definitions and generated models."""\n')
        print(f"✓ Created {schema_init}")

    print(f"\n✓ All Pydantic models generated in {args.output_dir}")


if __name__ == "__main__":
    main()


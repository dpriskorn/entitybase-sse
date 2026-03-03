#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCS_DIR="$PROJECT_ROOT/docs"
DIAGRAMS_DIR="$DOCS_DIR/diagrams"

echo "Generating PlantUML diagrams..."

if [ ! -d "$DIAGRAMS_DIR" ]; then
    mkdir -p "$DIAGRAMS_DIR"
fi

for puml in "$DOCS_DIR"/*.puml; do
    if [ -f "$puml" ]; then
        filename=$(basename "$puml" .puml)
        echo "  Generating $filename.png..."
        plantuml -o "$DIAGRAMS_DIR" "$puml"
    fi
done

echo ""
echo "Generated diagrams in $DIAGRAMS_DIR:"
ls -la "$DIAGRAMS_DIR"/*.png 2>/dev/null || echo "  No diagrams generated"

echo ""
echo "Done!"

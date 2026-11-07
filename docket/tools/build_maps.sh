#!/usr/bin/env bash
# Regenerate the derived Qamis maps from the original watercolor:
#   docket/map-nice-marked.jpeg       Jia moved, Freeport and Qaringil marked
#   docket/map-nice-marked-flat.jpeg  same, with the sea a flat light blue
# Needs uv (fetches scipy/numpy/pillow into a throwaway environment) and the
# Purisa font (fonts-tlwg-purisa).
set -euo pipefail
cd "$(dirname "$0")/.."
TOOLS=tools
PY="uv run --quiet --no-project --with scipy --with numpy --with pillow python"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

$PY $TOOLS/mark_map.py map-nice.jpeg map-nice-marked.jpeg
$PY $TOOLS/flatten_sea.py map-nice.jpeg "$TMP/flat.png"
$PY $TOOLS/mark_map.py "$TMP/flat.png" map-nice-marked-flat.jpeg
echo "wrote docket/map-nice-marked.jpeg and docket/map-nice-marked-flat.jpeg"

#!/usr/bin/env bash
set -euo pipefail

echo "Docsy TeX uses local job processing and local artifact storage."
echo "No GCS bucket or Cloud Tasks queue is required."

cat <<EOF
preview_public_base_url=${TEX_PREVIEW_PUBLIC_BASE_URL:-}
EOF

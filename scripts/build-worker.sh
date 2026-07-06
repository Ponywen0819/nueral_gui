#!/usr/bin/env bash
# Freeze the Python pipeline worker into a self-contained binary that gets
# bundled into the app (electron-builder.yml -> extraResources). Must run before
# electron-builder. Regenerate whenever the Python worker or its deps change.
set -euo pipefail
cd "$(dirname "$0")/../submodules/ienf_q"

if [ ! -x .venv/bin/python ]; then
  echo "error: submodules/ienf_q/.venv missing — run 'uv sync' there first." >&2
  exit 1
fi
if ! .venv/bin/python -c "import PyInstaller" 2>/dev/null; then
  echo "error: PyInstaller not installed in the venv — run 'uv pip install pyinstaller'." >&2
  exit 1
fi

# onedir bundle -> pyi/dist/electron_worker/electron_worker
.venv/bin/python -m PyInstaller electron_worker.spec --noconfirm \
  --distpath pyi/dist --workpath pyi/build
echo "worker frozen -> submodules/ienf_q/pyi/dist/electron_worker"

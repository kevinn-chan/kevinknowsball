#!/bin/bash
# Run from the project root: ./backend/start.sh
cd "$(dirname "$0")/.."
.venv/bin/uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

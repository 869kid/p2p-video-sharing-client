#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  docker compose build app
else
  docker compose build "$@"
fi

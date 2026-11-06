#!/bin/sh
# Copies the canonical ../config/*.json into app/server/data so the Docker build context (app/) has them.
set -e; cd "$(dirname "$0")"; cp ../config/rules.json ../config/exclude.json server/data/

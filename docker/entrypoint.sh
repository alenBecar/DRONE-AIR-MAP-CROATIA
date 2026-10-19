#!/bin/sh
set -e
mkdir -p /data/pub /data/work /data/cache/sat
python3 -u /app/pipeline/scheduler.py &
exec nginx -g 'daemon off;'

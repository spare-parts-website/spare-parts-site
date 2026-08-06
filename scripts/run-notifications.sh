#!/bin/bash
# Persistent runner for notifications service

LOG=/tmp/notifications.log
DIR=/home/z/my-project/mini-services/notifications

while true; do
  echo "[$(date)] Starting notifications service..." >> $LOG
  cd $DIR && bun index.ts >> $LOG 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Service exited with code $EXIT_CODE, restarting in 3s..." >> $LOG
  # Kill any lingering processes on the ports
  pkill -9 -f "notifications/index" 2>/dev/null || true
  sleep 3
done

#!/bin/bash
# Persistent dev server runner

LOG=/tmp/dev.log
DIR=/home/z/my-project

export DATABASE_URL="postgresql://postgres.sufrsfrrrzhhdluolxdf:H9nmKFg2tld3ZVAj@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
export DIRECT_URL="postgresql://postgres.sufrsfrrrzhhdluolxdf:H9nmKFg2tld3ZVAj@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
export NODE_ENV=development

while true; do
  echo "[$(date)] Starting dev server..." >> $LOG
  cd $DIR && exec bun run dev >> $LOG 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 3s..." >> $LOG
  sleep 3
done

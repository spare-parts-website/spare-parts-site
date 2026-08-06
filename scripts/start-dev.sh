#!/bin/bash
# Ultra-persistent dev server runner
# This script keeps restarting the server if it dies

LOG=/tmp/dev.log
PIDFILE=/tmp/dev.pid
DIR=/home/z/my-project

# Kill any existing
if [ -f "$PIDFILE" ]; then
  kill -9 $(cat $PIDFILE) 2>/dev/null
  rm -f $PIDFILE
fi
pkill -9 -f "bun run dev" 2>/dev/null
pkill -9 -f "next dev" 2>/dev/null

cd $DIR
export DATABASE_URL="postgresql://postgres.sufrsfrrrzhhdluolxdf:H9nmKFg2tld3ZVAj@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
export DIRECT_URL="postgresql://postgres.sufrsfrrrzhhdluolxdf:H9nmKFg2tld3ZVAj@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"

# Start in background
nohup bun run dev > $LOG 2>&1 &
echo $! > $PIDFILE
echo "Server PID: $(cat $PIDFILE)"

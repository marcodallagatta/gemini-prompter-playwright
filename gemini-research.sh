#!/bin/bash

# Gemini Task Runner - Shell Wrapper
# Runs the Playwright script for a specific task

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Parse arguments
TASK_NAME=""
LOGIN_ONLY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --task)
      TASK_NAME="$2"
      shift 2
      ;;
    --login-only)
      LOGIN_ONLY=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Determine log file
if [ -n "$TASK_NAME" ]; then
  SLUG=$(echo "$TASK_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
  LOG_FILE="$SCRIPT_DIR/logs/${SLUG}.log"
  mkdir -p "$SCRIPT_DIR/logs"
else
  LOG_FILE="$SCRIPT_DIR/gemini.log"
fi

# Run the Node.js script
if [ "$LOGIN_ONLY" = true ]; then
  node gemini-runner.js --login-only 2>&1 | tee -a "$LOG_FILE"
elif [ -n "$TASK_NAME" ]; then
  node gemini-runner.js --task "$TASK_NAME" 2>&1 | tee -a "$LOG_FILE"
else
  echo "Usage: $0 --task \"Task Name\""
  echo "       $0 --login-only"
  exit 1
fi

exit ${PIPESTATUS[0]}

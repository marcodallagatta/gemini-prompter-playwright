#!/bin/bash

# Gemini Multi-Task Setup Script
# Configures Telegram, validates tasks.yaml, and installs launchd jobs

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
ENV_FILE="$SCRIPT_DIR/.env"
TASKS_FILE="$SCRIPT_DIR/tasks.yaml"
TASKS_EXAMPLE="$SCRIPT_DIR/tasks.example.yaml"
PLISTS_DIR="$SCRIPT_DIR/plists"
LOGS_DIR="$SCRIPT_DIR/logs"

echo "=== Gemini Multi-Task Setup ==="
echo ""

# ============================================================
# Step 1: Telegram Configuration (Optional)
# ============================================================
echo "Step 1: Telegram Configuration (Optional)"
echo "------------------------------------------"

# Source existing .env if present
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi

# Check if Telegram is already configured
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ "$TELEGRAM_BOT_TOKEN" != "your_bot_token_here" ]; then
  echo "TELEGRAM_BOT_TOKEN: [already set]"
  echo "TELEGRAM_CHAT_ID: [already set]"
else
  echo "Telegram notifications are optional. Set 'notify: true' in tasks.yaml to use them."
  read -p "Configure Telegram now? (y/N): " CONFIGURE_TELEGRAM

  if [ "$CONFIGURE_TELEGRAM" = "y" ] || [ "$CONFIGURE_TELEGRAM" = "Y" ]; then
    echo "Create a Telegram bot via @BotFather to get your token."
    read -p "Enter TELEGRAM_BOT_TOKEN: " TELEGRAM_BOT_TOKEN

    if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
      echo "Send a message to your bot and use @userinfobot to get your chat ID."
      read -p "Enter TELEGRAM_CHAT_ID: " TELEGRAM_CHAT_ID

      # Save to .env file
      cat > "$ENV_FILE" << EOF
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID
EOF
      echo "Saved Telegram configuration to .env"
    else
      echo "Skipping Telegram configuration."
    fi
  else
    echo "Skipping Telegram configuration."
  fi
fi
echo ""

# ============================================================
# Step 2: Tasks Configuration
# ============================================================
echo "Step 2: Tasks Configuration"
echo "---------------------------"

if [ ! -f "$TASKS_FILE" ]; then
  if [ -f "$TASKS_EXAMPLE" ]; then
    cp "$TASKS_EXAMPLE" "$TASKS_FILE"
    echo "Created tasks.yaml from tasks.example.yaml"
    echo ""
    echo "Please edit tasks.yaml to configure your tasks, then run setup.sh again."
    exit 0
  else
    echo "Error: Neither tasks.yaml nor tasks.example.yaml found."
    exit 1
  fi
fi

# Parse and display tasks using Node.js
echo "Found tasks.yaml with the following tasks:"
echo ""
node -e "
const fs = require('fs');
const yaml = require('js-yaml');
const config = yaml.load(fs.readFileSync('$TASKS_FILE', 'utf-8'));
config.tasks.forEach((task, i) => {
  const h = String(task.schedule.hour).padStart(2, '0');
  const m = String(task.schedule.minute).padStart(2, '0');
  console.log('  ' + (i+1) + '. ' + task.name + ' (' + task.mode + ') at ' + h + ':' + m);
});
"
echo ""

# ============================================================
# Step 3: Installing LaunchAgents
# ============================================================
echo "Step 3: Installing LaunchAgents"
echo "--------------------------------"

# Remove old gemini-task-*.plist files
echo "Cleaning up old plist files..."
for plist in "$LAUNCH_AGENTS_DIR"/gemini-task-*.plist; do
  if [ -f "$plist" ]; then
    launchctl unload "$plist" 2>/dev/null || true
    rm "$plist"
    echo "  Removed: $(basename "$plist")"
  fi
done

# Remove legacy com.user.gemini-research.plist if exists
LEGACY_PLIST="$LAUNCH_AGENTS_DIR/com.user.gemini-research.plist"
if [ -f "$LEGACY_PLIST" ]; then
  launchctl unload "$LEGACY_PLIST" 2>/dev/null || true
  rm "$LEGACY_PLIST"
  echo "  Removed: com.user.gemini-research.plist (legacy)"
fi

# Create plists and logs directories
mkdir -p "$PLISTS_DIR"
mkdir -p "$LOGS_DIR"

# Clear old generated plists
rm -f "$PLISTS_DIR"/*.plist 2>/dev/null || true

# Generate plists for each task using Node.js
echo "Generating plist files..."
node -e "
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const config = yaml.load(fs.readFileSync('$TASKS_FILE', 'utf-8'));
const tasks = config.tasks;
const scriptDir = '$SCRIPT_DIR';
const plistsDir = '$PLISTS_DIR';
const logsDir = '$LOGS_DIR';

tasks.forEach(task => {
  // Create slug from task name
  const slug = task.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const label = 'com.user.gemini-task-' + slug;
  const plistPath = path.join(plistsDir, 'gemini-task-' + slug + '.plist');

  const plistContent = \`<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
    <key>Label</key>
    <string>\${label}</string>

    <key>ProgramArguments</key>
    <array>
        <string>\${scriptDir}/gemini-research.sh</string>
        <string>--task</string>
        <string>\${task.name}</string>
    </array>

    <key>WorkingDirectory</key>
    <string>\${scriptDir}</string>

    <key>StandardOutPath</key>
    <string>\${logsDir}/\${slug}-stdout.log</string>

    <key>StandardErrorPath</key>
    <string>\${logsDir}/\${slug}-stderr.log</string>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>\${task.schedule.hour}</integer>
        <key>Minute</key>
        <integer>\${task.schedule.minute}</integer>
    </dict>

    <key>RunAtLoad</key>
    <false/>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>\`;

  fs.writeFileSync(plistPath, plistContent);
  console.log('  Generated: gemini-task-' + slug + '.plist');
});
"

# Copy plists to LaunchAgents and load them
echo "Installing and loading launchd jobs..."
mkdir -p "$LAUNCH_AGENTS_DIR"

for plist in "$PLISTS_DIR"/*.plist; do
  if [ -f "$plist" ]; then
    plist_name=$(basename "$plist")
    cp "$plist" "$LAUNCH_AGENTS_DIR/"
    launchctl load "$LAUNCH_AGENTS_DIR/$plist_name"
    echo "  Loaded: $plist_name"
  fi
done

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Your tasks are now scheduled to run automatically."
echo ""
echo "To verify: launchctl list | grep gemini-task"
echo ""
echo "Next steps:"
echo "  1. Run 'pnpm run login' to log into Google (one-time)"
echo "  2. Run 'pnpm start -- --task \"Task Name\"' to test a specific task"
echo "  3. Set up wake schedule for your earliest task:"
echo "     sudo pmset repeat wake MTWRFSU HH:MM:00"
echo ""

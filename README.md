# Gemini Task Scheduler

Automate scheduled queries to Google Gemini with support for Pro and Deep Research modes.

## Features

- **Multi-task scheduling**: Define multiple tasks with different schedules
- **Two modes**: Pro mode for quick queries, Deep Research for in-depth analysis
- **Telegram notifications**: Get notified when Pro tasks complete with a link to the chat
- **Reliable scheduling**: Uses macOS launchd for persistent, system-level scheduling
- **Persistent login**: Log in once, stay logged in with a saved Chrome profile

## Requirements

- macOS (uses launchd for scheduling)
- Node.js 18+
- pnpm (or npm)
- Telegram bot (optional, for notifications)

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/gemini-task-scheduler.git
cd gemini-task-scheduler

# 2. Install dependencies
pnpm install

# 3. Install Playwright's Chromium browser
pnpm exec playwright install chromium

# 4. Run setup (configures Telegram and creates tasks.yaml)
./setup.sh

# 5. Edit tasks.yaml to define your tasks
# (setup.sh creates it from tasks.example.json on first run)

# 6. Run setup again to install launchd jobs
./setup.sh

# 7. Log into Google (one-time)
pnpm run login
```

## Configuration

### tasks.yaml

Define your scheduled tasks in `tasks.yaml`:

```yaml
# Gemini Task Scheduler Configuration

tasks:
  # Pro mode: quick queries with immediate response
  - name: Morning Briefing
    mode: pro
    promptFile: ~/Dropbox/prompts/morning-briefing.txt
    schedule:
      hour: 8
      minute: 30
    notify: true  # Send Telegram notification with chat link

  # Deep Research mode: in-depth analysis (Gemini emails when done)
  - name: Daily Research
    mode: deep-research
    promptFile: ~/Dropbox/prompts/research.txt
    schedule:
      hour: 18
      minute: 30
    notify: false  # Gemini already notifies via app for deep research
```

| Field | Description |
|-------|-------------|
| `name` | Unique name for the task (used in commands and notifications) |
| `mode` | Either `pro` or `deep-research` |
| `promptFile` | Path to your prompt file (supports `~` for home directory) |
| `schedule.hour` | Hour to run (0-23) |
| `schedule.minute` | Minute to run (0-59) |
| `notify` | Optional. Send Telegram notifications (`true`/`false`, default: `true`) |

**Disabling all tasks**: To remove all scheduled tasks, comment out or remove all tasks from the `tasks` array, then run `./setup.sh`. This will automatically unload and delete all Gemini launchd jobs.

### .env (Optional)

If you want Telegram notifications, configure your bot credentials in `.env`:

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

The setup script will optionally prompt you for these values. To get them:

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. Send a message to your bot
3. Get your chat ID from [@userinfobot](https://t.me/userinfobot)

### Prompt Files

Prompt files are plain text files containing your query. You can use the `{{CURRENT_DATE}}` placeholder, which will be replaced with today's date (e.g., "January 28, 2026").

Example prompt file:

```
Analyze market trends for {{CURRENT_DATE}} and provide actionable insights.
```

## Usage

### Run a task manually

```bash
pnpm start -- --task "Morning Briefing"
```

### Re-login to Google

If your session expires:

```bash
pnpm run login
```

### Update schedules

After editing `tasks.yaml`, run setup again to update launchd jobs:

```bash
./setup.sh
```

**Note**: If you comment out or remove all tasks in `tasks.yaml`, running `./setup.sh` will automatically unload and delete all existing Gemini scheduled tasks from launchd. This provides a clean way to disable all automation without manually removing plist files.

### Check scheduled tasks

```bash
launchctl list | grep gemini-task
```

## How Scheduling Works

This project uses **launchd**, macOS's native job scheduler, to run tasks at specified times.

### How launchd works

- Jobs are defined in plist files in `~/Library/LaunchAgents/`
- Each task gets its own plist file (e.g., `gemini-task-morning-briefing.plist`)
- Jobs run in your user session (you must be logged in, but screen can be locked)

### Missed tasks on wake

If your Mac was asleep at the scheduled time, launchd runs the job as soon as the Mac wakes up. This means you won't miss tasks even if your Mac is in sleep mode.

### Optional: Wake schedule with pmset

For guaranteed task execution even from sleep, you can set up a wake schedule:

```bash
# Wake Mac 1 minute before your earliest task (e.g., 8:29 for an 8:30 task)
sudo pmset repeat wake MTWRFSU 08:29:00

# Check current wake schedule
pmset -g sched

# Remove wake schedule
sudo pmset repeat cancel
```

Notes:
- `MTWRFSU` = Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
- Requires admin password (sudo)
- Persists across reboots

## Notifications

Telegram notifications are optional. Set `"notify": true` in a task's config to enable them, or `"notify": false` to disable. If omitted, notifications default to enabled.

### Pro mode

Pro mode tasks send a Telegram notification immediately after submitting the prompt, including a link to the chat. This lets you check the response at your convenience.

### Deep Research mode

Deep Research tasks typically don't need Telegram notifications since Gemini sends an email when research is complete. Set `"notify": false` for these tasks.

### Failures

Task failures are reported via Telegram when `notify` is enabled for that task.

## Logs

Logs are stored in the `logs/` directory:

| File | Description |
|------|-------------|
| `logs/<task-slug>.log` | Task-specific log with timestamps |
| `logs/<task-slug>-stdout.log` | launchd stdout output |
| `logs/<task-slug>-stderr.log` | launchd stderr output |

To view logs for a task:

```bash
cat logs/morning-briefing.log
```

## Troubleshooting

### Task doesn't run at scheduled time

1. Verify launchd jobs are loaded:
   ```bash
   launchctl list | grep gemini-task
   ```

2. Check launchd stderr logs:
   ```bash
   cat logs/<task-slug>-stderr.log
   ```

3. Make sure you're logged in (launchd jobs run in your user session)

4. Try running the task manually to see detailed output:
   ```bash
   pnpm start -- --task "Task Name"
   ```

### Login expired

Re-run the login command:

```bash
pnpm run login
```

Log into your Google account in the browser that opens, then close it.

### Telegram not working

1. Verify your bot token and chat ID in `.env`

2. Make sure you've sent at least one message to your bot (bots can't initiate conversations)

3. Test the bot manually:
   ```bash
   curl -s "https://api.telegram.org/bot<YOUR_TOKEN>/sendMessage?chat_id=<YOUR_CHAT_ID>&text=Test"
   ```

### "Operation not permitted" error

This happens when the project is in a protected folder (Documents, Desktop, Downloads).

Move the project to your home directory:

```bash
mv ~/Documents/gemini-task-scheduler ~/gemini-task-scheduler
cd ~/gemini-task-scheduler
./setup.sh
```

## Uninstall

To completely remove the scheduler and all OS-level changes:

```bash
# 1. Unload and remove all launchd jobs
for plist in ~/Library/LaunchAgents/gemini-task-*.plist; do
  launchctl unload "$plist" 2>/dev/null
  rm "$plist"
done

# 2. Remove wake schedule (if you set one)
sudo pmset repeat cancel

# 3. Verify removal
launchctl list | grep gemini-task  # Should return nothing
pmset -g sched                      # Should show no scheduled events

# 4. Delete the project folder (optional)
rm -rf ~/gemini-task-scheduler
```

## License

MIT

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

const CONFIG_FILE = path.join(__dirname, '..', 'tasks.yaml');

/**
 * Expand ~ to home directory in paths
 */
function expandPath(filePath) {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Load and parse tasks.yaml
 */
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Configuration file not found: ${CONFIG_FILE}\nRun ./setup.sh to create it.`);
  }

  const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
  const config = yaml.load(content);

  if (!config.tasks || !Array.isArray(config.tasks)) {
    throw new Error('Invalid config: "tasks" array is required');
  }

  return config;
}

/**
 * Get a specific task by name
 */
function getTask(taskName) {
  const config = loadConfig();
  const task = config.tasks.find(t => t.name === taskName);

  if (!task) {
    const available = config.tasks.map(t => t.name).join(', ');
    throw new Error(`Task not found: "${taskName}"\nAvailable tasks: ${available}`);
  }

  // Validate required fields
  if (!task.mode || !['pro', 'deep-research'].includes(task.mode)) {
    throw new Error(`Invalid mode for task "${taskName}": must be "pro" or "deep-research"`);
  }

  if (!task.promptFile) {
    throw new Error(`Missing promptFile for task "${taskName}"`);
  }

  if (!task.schedule || typeof task.schedule.hour !== 'number' || typeof task.schedule.minute !== 'number') {
    throw new Error(`Invalid schedule for task "${taskName}": requires hour and minute`);
  }

  return {
    ...task,
    promptFile: expandPath(task.promptFile)
  };
}

/**
 * Get all tasks
 */
function getAllTasks() {
  const config = loadConfig();
  return config.tasks.map(task => ({
    ...task,
    promptFile: expandPath(task.promptFile)
  }));
}

/**
 * Slugify task name for plist filenames
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

module.exports = {
  loadConfig,
  getTask,
  getAllTasks,
  slugify,
  expandPath
};

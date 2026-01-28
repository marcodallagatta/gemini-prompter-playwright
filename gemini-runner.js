#!/usr/bin/env node

// Load environment variables from .env
require('./lib/env');

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const { getTask } = require('./lib/config');
const { notifySuccess, notifyFailure } = require('./lib/telegram');

// Configuration
const CONFIG = {
  maxRetries: 5,
  startResearchTimeout: 3 * 60 * 1000,  // 3 minutes
  responseTimeout: 2 * 60 * 1000,        // 2 minutes
  highTrafficWait: 5 * 60 * 1000,        // 5 minutes
  profileDir: 'chrome-profile',
  geminiUrl: 'https://gemini.google.com/app',
  headless: false,
};

// Logging helper
function log(message) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logLine = `[${timestamp}] ${message}`;
  console.log(logLine);
}

// Read prompt from file and replace variables
function readPrompt(promptFile) {
  if (!fs.existsSync(promptFile)) {
    throw new Error(`Prompt file not found: ${promptFile}`);
  }
  let content = fs.readFileSync(promptFile, 'utf-8').trim();
  if (!content) {
    throw new Error('Prompt file is empty');
  }

  // Replace {{CURRENT_DATE}} with today's date (e.g., "January 15, 2026")
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  content = content.replace(/\{\{CURRENT_DATE\}\}/g, formattedDate);

  return content;
}

// Setup page: navigate to Gemini, handle cookies, wait for input
async function setupPage(context) {
  const page = await context.newPage();

  // Navigate to Gemini
  log('Navigating to gemini.google.com/app');
  await page.goto(CONFIG.geminiUrl, { waitUntil: 'domcontentloaded' });
  log('Page loaded, waiting for UI to settle...');
  await page.waitForTimeout(3000);

  // Handle cookie consent if it appears
  const acceptButton = page.locator('button:has-text("Accept all")');
  if (await acceptButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    log('Cookie consent detected, accepting...');
    await acceptButton.click();
    await page.waitForTimeout(2000);
  }

  // Wait for the main input area to be visible
  log('Waiting for Gemini UI to be ready...');
  await page.waitForSelector('[contenteditable="true"], textarea, [role="textbox"]', { timeout: 15000 });
  log('Gemini UI ready');

  return page;
}

// Select Pro model from the model selector
async function selectProModel(page) {
  log('Looking for model selector...');

  // Check if Pro is already selected
  const currentModel = page.locator('[data-test-id="logo-pill-label-container"] span').first();
  const modelText = await currentModel.textContent().catch(() => '');
  if (modelText.includes('Pro')) {
    log('Pro model already selected');
    return;
  }

  // Click on the model selector to open dropdown
  const modelSelector = page.locator('[data-test-id="bard-mode-menu-button"]');
  await modelSelector.waitFor({ state: 'visible', timeout: 10000 });
  log('Found model selector, clicking...');
  await modelSelector.click();
  await page.waitForTimeout(1000);

  // Select Pro model from the dropdown menu
  log('Looking for Pro option in menu...');
  const proOption = page.locator('[data-test-id="bard-mode-option-pro"]');
  await proOption.waitFor({ state: 'visible', timeout: 5000 });
  log('Found Pro option, clicking...');
  await proOption.click();
  await page.waitForTimeout(1000);

  log('Pro model selected');
}

// Run Pro mode: select model, submit prompt, grab URL, notify
async function runProMode(context, task, attemptNumber) {
  log(`Attempt ${attemptNumber}/${CONFIG.maxRetries}: Running Pro mode`);

  const page = await setupPage(context);

  try {
    // Select Pro model (non-fatal if it fails - Gemini may default to a usable model)
    try {
      await selectProModel(page);
    } catch (e) {
      log(`Warning: Could not select Pro model (${e.message}). Continuing with default model.`);
    }

    // Read and paste prompt
    const prompt = readPrompt(task.promptFile);
    log(`Pasting prompt (${prompt.length} chars)`);

    // Find the input area
    log('Looking for input area...');
    const inputArea = page.locator('div[contenteditable="true"], textarea, [role="textbox"]').first();
    await inputArea.waitFor({ state: 'visible', timeout: 5000 });
    log('Found input area, clicking and filling...');
    await inputArea.click();
    await page.waitForTimeout(500);
    await inputArea.fill(prompt);
    await page.waitForTimeout(1000);

    // Submit the prompt
    log('Submitting prompt');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');

    // Wait for URL to include conversation ID (e.g., /app/0d057f082b9e5154)
    log('Waiting for conversation URL...');
    let chatUrl = page.url();
    const maxWait = 30000; // 30 seconds max
    const checkInterval = 500;
    let elapsed = 0;

    while (elapsed < maxWait) {
      chatUrl = page.url();
      // Check if URL has a conversation ID (hex string after /app/)
      if (/\/app\/[a-f0-9]+/.test(chatUrl)) {
        break;
      }
      await page.waitForTimeout(checkInterval);
      elapsed += checkInterval;
    }

    log(`Chat URL: ${chatUrl}`);

    // Send Telegram notification if enabled
    if (task.notify !== false) {
      await notifySuccess(task.name, chatUrl);
    }

    await page.close();
    return { success: true, chatUrl };

  } catch (error) {
    log(`ERROR: ${error.message}`);
    await page.close();
    return { success: false, retry: true, reason: error.message };
  }
}

// Run Deep Research mode
async function runDeepResearchMode(context, task, attemptNumber) {
  log(`Attempt ${attemptNumber}/${CONFIG.maxRetries}: Running Deep Research mode`);

  const page = await setupPage(context);

  try {
    // Click Tools - it's a SPAN element, not a button
    log('Looking for Tools...');
    const toolsSpan = page.locator('span:has-text("Tools")').first();
    await toolsSpan.waitFor({ state: 'visible', timeout: 15000 });
    log('Found Tools, clicking...');
    await toolsSpan.click();
    await page.waitForTimeout(1000);

    // Click Deep Research option
    log('Looking for Deep Research option...');
    const deepResearchOption = page.locator('div:has-text("Deep Research")').last();
    await deepResearchOption.waitFor({ state: 'visible', timeout: 5000 });
    log('Found Deep Research, clicking...');
    await deepResearchOption.click();
    await page.waitForTimeout(1000);

    // Read and paste prompt
    const prompt = readPrompt(task.promptFile);
    log(`Pasting prompt (${prompt.length} chars)`);

    // Find the input area
    log('Looking for input area...');
    const inputArea = page.locator('div[contenteditable="true"], textarea, [role="textbox"]').first();
    await inputArea.waitFor({ state: 'visible', timeout: 5000 });
    log('Found input area, clicking and filling...');
    await inputArea.click();
    await page.waitForTimeout(500);
    await inputArea.fill(prompt);
    await page.waitForTimeout(1000);

    // Submit the prompt
    log('Submitting prompt');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');

    // Wait for "Start research" button
    log('Waiting for "Start research" button (max 3 mins)');
    const startResearchButton = page.locator('button:has-text("Start research")');

    try {
      await startResearchButton.waitFor({
        state: 'visible',
        timeout: CONFIG.startResearchTimeout
      });
    } catch (e) {
      log('TIMEOUT: "Start research" button not found after 3 mins');
      await page.close();
      return { success: false, retry: true, reason: 'derailed' };
    }

    // Click Start research
    log('Found "Start research" button, clicking');
    await startResearchButton.click();

    // Wait for response
    return await waitForDeepResearchResponse(page, task.name);

  } catch (error) {
    log(`ERROR: ${error.message}`);
    await page.close();
    return { success: false, retry: true, reason: error.message };
  }
}

// Wait for Deep Research response (success or high-traffic)
async function waitForDeepResearchResponse(page, taskName) {
  log('Waiting for response...');

  const successText = "I'll let you know when the research is finished";
  const highTrafficText = "experiencing unusually high traffic";

  const maxWaitTime = CONFIG.responseTimeout;
  const checkInterval = 2000;
  let elapsed = 0;

  while (elapsed < maxWaitTime) {
    const pageContent = await page.content();

    // Check for success - various indicators that research has started
    const researchStarted =
      pageContent.includes(successText) ||
      pageContent.includes("I'm on it") ||
      pageContent.includes("Starting research") ||
      /Researching \d+ websites?/.test(pageContent);

    if (researchStarted) {
      log('SUCCESS: Research started');
      await page.close();
      return { success: true };
    }

    // Check for high traffic
    if (pageContent.includes(highTrafficText) || pageContent.includes("full capacity")) {
      log('High traffic detected, waiting 5 mins then clicking Redo');
      await page.waitForTimeout(CONFIG.highTrafficWait);

      // Try to click Redo button
      const redoButton = page.locator('[aria-label="Redo"], button:has-text("Redo")').first();
      try {
        await redoButton.waitFor({ state: 'visible', timeout: 10000 });
        await redoButton.click();
        log('Clicked Redo button');

        // Reset and wait for response again
        elapsed = 0;
        continue;
      } catch (e) {
        log('Could not find Redo button, will retry from scratch');
        await page.close();
        return { success: false, retry: true, reason: 'redo_not_found' };
      }
    }

    await page.waitForTimeout(checkInterval);
    elapsed += checkInterval;
  }

  log('TIMEOUT: No recognizable response after waiting');
  await page.close();
  return { success: false, retry: true, reason: 'response_timeout' };
}

// Main entry point
async function main() {
  const args = process.argv.slice(2);
  const loginOnly = args.includes('--login-only');
  const visible = args.includes('--visible');
  const taskIndex = args.indexOf('--task');
  const taskName = taskIndex !== -1 ? args[taskIndex + 1] : null;

  log('Starting Gemini automation');

  // Launch browser with persistent profile
  const profilePath = path.join(__dirname, CONFIG.profileDir);
  log(`Using Chrome profile: ${profilePath}`);

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: (loginOnly || visible) ? false : CONFIG.headless,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  // Login-only mode: just open the browser for manual login
  if (loginOnly) {
    log('Login-only mode: Opening browser for manual login');
    log('Please log into your Google account, then close the browser');
    const page = await context.newPage();
    await page.goto(CONFIG.geminiUrl);

    // Wait for browser to be closed manually
    await new Promise((resolve) => {
      context.on('close', resolve);
    });

    log('Browser closed. Profile saved.');
    return;
  }

  // Task mode: require --task argument
  if (!taskName) {
    log('ERROR: --task argument is required');
    log('Usage: node gemini-runner.js --task <task-name>');
    log('       node gemini-runner.js --login-only');
    await context.close();
    process.exit(1);
  }

  // Load task configuration
  let task;
  try {
    task = getTask(taskName);
    log(`Loaded task: ${task.name} (mode: ${task.mode})`);
  } catch (e) {
    log(`ERROR: ${e.message}`);
    await context.close();
    process.exit(1);
  }

  // Validate prompt file exists
  try {
    readPrompt(task.promptFile);
  } catch (e) {
    log(`ERROR: ${e.message}`);
    if (task.notify !== false) {
      await notifyFailure(task.name, e.message);
    }
    await context.close();
    process.exit(1);
  }

  // Run with retries
  let attempt = 1;
  while (attempt <= CONFIG.maxRetries) {
    let result;

    if (task.mode === 'pro') {
      result = await runProMode(context, task, attempt);
    } else if (task.mode === 'deep-research') {
      result = await runDeepResearchMode(context, task, attempt);
    } else {
      log(`ERROR: Unknown mode: ${task.mode}`);
      await context.close();
      process.exit(1);
    }

    if (result.success) {
      log('Closing browser, done');
      await context.close();
      process.exit(0);
    }

    if (!result.retry) {
      log(`FAILED: ${result.reason}`);
      break;
    }

    log(`RETRY ${attempt}/${CONFIG.maxRetries}: ${result.reason}`);
    attempt++;

    // Brief pause between retries
    await new Promise(r => setTimeout(r, 2000));
  }

  log(`FAILED: Giving up after ${CONFIG.maxRetries} attempts`);
  if (task.notify !== false) {
    await notifyFailure(task.name, `Failed after ${CONFIG.maxRetries} attempts`);
  }
  await context.close();
  process.exit(1);
}

main().catch((error) => {
  log(`FATAL ERROR: ${error.message}`);
  process.exit(1);
});

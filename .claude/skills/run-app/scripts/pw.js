#!/usr/bin/env node
// Minimal browser-driver REPL-by-CLI for AI Mercenary Manager, for use when
// `chromium-cli` isn't available in the environment. Talks to an
// already-running headless Chrome over the Chrome DevTools Protocol via
// puppeteer-core (no bundled Chromium download needed -- see SKILL.md for
// how to launch that Chrome instance).
//
// Usage: node pw.js <command> [args...]
//   goto <url>              navigate the active page
//   type <text...>          click the terminal's command textarea, type text, press Enter
//   focus-panel <index>     click the Nth .terminal-panel (0-indexed) before typing into it
//   text                    dump document.body.innerText (read panel state precisely)
//   screenshot <name>       save a PNG to ../pw-shots/<name>.png next to this script
//   wait <ms>               pause
//   eval <js-expression>    page.evaluate a JS expression, print JSON result
//
// Chrome must already be running with --remote-debugging-port=9222 (see
// SKILL.md's "Driving the UI" section for the launch command).

const path = require('path');

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch {
  // Not resolvable via normal node_modules lookup when installed globally
  // outside this project -- fall back to the known global location.
  puppeteer = require('/usr/local/lib/node_modules/puppeteer-core');
}

const CDP = 'http://127.0.0.1:9222';
const SHOT_DIR = path.join(__dirname, '..', 'pw-shots');
const APP_URL = 'http://localhost:4200';

async function getPage(browser) {
  const pages = await browser.pages();
  for (const p of pages) {
    if (p.url().includes('localhost:4200')) return p;
  }
  return pages[pages.length - 1] || (await browser.newPage());
}

async function main() {
  const [, , cmd, ...args] = process.argv;
  const browser = await puppeteer.connect({
    browserURL: CDP,
    defaultViewport: { width: 1360, height: 900 },
  });
  const page = await getPage(browser);
  page.setDefaultTimeout(15000);

  try {
    switch (cmd) {
      case 'goto': {
        await page.goto(args[0] || APP_URL, { waitUntil: 'networkidle0' });
        break;
      }
      case 'type': {
        // Targets the FIRST `textarea.command-input` in DOM order. After
        // split-v/split-h that's whichever panel appears first in the
        // layout tree, not necessarily the one last clicked -- use
        // `focus-panel` first if you need a specific one.
        const text = args.join(' ');
        const sel = 'textarea.command-input';
        await page.waitForSelector(sel);
        await page.click(sel);
        await page.type(sel, text, { delay: 8 });
        await page.keyboard.press('Enter');
        await new Promise((r) => setTimeout(r, 700));
        break;
      }
      case 'focus-panel': {
        const idx = Number(args[0] ?? 0);
        const panels = await page.$$('.terminal-panel');
        if (panels[idx]) await panels[idx].click();
        break;
      }
      case 'text': {
        const body = await page.evaluate(() => document.body.innerText);
        console.log(body);
        break;
      }
      case 'screenshot': {
        const name = args[0] || 'shot';
        const shotPath = `${SHOT_DIR}/${name}.png`;
        await page.screenshot({ path: shotPath });
        console.log(shotPath);
        break;
      }
      case 'wait': {
        await new Promise((r) => setTimeout(r, Number(args[0] || 1000)));
        break;
      }
      case 'eval': {
        const result = await page.evaluate(new Function(`return (${args.join(' ')})`));
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      default:
        console.error('Unknown command:', cmd);
        console.error('Commands: goto | type | focus-panel | text | screenshot | wait | eval');
        process.exitCode = 1;
    }
  } finally {
    browser.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

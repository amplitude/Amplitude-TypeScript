import { chromium } from '@playwright/test';
import { build } from 'vite';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const cliArgs = hideBin(process.argv);
if (cliArgs[0] === '--') cliArgs.shift();

const argv = await yargs(cliArgs)
  .scriptName('pnpm harness:exposure')
  .usage('$0 --url <client-page> [options]')
  .option('url', { type: 'string', demandOption: true, describe: 'Client page to audit' })
  .option('config', { type: 'string', describe: 'JSON file with allowlist and elementSelector settings' })
  .option('output', { type: 'string', describe: 'Path for the JSON report' })
  .option('headed', { type: 'boolean', default: false, describe: 'Show the browser while the audit runs' })
  .option('storage-state', { type: 'string', describe: 'Playwright storage state for authenticated pages' })
  .option('viewport', {
    type: 'string',
    default: '1440x900',
    describe: 'Viewport dimensions, for example 1440x900',
  })
  .option('wait-ms', { type: 'number', default: 1000, describe: 'Wait after navigation before injecting' })
  .option('scroll-containers', {
    type: 'boolean',
    default: true,
    describe: 'Exercise visible overflow containers in addition to the document',
  })
  .option('screenshot', { type: 'string', describe: 'Optional full-page screenshot path' })
  .strict()
  .help()
  .parse();

const [width, height] = argv.viewport.split('x').map(Number);
if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
  throw new Error(`Invalid --viewport "${argv.viewport}". Expected WIDTHxHEIGHT, for example 1440x900.`);
}

const config = argv.config ? JSON.parse(await fs.readFile(path.resolve(argv.config), 'utf8')) : {};
const exposureDuration = config.exposureDuration ?? 150;
const settleMs = Math.max(exposureDuration + 100, 250);
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'amplitude-exposure-audit-'));
const bundlePath = path.join(tempDir, 'browser.js');

await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    emptyOutDir: false,
    lib: {
      entry: path.resolve('packages/plugin-autocapture-browser/e2e/client-exposure-audit.browser.ts'),
      formats: ['iife'],
      name: 'AmplitudeExposureAudit',
      fileName: () => 'browser.js',
    },
    outDir: tempDir,
    minify: false,
  },
});

const browser = await chromium.launch({ headless: !argv.headed });
try {
  const context = await browser.newContext({
    bypassCSP: true,
    viewport: { width, height },
    ...(argv.storageState ? { storageState: path.resolve(argv.storageState) } : {}),
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(argv.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(argv.waitMs);
  await page.addScriptTag({ path: bundlePath });
  await page.evaluate((auditConfig) => window.AmplitudeExposureAudit.install(auditConfig), config);
  await page.waitForTimeout(settleMs);
  await page.evaluate(() => window.AmplitudeExposureAudit.snapshot('initial'));

  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    await page.evaluate((nextFraction) => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight);
      window.scrollTo({ top: maxScroll * nextFraction, behavior: 'instant' });
    }, fraction);
    await page.waitForTimeout(settleMs);
    await page.evaluate(
      (nextFraction) => window.AmplitudeExposureAudit.snapshot(`document-${Math.round(nextFraction * 100)}%`),
      fraction,
    );
  }

  if (argv.scrollContainers) {
    const containerCount = await page.evaluate(() => {
      const auditRoot = '[data-amplitude-exposure-audit]';
      const containers = Array.from(document.querySelectorAll('*'))
        .filter((element) => !element.closest(auditRoot))
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            /(auto|scroll|overlay)/.test(style.overflowY) &&
            element.scrollHeight > element.clientHeight + 1 &&
            element.getBoundingClientRect().height > 0
          );
        })
        .slice(0, 10);
      containers.forEach((element, index) => element.setAttribute('data-amplitude-audit-scroller', String(index)));
      return containers.length;
    });

    for (let index = 0; index < containerCount; index += 1) {
      await page.evaluate((containerIndex) => {
        const element = document.querySelector(`[data-amplitude-audit-scroller="${containerIndex}"]`);
        if (element) element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
      }, index);
      await page.waitForTimeout(settleMs);
      await page.evaluate(
        (containerIndex) => window.AmplitudeExposureAudit.snapshot(`overflow-container-${containerIndex}`),
        index,
      );
    }
  }

  const report = await page.evaluate(() => window.AmplitudeExposureAudit.report());
  report.pageErrors = pageErrors;

  const url = new URL(report.url);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.resolve(argv.output ?? `artifacts/client-exposure-audit/${url.hostname}-${stamp}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  if (argv.screenshot) {
    const screenshotPath = path.resolve(argv.screenshot);
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  const { summary } = report;
  console.log(`Exposure audit: ${report.title || report.url}`);
  console.log(`Report: ${outputPath}`);
  console.log(
    [
      `${summary.exposed} exposed`,
      `${summary.missingFromAllowlist} likely interactive elements missing from allowlist`,
      `${summary.nonUniqueSelectors} non-unique selectors`,
      `${summary.selectorsThatMissTarget} selectors that miss their target`,
      `${summary.unstableSelectorGroups} selector groups changed across scenarios`,
      `${summary.patternSuggestions} regex suggestions`,
    ].join('\n'),
  );

  if (report.missingFromAllowlist.length) {
    console.log('\nMissing from allowlist:');
    report.missingFromAllowlist.slice(0, 20).forEach((element) => {
      console.log(`- ${element.selector} (${element.role || element.tag}) ${JSON.stringify(element.text)}`);
    });
  }
  if (report.patternSuggestions.length) {
    console.log('\nPattern suggestions (review before adding; pattern arrays replace defaults):');
    report.patternSuggestions.forEach((suggestion) => {
      console.log(`- ${suggestion.kind}: ${suggestion.pattern} — ${suggestion.evidence.join(', ')}`);
    });
  }
} finally {
  await browser.close();
  await fs.rm(tempDir, { recursive: true, force: true });
}

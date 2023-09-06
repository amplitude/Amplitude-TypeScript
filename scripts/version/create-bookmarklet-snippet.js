const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { snippet } = require('../templates/browser-bookmarklet.template');
const { getName, getVersion } = require('../utils');
const babel = require('@babel/core');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;

// Setup input
const inputDir = 'lib/scripts';
const inputFile = argv.inputFile ?? 'amplitude-min.js';
const inputPath = path.join(process.cwd(), inputDir, inputFile);

// Setup output
const outputDir = 'generated/';
const outputFile = argv.outputFile ?? 'amplitude-bookmarklet-snippet.js';
const outputPath = path.join(process.cwd(), outputDir, outputFile);

const globalVar = argv.globalVar ?? 'amplitude';
const nameSuffix = argv.nameSuffix ?? '';

const apiKey = argv.apiKey ?? 'YOUR_API_KEY';
const userId = argv.userId ?? 'YOUR_USER_ID';
const serverZone = argv.serverZone ?? 'YOUR_SERVER_ZONE';

// Generate output contents
const header = `/**
 * Create a bookmark with this code snippet in the browser, update the apiKey, userId, and serverZone, and click the bookmark on any website to run.
 * Script will fail to load if the website has a Content Security Policy (CSP) that blocks third-party inline scripts.
 */`;
const algorithm = 'sha384';
const encoding = 'base64';
const inputText = fs.readFileSync(inputPath, 'utf-8');
const integrity = algorithm + '-' + crypto.createHash(algorithm).update(inputText).digest(encoding);
const version = getVersion() || '';
const ingestionSourceName = 'browser-typescript-bookmarklet';
const ingestionSourceVersion = '1.0.0';
const autoTrackingPluginVersion = '0.1.1';
const outputText =
  header +
  snippet(
    getName() + nameSuffix,
    integrity,
    version,
    globalVar,
    apiKey,
    userId,
    serverZone,
    ingestionSourceName,
    ingestionSourceVersion,
    autoTrackingPluginVersion,
  );
const { code: transpiledOutputText } = babel.transformSync(outputText, {
  presets: ['env'],
});

// Write to disk
fs.writeFileSync(outputPath, transpiledOutputText);
console.log(`Generated ${outputFile}`);

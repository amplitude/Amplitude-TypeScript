const {spawn} = require('child_process');
const http = require('http');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const metroStatusUrl = 'http://127.0.0.1:8081/status';
const iosBundleUrl =
  'http://127.0.0.1:8081/index.bundle?platform=ios&dev=true&minify=false';

const request = (url, timeout = 1000) =>
  new Promise((resolve, reject) => {
    const req = http.get(url, response => {
      response.resume();
      response.on('end', () =>
        resolve({
          statusCode: response.statusCode,
          projectRoot: response.headers['x-react-native-project-root'],
        }),
      );
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('Request timed out')));
  });

const waitForMetro = async () => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await request(metroStatusUrl);
      if (response.statusCode === 200) {
        return response;
      }
    } catch {
      // Metro may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Metro did not become ready on port 8081 within 30 seconds.');
};

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} exited with ${
            signal ? `signal ${signal}` : `code ${code}`
          }.`,
        ),
      );
    });
  });

const main = async () => {
  let metro;

  try {
    let status;
    try {
      status = await request(metroStatusUrl);
    } catch {
      console.log('Metro is not running; starting it for the E2E test.');
      metro = spawn(
        process.execPath,
        [require.resolve('react-native/cli.js'), 'start', '--reset-cache'],
        {cwd: projectRoot, stdio: 'inherit'},
      );
      status = await waitForMetro();
    }

    if (path.resolve(status.projectRoot ?? '') !== projectRoot) {
      throw new Error(
        `Port 8081 is serving a different React Native project: ${
          status.projectRoot ?? 'unknown'
        }`,
      );
    }

    const bundle = await request(iosBundleUrl, 120000);
    if (bundle.statusCode !== 200) {
      throw new Error(
        `Metro could not build the iOS bundle (HTTP ${bundle.statusCode}). Restart Metro with pnpm start and retry.`,
      );
    }

    await run('maestro', ['test', '.maestro/guides-and-surveys.yaml']);
  } finally {
    if (metro) {
      metro.kill('SIGTERM');
    }
  }
};

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

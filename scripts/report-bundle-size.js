const sizeLimits = require('../.size-limit.js');
const fs = require('fs');
const path = require('path');

function getBundleSizeEvent(filepath, size, filename, packageJsonPath) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const packageName = packageJson.name;
  return {
    user_id: 'sdk-bundle-size-reporter',
    event_type: 'SDK Bundle Size',
    event_properties: {
      bundle_size: size,
      bundle_path: filepath,
      filename: filename || path.basename(filepath),
      package_name: packageName,
      package_version: packageJson.version,
    },
  };
}

const events = [];
for (const limit of sizeLimits) {
  const size = fs.statSync(limit.path).size;
  events.push(getBundleSizeEvent(limit.path, size, limit.name, limit.packageJsonPath));
}

fetch('https://api.amplitude.com/2/httpapi', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    api_key: process.env.AMPLITUDE_API_KEY,
    events: events,
  }),
})
  .then((response) => {
    console.log(response.status);
    response.json().then((data) => {
      console.log(data);
      process.exit(response.status >= 400 ? 1 : 0);
    });
  })
  .catch((error) => {
    console.error('Error reporting bundle size to Amplitude:', error);
    process.exit(1);
  });

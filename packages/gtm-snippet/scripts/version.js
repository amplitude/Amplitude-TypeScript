const fs = require('fs');
const path = require('path');

console.log('[GTM Snippet Version Sync] START');

try {
  // Read current package.json
  const currentPkgPath = path.join(__dirname, '..', 'package.json');
  const currentPkg = JSON.parse(fs.readFileSync(currentPkgPath, 'utf8'));
  
  // Read analytics-browser package.json
  const analyticsPkgPath = path.join(__dirname, '..', '..', 'analytics-browser', 'package.json');
  const analyticsPkg = JSON.parse(fs.readFileSync(analyticsPkgPath, 'utf8'));
  
  console.log(`[GTM Snippet Version Sync] Current version: ${currentPkg.version}`);
  console.log(`[GTM Snippet Version Sync] Analytics browser version: ${analyticsPkg.version}`);
  
  // Update version to match analytics-browser
  currentPkg.version = analyticsPkg.version;
  
  // Write updated package.json
  fs.writeFileSync(currentPkgPath, JSON.stringify(currentPkg, null, 2) + '\n');
  
  console.log(`[GTM Snippet Version Sync] Updated gtm-snippet version to: ${analyticsPkg.version}`);
  console.log('[GTM Snippet Version Sync] SUCCESS');
} catch (error) {
  console.error('[GTM Snippet Version Sync] ERROR:', error.message);
  process.exit(1);
}

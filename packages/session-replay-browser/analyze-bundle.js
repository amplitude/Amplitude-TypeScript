#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the main session replay file
const sessionReplayPath = path.join(__dirname, 'src', 'session-replay.ts');
const sessionReplayContent = fs.readFileSync(sessionReplayPath, 'utf8');

// Parse imports from the file
function parseImports(content) {
  const importRegex = /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
  const imports = [];
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    imports.push({
      importStatement: match[0],
      module: match[1],
      isExternal: !match[1].startsWith('.') && !match[1].startsWith('/'),
      isAmplitude: match[1].includes('@amplitude'),
      isRRWeb: match[1].includes('rrweb'),
    });
  }
  
  return imports;
}

// Get file sizes
function getFileSizes() {
  const sizes = {};
  const paths = [
    'lib/scripts/session-replay-browser-min.js',
    'lib/scripts/session-replay-browser-min.js.gz',
    'lib/scripts/session-replay-browser-esm.js',
    'lib/scripts/session-replay-browser-esm.js.gz',
    'lib/scripts/console-plugin-min.js',
    'lib/scripts/console-plugin-min.js.gz',
    'lib/analysis/session-replay-browser-analysis.js'
  ];

  paths.forEach(p => {
    const fullPath = path.join(__dirname, p);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      sizes[p] = {
        bytes: stats.size,
        kb: Math.round(stats.size / 1024 * 100) / 100,
        mb: Math.round(stats.size / 1024 / 1024 * 100) / 100
      };
    } else {
      sizes[p] = { error: 'File not found' };
    }
  });

  return sizes;
}

// Read package.json to get dependencies
function getDependencies() {
  const packagePath = path.join(__dirname, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  return {
    dependencies: packageJson.dependencies || {},
    devDependencies: packageJson.devDependencies || {}
  };
}

// Analyze dependencies by category
function categorizeDependencies(deps) {
  const categories = {
    amplitude: {},
    rrweb: {},
    build: {},
    utility: {},
    other: {}
  };

  Object.entries(deps).forEach(([name, version]) => {
    if (name.includes('@amplitude')) {
      categories.amplitude[name] = version;
    } else if (name.includes('rrweb')) {
      categories.rrweb[name] = version;
    } else if (name.includes('rollup') || name.includes('babel') || name.includes('typescript')) {
      categories.build[name] = version;
    } else if (['tslib', 'idb'].includes(name)) {
      categories.utility[name] = version;
    } else {
      categories.other[name] = version;
    }
  });

  return categories;
}

// Main analysis function
function generateBundleAnalysis() {
  console.log('🔍 Session Replay Browser Bundle Analysis');
  console.log('=========================================\n');

  // File size analysis
  console.log('📦 Bundle Sizes:');
  console.log('================');
  const sizes = getFileSizes();
  
  Object.entries(sizes).forEach(([file, size]) => {
    if (size.error) {
      console.log(`❌ ${file}: ${size.error}`);
    } else {
      console.log(`📄 ${file}:`);
      console.log(`   Size: ${size.kb} KB (${size.bytes.toLocaleString()} bytes)`);
      if (size.mb > 0.1) {
        console.log(`   Size: ${size.mb} MB`);
      }
    }
  });

  // Compare main bundles
  const mainJS = sizes['lib/scripts/session-replay-browser-min.js'];
  const mainGZ = sizes['lib/scripts/session-replay-browser-min.js.gz'];
  const esmJS = sizes['lib/scripts/session-replay-browser-esm.js'];
  const esmGZ = sizes['lib/scripts/session-replay-browser-esm.js.gz'];

  console.log('\n📊 Bundle Comparison:');
  console.log('====================');
  if (mainJS && !mainJS.error && mainGZ && !mainGZ.error) {
    const compressionRatio = Math.round((1 - mainGZ.bytes / mainJS.bytes) * 100);
    console.log(`🗜️  IIFE Bundle: ${mainJS.kb} KB → ${mainGZ.kb} KB (${compressionRatio}% compression)`);
  }
  
  if (esmJS && !esmJS.error && esmGZ && !esmGZ.error) {
    const compressionRatio = Math.round((1 - esmGZ.bytes / esmJS.bytes) * 100);
    console.log(`📦 ESM Bundle: ${esmJS.kb} KB → ${esmGZ.kb} KB (${compressionRatio}% compression)`);
  }

  // Import analysis
  console.log('\n📥 Import Analysis:');
  console.log('==================');
  const imports = parseImports(sessionReplayContent);
  
  const importCategories = {
    amplitude: imports.filter(i => i.isAmplitude),
    rrweb: imports.filter(i => i.isRRWeb),
    external: imports.filter(i => i.isExternal && !i.isAmplitude && !i.isRRWeb),
    internal: imports.filter(i => !i.isExternal)
  };

  console.log(`📊 Total imports: ${imports.length}`);
  console.log(`🏢 Amplitude packages: ${importCategories.amplitude.length}`);
  console.log(`🎥 RRWeb packages: ${importCategories.rrweb.length}`);  
  console.log(`📦 Other external: ${importCategories.external.length}`);
  console.log(`🏠 Internal modules: ${importCategories.internal.length}`);

  console.log('\n🏢 Amplitude Dependencies:');
  importCategories.amplitude.forEach(imp => {
    console.log(`   • ${imp.module}`);
  });

  console.log('\n🎥 RRWeb Dependencies:');
  importCategories.rrweb.forEach(imp => {
    console.log(`   • ${imp.module}`);
  });

  console.log('\n📦 Other External Dependencies:');
  importCategories.external.forEach(imp => {
    console.log(`   • ${imp.module}`);
  });

  // Dependency analysis
  console.log('\n🔗 Package Dependencies:');
  console.log('=======================');
  const { dependencies, devDependencies } = getDependencies();
  const allDeps = { ...dependencies, ...devDependencies };
  const categorized = categorizeDependencies(allDeps);

  console.log(`\n🏢 Amplitude Packages (${Object.keys(categorized.amplitude).length}):`);
  Object.entries(categorized.amplitude).forEach(([name, version]) => {
    console.log(`   • ${name}: ${version}`);
  });

  console.log(`\n🎥 RRWeb Packages (${Object.keys(categorized.rrweb).length}):`);
  Object.entries(categorized.rrweb).forEach(([name, version]) => {
    console.log(`   • ${name}: ${version}`);
  });

  console.log(`\n🛠️  Build Tools (${Object.keys(categorized.build).length}):`);
  Object.entries(categorized.build).forEach(([name, version]) => {
    console.log(`   • ${name}: ${version}`);
  });

  console.log(`\n🔧 Utility Libraries (${Object.keys(categorized.utility).length}):`);
  Object.entries(categorized.utility).forEach(([name, version]) => {
    console.log(`   • ${name}: ${version}`);
  });

  // Recommendations
  console.log('\n💡 Bundle Optimization Recommendations:');
  console.log('======================================');
  
  if (mainJS && !mainJS.error) {
    if (mainJS.kb > 300) {
      console.log('⚠️  Large bundle size detected (>300KB). Consider:');
      console.log('   • Code splitting for optional features');
      console.log('   • Lazy loading of plugins');
      console.log('   • Tree shaking optimization');
    }
    
    if (mainJS.kb > 200) {
      console.log('📊 Bundle size is substantial. Monitor:');
      console.log('   • Individual dependency contributions');
      console.log('   • Unused exports');
      console.log('   • Polyfill requirements');
    }
  }

  console.log('\n📈 Performance Considerations:');
  console.log('   • RRWeb recording has inherent overhead');
  console.log('   • Consider CSP-compatible builds');
  console.log('   • Monitor runtime memory usage');
  console.log('   • Evaluate chunk loading strategies');

  console.log('\n✅ Analysis Complete!');
  console.log('📄 Detailed visualizations available in:');
  console.log('   • lib/analysis/bundle-analysis.html');
  console.log('   • lib/analysis/bundle-stats.json');
}

// Run the analysis
generateBundleAnalysis(); 
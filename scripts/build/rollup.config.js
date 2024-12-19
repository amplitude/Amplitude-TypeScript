import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';
import gzip from 'rollup-plugin-gzip';
import execute from 'rollup-plugin-execute';
import { exec } from 'child_process';
import fs from 'fs';

// The paths are relative to process.cwd(), which are packages/*
const base = '../..';

const createSnippet = () => {
  return {
    name: 'amplitude-snippet',
    options: (opt) => {
      return new Promise((resolve) => {
        opt.input = 'generated/amplitude-snippet.js';
        if (process.env.GENERATE_SNIPPET !== 'true') return resolve(opt);
        exec(`node ${base}/scripts/version/create-snippet.js`, (err) => {
          if (err) {
            throw err;
          }
          resolve(opt);
        });
      });
    },
  };
};

export const umd = {
  input: 'src/index.ts',
  output: {
    name: 'amplitude',
    file: 'lib/scripts/amplitude-min.umd.js',
    format: 'umd',
  },
  plugins: [
    typescript({
      module: 'es6',
      noEmit: false,
      outDir: 'lib/umd',
      rootDir: 'src',
    }),
    resolve({
      browser: true,
    }),
    commonjs(),
    terser({
      output: {
        comments: false,
      },
    }),
    gzip(),
  ],
};



const updateLibPrefix = () => {
  return {
    name: 'update-lib-prefix',
    buildStart() {
      const path = 'src/lib-prefix.ts'
      if (!fs.existsSync(path)) {
        // Supported in rollup 4, we're currently rollup 2
        // this.error(`File not found: ${path}`);
        return;
      }

      let content = fs.readFileSync(path, 'utf-8');
      const updatedContent = content.replace(/amplitude-ts/g, 'amplitude-ts-sdk-script');
      fs.writeFileSync(path, updatedContent, 'utf-8');
      // this.info(`File updated: ${path}`);
    },
  };
}

const undoLibPrefix = () => {
  return {
    name: 'undo-lib-prefix',
    buildEnd() {
      const path = 'src/lib-prefix.ts'
      if (!fs.existsSync(path)) {
        // Supported in rollup 4, we're currently rollup 2
        // this.error(`File not found: ${path}`);
        return;
      }

      let content = fs.readFileSync(path, 'utf-8');
      const updatedContent = content.replace(/amplitude-ts-sdk-script/g, 'amplitude-ts');
      fs.writeFileSync(path, updatedContent, 'utf-8');
      // this.info(`File updated: ${path}`);
    },
  };
}

export const iife = {
  input: 'src/snippet-index.ts',
  output: {
    name: 'amplitude',
    file: 'lib/scripts/amplitude-min.js',
    format: 'iife',
    sourcemap: true,
  },
  plugins: [
    updateLibPrefix(),
    typescript({
      module: 'es6',
      noEmit: false,
      outDir: 'lib/script',
      rootDir: 'src',
    }),
    resolve({
      browser: true,
    }),
    commonjs(),
    terser({
      output: {
        comments: false,
      },
    }),
    gzip(),
    undoLibPrefix(),
  ],
};

export const snippet = {
  output: {
    name: 'amplitude',
    file: 'lib/scripts/amplitude-snippet-min.js',
    format: 'iife',
  },
  plugins: [
    createSnippet(),
    terser(),
    execute(
      `node ${base}/scripts/version/create-snippet-instructions.js && node ${base}/scripts/version/update-readme.js`,
    ),
  ],
};

const createGTMSnippet = () => {
  return {
    name: 'amplitude-gtm-snippet',
    options: (opt) => {
      return new Promise((resolve) => {
        opt.input = 'generated/amplitude-gtm-snippet.js';
        if (process.env.GENERATE_SNIPPET !== 'true') return resolve(opt);
        exec(
          `node ${base}/scripts/version/create-snippet.js --inputFile=amplitude-gtm-min.js --outputFile=amplitude-gtm-snippet.js --globalVar=amplitudeGTM --nameSuffix=-gtm`,
          (err) => {
            if (err) {
              throw err;
            }
            resolve(opt);
          },
        );
      });
    },
  };
};

export const iifeGTM = {
  input: 'src/gtm-snippet-index.ts',
  output: {
    name: 'amplitudeGTM',
    file: 'lib/scripts/amplitude-gtm-min.js',
    format: 'iife',
    sourcemap: true,
  },
  plugins: [
    typescript({
      module: 'es6',
      noEmit: false,
      outDir: 'lib/script',
      rootDir: 'src',
    }),
    resolve({
      browser: true,
    }),
    commonjs(),
    terser({
      output: {
        comments: false,
      },
    }),
    gzip(),
  ],
};

export const snippetGTM = {
  output: {
    name: 'amplitudeGTM', // the name of the window variable
    file: 'lib/scripts/amplitude-gtm-snippet-min.js',
    format: 'iife',
  },
  plugins: [createGTMSnippet(), terser()],
};

// Input: bookmarklet js template + amplitude js
// Output: bookmarklet js snippet
const createBookmarkletSnippet = () => {
  return {
    name: 'amplitude-bookmarklet-snippet',
    options: (opt) => {
      return new Promise((resolve) => {
        opt.input = 'generated/amplitude-bookmarklet-snippet.js';
        if (process.env.GENERATE_SNIPPET !== 'true') return resolve(opt);
        exec(`node ${base}/scripts/version/create-bookmarklet-snippet.js`, (err) => {
          if (err) {
            throw err;
          }
          resolve(opt);
        });
      });
    },
  };
};

// Input: bookmarklet js snippet
// Output: bookmarklet prefix + bookmarklet js snippet (url encoded)
export const bookmarklet = {
  output: {
    name: 'amplitude',
    file: 'lib/scripts/amplitude-bookmarklet-snippet-min.js',
    format: 'iife',
  },
  plugins: [createBookmarkletSnippet(), terser(), execute(`node ${base}/scripts/version/create-bookmarklet.js`)],
};

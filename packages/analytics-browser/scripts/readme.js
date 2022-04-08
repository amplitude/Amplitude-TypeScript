const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const instructionsFileName = path.join(cwd, 'lib/scripts/amplitude-snippet-instructions.js');
const instructionsContent = fs.readFileSync(instructionsFileName, 'utf-8');

const readmeFileName = path.join(cwd, 'README.md');
const readmeContent = fs.readFileSync(readmeFileName, 'utf-8');

const regexpPattern = /(<!-- README_SNIPPET_BLOCK -->)((?:.|\n)*)(<!-- \/ OF README_SNIPPET_BLOCK -->)/m;
const newReadmeContent = readmeContent.replace(regexpPattern, '$1\n```html\n' + instructionsContent + '```\n$3');

fs.writeFileSync(readmeFileName, newReadmeContent);

console.log('Updated README.md');

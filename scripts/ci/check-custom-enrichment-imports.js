const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const core = '@amplitude/analytics-core';
const isCore = (node) =>
  node && ts.isStringLiteralLike(node) && (node.text === core || node.text.startsWith(`${core}/`));

function checkSource(source, filename = 'source.ts') {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const violations = [];
  const report = (node) => {
    const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
    violations.push(`${filename}:${line + 1}:${character + 1}`);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && isCore(node.moduleSpecifier)) {
      const clause = node.importClause;
      const names = clause && clause.namedBindings;
      const typeOnly =
        clause &&
        (clause.isTypeOnly ||
          (!clause.name &&
            names &&
            ts.isNamedImports(names) &&
            names.elements.length > 0 &&
            names.elements.every((item) => item.isTypeOnly)));
      if (!typeOnly) report(node);
    } else if (ts.isExportDeclaration(node) && isCore(node.moduleSpecifier)) {
      const names = node.exportClause;
      const typeOnly =
        node.isTypeOnly ||
        (names &&
          ts.isNamedExports(names) &&
          names.elements.length > 0 &&
          names.elements.every((item) => item.isTypeOnly));
      if (!typeOnly) report(node);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      isCore(node.moduleReference.expression) &&
      !node.isTypeOnly
    ) {
      report(node);
    } else if (
      ts.isCallExpression(node) &&
      isCore(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      report(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return violations;
}

function checkDirectory(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return checkDirectory(filename);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? checkSource(fs.readFileSync(filename, 'utf8'), filename) : [];
  });
}

if (require.main === module) {
  const violations = checkDirectory(path.resolve(__dirname, '../../packages/plugin-custom-enrichment-browser/src'));
  if (violations.length) {
    console.error('Custom enrichment must use explicit type-only imports/exports from analytics-core.');
    console.error('Runtime imports require a deliberate bundle-impact review before changing this guard.');
    console.error(violations.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Custom enrichment uses only type imports from analytics-core.');
  }
}

module.exports = { checkSource, checkDirectory };

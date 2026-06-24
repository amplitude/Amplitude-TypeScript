// Declaration-level public-API surface extractor (SDKRN-14).
//
// This is the engine behind the `public-api.test.ts` compatibility guard. It
// builds a TypeScript `Program` from the package's public entrypoint and uses
// the type checker to resolve the shape of every exported symbol — exactly
// what a consumer importing the package's emitted `.d.ts` would see. The
// result is serialized deterministically so it can be diffed against a
// committed golden report (`public-api.api.md`).
//
// Why resolve via the checker instead of snapshotting the emitted `index.d.ts`
// text directly? The plugin's entrypoint is a thin re-export of the standalone
// package, so its emitted declarations are just `export ... from '...'`
// statements. Those statements do NOT change when a *field* is removed from a
// re-exported type in the standalone — but that removal still breaks the
// plugin's public consumers. Resolving the type shape via the checker catches
// it.
//
// Design choices that keep the report stable and reviewable:
//   - Each export is expanded ONE level (interface/type members, public class
//     members). Nested public types (e.g. `PrivacyConfig`, `MaskLevel`) are
//     themselves top-level exports, so they get their own expanded entry and a
//     change there is still caught — no fragile deep recursion needed.
//   - `private`/`protected` class members are excluded (not public API).
//   - Machine-specific `import("/abs/path/to/pkg").Name` is normalized to
//     `Name`, so the golden is portable across machines and pnpm layouts.

import * as path from 'path';
// `typescript` is the repo-wide pinned compiler (root devDependency); this
// test-only helper uses its public Compiler API to resolve the package's type
// surface. It is not a runtime dependency of the published package, so the
// extraneous-dependencies rule (which only exempts `*.test.ts`, not test
// utils) is disabled for this single import.
// eslint-disable-next-line import/no-extraneous-dependencies
import * as ts from 'typescript';

export interface ExtractOptions {
  /** Absolute path to the package public entrypoint (e.g. `src/index.tsx`). */
  entrypoint: string;
  /**
   * Module-specifier → absolute-path overrides so the program can resolve
   * workspace packages from source without a prior build (mirrors the jest
   * `moduleNameMapper`).
   */
  paths?: Record<string, string>;
  /** Directory used as `baseUrl` for `paths` resolution. Defaults to the entrypoint dir. */
  baseUrl?: string;
}

const KIND_LABELS: Array<[ts.SymbolFlags, string]> = [
  [ts.SymbolFlags.Class, 'class'],
  [ts.SymbolFlags.Interface, 'interface'],
  [ts.SymbolFlags.TypeAlias, 'type'],
  [ts.SymbolFlags.RegularEnum, 'enum'],
  [ts.SymbolFlags.ConstEnum, 'const enum'],
  [ts.SymbolFlags.Function, 'function'],
  [ts.SymbolFlags.Variable, 'const'],
  [ts.SymbolFlags.Module, 'namespace'],
];

function classifyKind(flags: ts.SymbolFlags): string {
  for (const [flag, label] of KIND_LABELS) {
    if (flags & flag) {
      return label;
    }
  }
  return 'unknown';
}

function describeMeaning(flags: ts.SymbolFlags): string {
  const hasValue = (flags & ts.SymbolFlags.Value) !== 0;
  const hasType = (flags & ts.SymbolFlags.Type) !== 0;
  if (hasValue && hasType) {
    return 'value+type';
  }
  return hasValue ? 'value' : 'type';
}

export function extractPublicApiSurface(options: ExtractOptions): string {
  const entrypoint = path.resolve(options.entrypoint);
  const baseUrl = options.baseUrl ? path.resolve(options.baseUrl) : path.dirname(entrypoint);

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2019,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
    skipLibCheck: true,
    strict: true,
    forceConsistentCasingInFileNames: true,
    baseUrl,
    paths: options.paths
      ? Object.fromEntries(Object.entries(options.paths).map(([key, value]) => [key, [path.resolve(value)]]))
      : undefined,
    lib: ['lib.es2019.d.ts', 'lib.dom.d.ts'],
    noEmit: true,
  };

  const program = ts.createProgram([entrypoint], compilerOptions);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entrypoint);
  if (!sourceFile) {
    throw new Error(`Could not load entrypoint source file: ${entrypoint}`);
  }
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    throw new Error(`Entrypoint has no module symbol (no exports?): ${entrypoint}`);
  }

  const exportSymbols = [...checker.getExportsOfModule(moduleSymbol)].sort((a, b) =>
    a.getName().localeCompare(b.getName()),
  );

  const lines: string[] = [];
  for (const exported of exportSymbols) {
    const exportName = exported.getName();
    const resolved = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const kind = classifyKind(resolved.flags);
    const meaning = describeMeaning(resolved.flags);

    lines.push(`export ${kind} ${exportName}  // [${meaning}]`);
    for (const shapeLine of describeExport(checker, resolved)) {
      lines.push(`  ${shapeLine}`);
    }
    lines.push('');
  }

  const header = [
    '# Public API surface — @amplitude/plugin-session-replay-react-native',
    '#',
    '# AUTO-GENERATED golden report. Do NOT edit by hand.',
    '# Regenerate intentionally with:',
    '#   UPDATE_PUBLIC_API=1 pnpm --filter @amplitude/plugin-session-replay-react-native test',
    '#',
    '# This file is the reviewable record of the package PUBLIC API as resolved',
    '# from its type declarations. A diff here means the public surface changed',
    '# and a conscious decision (+ semver bump) is required. Resolved with the',
    `# repo-pinned TypeScript (${ts.version}).`,
    '',
  ].join('\n');

  return `${header}\n${lines.join('\n')}\n`;
}

function describeExport(checker: ts.TypeChecker, symbol: ts.Symbol): string[] {
  // Class: constructor signature(s) + public instance members only.
  if (symbol.flags & ts.SymbolFlags.Class) {
    const instanceType = checker.getDeclaredTypeOfSymbol(symbol);
    const out: string[] = [];

    const ctorDecl = symbol.declarations?.[0];
    if (ctorDecl) {
      const staticType = checker.getTypeOfSymbolAtLocation(symbol, ctorDecl);
      for (const sig of staticType.getConstructSignatures()) {
        out.push(`constructor${signatureToString(checker, sig)}`);
      }
    }
    out.push(...describeMembers(checker, instanceType, { publicOnly: true }));
    return out;
  }

  // Interface / type alias: expand declared type one level.
  if (symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) {
    return describeTypeEntry(checker, checker.getDeclaredTypeOfSymbol(symbol));
  }

  // Value (const/function/enum): describe its value type one level.
  const valueDecl = symbol.declarations?.[0];
  if (valueDecl) {
    return describeTypeEntry(checker, checker.getTypeOfSymbolAtLocation(symbol, valueDecl));
  }
  return [];
}

/** Expand an object type to its members; otherwise render a single normalized line. */
function describeTypeEntry(checker: ts.TypeChecker, type: ts.Type): string[] {
  // String-literal (and other) unions like `MaskLevel` expand to their sorted
  // members so a changed member set is caught. `typeToString` would otherwise
  // collapse them to the alias name.
  if (type.isUnion()) {
    const members = type.types
      .map((member) => normalizeTypeText(checker.typeToString(member, undefined, ts.TypeFormatFlags.NoTruncation)))
      .sort();
    return [members.join(' | ')];
  }
  // Only true object types are expanded into members; intrinsics (string,
  // number, …) render as one normalized line.
  const isObject = (type.flags & ts.TypeFlags.Object) !== 0;
  if (isObject && type.getProperties().length > 0) {
    return describeMembers(checker, type, { publicOnly: false });
  }
  return [normalizeTypeText(checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation))];
}

function describeMembers(checker: ts.TypeChecker, type: ts.Type, opts: { publicOnly: boolean }): string[] {
  const members = [...type.getProperties()].sort((a, b) => a.getName().localeCompare(b.getName()));
  const out: string[] = [];

  for (const prop of members) {
    const decl = prop.declarations?.[0];
    if (opts.publicOnly && decl && isNonPublicMember(decl)) {
      continue;
    }
    const name = prop.getName();
    // Skip synthetic/internal symbols (e.g. computed `[Symbol.iterator]`).
    if (name.startsWith('__@')) {
      continue;
    }
    const optional = (prop.flags & ts.SymbolFlags.Optional) !== 0 ? '?' : '';
    const propType = decl ? checker.getTypeOfSymbolAtLocation(prop, decl) : checker.getDeclaredTypeOfSymbol(prop);
    out.push(
      `${name}${optional}: ${normalizeTypeText(
        checker.typeToString(propType, undefined, ts.TypeFormatFlags.NoTruncation),
      )}`,
    );
  }
  return out;
}

function isNonPublicMember(decl: ts.Declaration): boolean {
  const flags = ts.getCombinedModifierFlags(decl);
  return (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) !== 0;
}

function signatureToString(checker: ts.TypeChecker, signature: ts.Signature): string {
  // `signatureToString` already yields `(params): ReturnType`, so callers can
  // prefix `constructor` directly.
  return normalizeTypeText(checker.signatureToString(signature, undefined, ts.TypeFormatFlags.NoTruncation));
}

/**
 * Normalize machine-specific `import("/abs/path/to/pkg").Name` references down
 * to their trailing qualified name so the golden report is portable.
 */
function normalizeTypeText(text: string): string {
  return text.replace(/import\("[^"]*"\)\./g, '');
}

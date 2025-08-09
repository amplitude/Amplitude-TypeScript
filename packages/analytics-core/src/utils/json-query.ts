type Json = Record<string, any>;

/**
 * Prune a JSON object to only include the keys in the allowlist and exclude the keys
 * in the exclude list.
 *
 * This function is a mutative function that will modify the original JSON object.
 * This is done to avoid creating a new JSON object and copying the data.
 *
 * @param json - The JSON object to prune.
 * @param allowlist - The keys to include in the pruned JSON object.
 * @param excludelist - The keys to exclude from the pruned JSON object.
 */
export function pruneJson(json: Json | null, allowlist: string[], excludelist: string[]) {
  if (!json) return;
  // tokenize the allowlist and excludelist
  const allowlistTokens = allowlist.map(tokenizeJsonPath);
  const excludelistTokens = excludelist.map(tokenizeJsonPath);

  _pruneJson({
    json,
    allowlist: allowlistTokens,
    excludelist: excludelistTokens,
    ancestors: [],
  });
}

export function _pruneJson({
  json,
  targetObject,
  allowlist,
  excludelist,
  ancestors,
  parentObject,
  targetKey,
}: {
  json: Json;
  targetObject?: Json;
  allowlist: string[][];
  excludelist: string[][];
  ancestors: string[];
  parentObject?: Json;
  targetKey?: string;
}) {
  if (!targetObject) {
    targetObject = json;
  }

  const keys = Object.keys(targetObject);
  for (const key of keys) {
    const path = [...ancestors, key];
    if (isJsonPrimitive(targetObject[key] as Json)) {
      // if the value does not match allowlist or matches exclude list, delete it
      if (!isPathMatchList(path, allowlist) || isPathMatchList(path, excludelist)) {
        delete targetObject[key];
      }
    } else {
      _pruneJson({
        json,
        targetObject: targetObject[key] as Json,
        allowlist,
        excludelist,
        ancestors: path,
        parentObject: targetObject,
        targetKey: key,
      });
    }
  }

  // if this object is empty now, clean it up
  if (Object.keys(targetObject).length === 0 && parentObject && targetKey) {
    delete parentObject[targetKey];
  }
}

function isJsonPrimitive(json?: Json): boolean {
  return typeof json === 'string' || typeof json === 'number' || typeof json === 'boolean' || json === null;
}

function isPathMatchList(path: string[], list: string[][]): boolean {
  return list.some((l) => isPathMatch(path, l));
}

/**
 * Tokenize a JSON path
 *
 * e.g.) turns string "a/b/c" into ["a", "b", "c"]
 *
 * @param path - The JSON path to tokenize.
 * @returns The tokenized JSON path.
 */
export function tokenizeJsonPath(path: string): string[] {
  const out = path.split('/');

  if (path.includes('~')) {
    return out.map((token) => token.replace(/~0/g, '~').replace(/~1/g, '/'));
  }

  return out;
}

/**
 * Check if a JSON path matches a path matcher.
 *
 * @param path - The path to check.
 * @param pathMatcher - The path matcher to check against.
 * @param i - The current index of the path.
 * @param j - The current index of the path matcher.
 * @returns True if the path matches the path matcher, false otherwise.
 */
export function isPathMatch(path: string[], pathMatcher: string[], i = 0, j = 0): boolean {
  if (j === pathMatcher.length) {
    return i === path.length;
  }

  if (i === path.length) {
    while (j < pathMatcher.length && pathMatcher[j] === '**') {
      j++;
    }
    return j === pathMatcher.length;
  }

  const currentMatcher = pathMatcher[j];

  if (currentMatcher === '**') {
    if (j + 1 === pathMatcher.length) {
      return true;
    }
    for (let k = i; k <= path.length; k++) {
      if (isPathMatch(path, pathMatcher, k, j + 1)) {
        return true;
      }
    }
    return false;
  } else if (currentMatcher === '*' || currentMatcher === path[i]) {
    return isPathMatch(path, pathMatcher, i + 1, j + 1);
  } else {
    return false;
  }
}

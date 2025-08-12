type Json = Record<string, any>;

function isJsonPrimitive(json?: Json): boolean {
  return typeof json === 'string' || typeof json === 'number' || typeof json === 'boolean' || json === null;
}

/**
 * Prune a JSON object to only include the keys in the allowlist and excludes the keys
 * in the exclude list.
 *
 * This function is a mutative function that will modify the original JSON object.
 * This is done to avoid creating a new JSON object and copying the data.
 *
 * @param json - The JSON object to prune.
 * @param allowlist - The keys to include in the pruned JSON object.
 * @param excludelist - The keys to exclude from the pruned JSON object.
 */
export function pruneJson(json: Json | null | undefined, allowlist: string[], excludelist: string[]) {
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
      if (!hasPathMatchInList(path, allowlist) || hasPathMatchInList(path, excludelist)) {
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

  // if this object is empty now, delete the whole object
  if (Object.keys(targetObject).length === 0 && parentObject && targetKey) {
    delete parentObject[targetKey];
  }
}

/**
 * Tokenize a JSON path string into an array of strings.
 * Escapes ~0 and ~1 to ~ and / respectively.
 *
 * e.g.) turns string "a/b/c" into ["a", "b", "c"]
 *
 * @param path - The JSON path to tokenize.
 * @returns The tokenized JSON path.
 */
export function tokenizeJsonPath(path: string): string[] {
  return path.split('/').map((token) => token.replace(/~0/g, '~').replace(/~1/g, '/'));
}

/**
 * Check if a JSON path matches a path matcher.
 *
 * Rules:
 * 1. If a key in a path and a matcher are the same, then they match, move to the next
 * 2. If the matcher is a *, then it matches the key, move to the next
 * 3. If the matcher is a **, then it matches >=0 keys
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

/**
 * Check if a JSON path matches any of the path matchers in the allow or exclude list.
 *
 * @param path - The JSON path to check.
 * @param allowOrExcludeList - The allow or exclude list to check against.
 * @returns True if the path matches any of the path matchers in the allow or exclude list, false otherwise.
 */
function hasPathMatchInList(path: string[], allowOrExcludeList: string[][]): boolean {
  return allowOrExcludeList.some((l) => isPathMatch(path, l));
}

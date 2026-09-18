const globRegexCache = new Map<string, RegExp>();

export const globToRegex = (glob: string): RegExp => {
  const cached = globRegexCache.get(glob);
  if (cached) return cached;

  // Glob → regex conversion. Glob substitution must happen BEFORE regex escaping so that
  // the escaper does not corrupt the glob characters (e.g. turning `/**` into `/\*\*`).
  // Placeholder tokens use null bytes, which are illegal in HTTP URLs and therefore can
  // never collide with real pattern content.
  //
  // Substitution order (most-specific first):
  //   trailing /**   → (/.*)?          — path with or without a trailing slash/subpath
  //   middle  /**/   → /(.*\/)?        — zero-or-more path segments (including zero)
  //   bare    **     → .*              — graceful fallback for ** not adjacent to /
  //   single  *      → .*              — any characters (preserves existing behaviour)
  //   ?              → .               — single character wildcard
  const T_TRAILING = '\x00TRAIL\x00';
  const T_MIDDLE = '\x00MID\x00';
  const T_DSTAR = '\x00DS\x00';
  const T_STAR = '\x00ST\x00';
  const T_QUEST = '\x00QU\x00';

  let s = glob;
  s = s.replace(/\/\*\*$/, T_TRAILING); // trailing /**
  s = s.replace(/\/\*\*\//g, T_MIDDLE); // /**/ in the middle
  s = s.replace(/\*\*/g, T_DSTAR); // bare ** (e.g. **.example.com)
  s = s.replace(/\*/g, T_STAR); // single *
  s = s.replace(/\?/g, T_QUEST); // ?

  // Escape all remaining regex special characters.
  s = s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Expand tokens into their regex equivalents.
  // Use split/join (not regex) to avoid the no-control-regex lint rule on the token strings.
  s = s.split(T_TRAILING).join('(/.*)?'); // /** → optional /anything
  s = s.split(T_MIDDLE).join('/(.*\\/)?'); // /**/ → /zero-or-more-segments/
  s = s.split(T_DSTAR).join('.*'); // bare ** → .*
  s = s.split(T_STAR).join('.*'); // * → .*
  s = s.split(T_QUEST).join('.'); // ? → .

  const regex = new RegExp(`^${s}$`);
  globRegexCache.set(glob, regex);
  return regex;
};

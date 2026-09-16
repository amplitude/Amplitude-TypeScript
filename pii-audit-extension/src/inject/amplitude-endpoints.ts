export function isIngestUrl(url: string): boolean {
  return /amplitude\.com\/(2\/httpapi|batch)\b/.test(url);
}

export function isRemoteConfigUrl(url: string): boolean {
  return /amplitude\.com\/config\b/.test(url) || /sr-client-cfg\.amplitude\.com/.test(url);
}

export function extractEvents(body: string): any[] {
  try {
    const j = JSON.parse(body);
    if (Array.isArray(j?.events)) return j.events;
    if (Array.isArray(j)) return j;
    return [];
  } catch {
    return [];
  }
}

// These lines will be changed at compile time.
const replace: Record<string, string> = {};
// These next lines are going to be ridiculously hard to cover in unit tests, ignoring.
/* istanbul ignore next */
export const compressionScript = replace.COMPRESSION_WEBWORKER_BODY;
/* istanbul ignore next */
export const trackDestinationScript = replace.TRACK_DESTINATION_WEBWORKER_BODY;

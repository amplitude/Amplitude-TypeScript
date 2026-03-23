// These two lines will be changed at compile time.
const replace: Record<string, string> = {};
// This next line is going to be ridiculously hard to cover in unit tests, ignoring.
/* istanbul ignore next */
export const compressionScript = replace.COMPRESSION_WEBWORKER_BODY;
/* istanbul ignore next */
export const msgpackGzipScript = replace.MSGPACK_GZIP_WEBWORKER_BODY;

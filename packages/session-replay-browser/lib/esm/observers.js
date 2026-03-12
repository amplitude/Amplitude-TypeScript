import { __awaiter, __generator } from "tslib";
import { getGlobalScope } from '@amplitude/analytics-core';
var DEFAULT_MAX_BODY_SIZE_BYTES = 10240; // 10KB
var BINARY_CONTENT_TYPE_PREFIXES = ['image/', 'audio/', 'video/', 'application/octet-stream', 'font/'];
function isBinaryContentType(contentType) {
    if (!contentType)
        return false;
    return BINARY_CONTENT_TYPE_PREFIXES.some(function (prefix) { return contentType.toLowerCase().startsWith(prefix); });
}
function serializeRequestBody(body) {
    if (body === null || body === undefined)
        return undefined;
    if (typeof body === 'string')
        return body;
    if (body instanceof URLSearchParams)
        return body.toString();
    if (body instanceof FormData) {
        var parts_1 = [];
        body.forEach(function (value, key) {
            parts_1.push("".concat(key, "=").concat(typeof value === 'string' ? value : '[File]'));
        });
        return parts_1.join('&');
    }
    // Blob, ArrayBuffer, ArrayBufferView, ReadableStream — skip
    return undefined;
}
function truncateToByteLimit(str, maxBytes) {
    if (new Blob([str]).size <= maxBytes) {
        return { value: str, truncated: false };
    }
    // Binary search for the longest prefix whose UTF-8 byte length fits within maxBytes
    var lo = 0;
    var hi = str.length;
    while (lo < hi) {
        var mid = Math.ceil((lo + hi) / 2);
        if (new Blob([str.slice(0, mid)]).size <= maxBytes) {
            lo = mid;
        }
        else {
            hi = mid - 1;
        }
    }
    // Avoid splitting a surrogate pair: if lo landed after a high surrogate, back up one position
    if (lo > 0 && str.charCodeAt(lo - 1) >= 0xd800 && str.charCodeAt(lo - 1) <= 0xdbff) {
        lo -= 1;
    }
    return { value: str.slice(0, lo), truncated: true };
}
var NetworkObservers = /** @class */ (function () {
    function NetworkObservers() {
        this.fetchObserver = null;
    }
    NetworkObservers.prototype.start = function (eventCallback, networkConfig) {
        this.eventCallback = eventCallback;
        this.networkConfig = networkConfig;
        this.observeFetch();
    };
    NetworkObservers.prototype.stop = function () {
        var _a;
        (_a = this.fetchObserver) === null || _a === void 0 ? void 0 : _a.call(this);
        this.fetchObserver = null;
        this.eventCallback = undefined;
        this.networkConfig = undefined;
    };
    NetworkObservers.prototype.notifyEvent = function (event) {
        var _a;
        (_a = this.eventCallback) === null || _a === void 0 ? void 0 : _a.call(this, event);
    };
    NetworkObservers.prototype.observeFetch = function () {
        var _this = this;
        var globalScope = getGlobalScope();
        if (!globalScope)
            return;
        var originalFetch = globalScope.fetch;
        if (!originalFetch)
            return;
        globalScope.fetch = function (input, init) { return __awaiter(_this, void 0, void 0, function () {
            var startTime, requestEvent, bodyConfig, serialized, maxBytes, response, endTime, headers_1, contentType, cloned, error_1, endTime, typedError;
            var _this = this;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        startTime = Date.now();
                        requestEvent = {
                            timestamp: startTime,
                            type: 'fetch',
                            method: (init === null || init === void 0 ? void 0 : init.method) || 'GET',
                            url: input.toString(),
                            requestHeaders: init === null || init === void 0 ? void 0 : init.headers,
                        };
                        bodyConfig = (_a = this.networkConfig) === null || _a === void 0 ? void 0 : _a.body;
                        if (bodyConfig === null || bodyConfig === void 0 ? void 0 : bodyConfig.request) {
                            serialized = serializeRequestBody(init === null || init === void 0 ? void 0 : init.body);
                            if (serialized !== undefined) {
                                maxBytes = (_b = bodyConfig.maxBodySizeBytes) !== null && _b !== void 0 ? _b : DEFAULT_MAX_BODY_SIZE_BYTES;
                                requestEvent.requestBody = truncateToByteLimit(serialized, maxBytes).value;
                            }
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, originalFetch(input, init)];
                    case 2:
                        response = _c.sent();
                        endTime = Date.now();
                        requestEvent.status = response.status;
                        requestEvent.duration = endTime - startTime;
                        headers_1 = {};
                        response.headers.forEach(function (value, key) {
                            headers_1[key] = value;
                        });
                        requestEvent.responseHeaders = headers_1;
                        if (bodyConfig === null || bodyConfig === void 0 ? void 0 : bodyConfig.response) {
                            contentType = headers_1['content-type'] || null;
                            if (isBinaryContentType(contentType)) {
                                requestEvent.responseBodyStatus = 'skipped_binary';
                                this.notifyEvent(requestEvent);
                            }
                            else {
                                cloned = response.clone();
                                // Read body without blocking the response return to the caller
                                cloned.text().then(function (text) {
                                    var _a;
                                    var maxBytes = (_a = bodyConfig.maxBodySizeBytes) !== null && _a !== void 0 ? _a : DEFAULT_MAX_BODY_SIZE_BYTES;
                                    var _b = truncateToByteLimit(text, maxBytes), value = _b.value, truncated = _b.truncated;
                                    requestEvent.responseBody = value;
                                    requestEvent.responseBodyStatus = truncated ? 'truncated' : 'captured';
                                    _this.notifyEvent(requestEvent);
                                }, function () {
                                    requestEvent.responseBodyStatus = 'error';
                                    _this.notifyEvent(requestEvent);
                                });
                            }
                        }
                        else {
                            this.notifyEvent(requestEvent);
                        }
                        return [2 /*return*/, response];
                    case 3:
                        error_1 = _c.sent();
                        endTime = Date.now();
                        requestEvent.duration = endTime - startTime;
                        typedError = error_1;
                        requestEvent.error = {
                            name: typedError.name || 'UnknownError',
                            message: typedError.message || 'An unknown error occurred',
                        };
                        this.notifyEvent(requestEvent);
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        }); };
        this.fetchObserver = function () {
            globalScope.fetch = originalFetch;
        };
    };
    return NetworkObservers;
}());
export { NetworkObservers };
//# sourceMappingURL=observers.js.map
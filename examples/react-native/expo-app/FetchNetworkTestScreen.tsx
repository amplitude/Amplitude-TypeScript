import {useEffect, useRef, useState} from 'react';
import {Platform, ScrollView, StyleSheet, Text, View} from 'react-native';


type FetchOptions = RequestInit;

type FetchResult = {
  res?: Response;
  data?: unknown;
  url: string;
  options?: FetchOptions;
  error?: Error;
};

type DisplayResult = {
  url: string;
  status: number | string;
  statusText: string;
  method: string;
  data?: unknown;
  error?: Error;
  isError: boolean;
};

/**
 * Resolve the host that can reach the Vite test server from this device.
 * Prefer the Metro bundler host (already proven reachable), then explicit env override.
 */
function getTestServerHost(): string {
  if (process.env.TEST_SERVER_HOST) {
    return process.env.TEST_SERVER_HOST;
  }
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

const TEST_SERVER_HOST = getTestServerHost();
const BASE_URL = `http://${TEST_SERVER_HOST}:5173`;

function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function displayResultToItem(result: FetchResult): DisplayResult {
  const error = result.error;
  return {
    url: result.url,
    status: error ? 'Error' : result.res?.status ?? 'Error',
    statusText: error ? error.name : result.res?.statusText ?? '',
    method: result.options?.method || 'GET',
    data: result.data,
    error,
    isError: Boolean(error),
  };
}

function assert(result: FetchResult, expectedStatus: number): boolean {
  if (result.error) {
    if (expectedStatus !== 0) {
      throw new Error(`Expected status code ${expectedStatus} but got error: ${result.error.message}`);
    }
    return true;
  }

  const res = result.res;
  if (!(res instanceof Response)) {
    throw new Error('Test failed to receive a Response object');
  }

  if (typeof res.status !== 'number') {
    throw new Error('Response missing status code');
  }

  if (typeof res.statusText !== 'string') {
    throw new Error('Response missing status text');
  }

  if (!(res.headers instanceof Headers)) {
    throw new Error('Response missing headers');
  }

  if (res.status < 0 || res.status > 599) {
    throw new Error(`Invalid status code: ${res.status}`);
  }

  if (res.status !== expectedStatus) {
    throw new Error(`Expected status code ${expectedStatus} but got ${res.status}`);
  }

  if (['HEAD', 'OPTIONS'].includes(result.options?.method || '')) {
    return true;
  }

  const contentType = res.headers.get('content-type');
  if (!contentType && res.status !== 204 && res.status !== 304) {
    throw new Error('Response missing content-type header');
  }

  // if (!res.body && res.status !== 204 && res.status !== 304) {
  //   throw new Error('Response missing body');
  // }

  return true;
}

async function makeRequest(
  url: string,
  options: FetchOptions | undefined,
  onResult: (item: DisplayResult) => void,
): Promise<FetchResult> {
  const resolvedUrl = apiUrl(url);
  try {
    const res = await fetch(resolvedUrl, options);
    const contentType = res.headers.get('content-type') || '';
    let data: unknown = null;

    if (options?.method !== 'HEAD') {
      data = contentType.includes('application/json') ? await res.json() : await res.text();
    }

    const result: FetchResult = {res, data, url: resolvedUrl, options};
    onResult(displayResultToItem(result));
    return result;
  } catch (error) {
    const fetchError = error instanceof Error ? error : new Error(String(error));
    const result: FetchResult = {error: fetchError, url: resolvedUrl, options};
    onResult(displayResultToItem(result));
    return result;
  }
}

async function runFetchNetworkTests(onResult: (item: DisplayResult) => void): Promise<string> {
  let res: FetchResult;

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10);

  try {
    const abortedRes = await fetch(apiUrl('/api/status/200'), {
      method: 'POST',
      body: 'This request will be aborted',
      headers: {'Content-Type': 'text/plain'},
      signal: controller.signal,
    });
    await abortedRes.text();
  } catch (err) {
    const abortError = err instanceof Error ? err : new Error(String(err));
    console.error('Aborted request error:', abortError.name);
  }

  res = await makeRequest('/api/status/500', {method: 'POST', body: 'Hello', headers: {'Content-Type': 'text/plain'}}, onResult);
  assert(res, 500);

  res = await makeRequest(
    '/api/status/501',
    {
      method: 'POST',
      body: JSON.stringify({message: 'Hello', count: 42}),
      headers: {'Content-Type': 'application/json'},
    },
    onResult,
  );
  assert(res, 501);

  const formData = new FormData();
  formData.append('text', 'Hello from FormData');
  formData.append('file', new Blob(['Hello from Blob'], {type: 'text/plain'}));
  
  res = await makeRequest('/api/status/502', {method: 'POST', body: formData}, onResult);
  assert(res, 502);

  const params = new URLSearchParams();
  params.append('param1', 'value1');
  params.append('param2', 'value2');
  res = await makeRequest('/api/status/503', {method: 'POST', body: params}, onResult);
  assert(res, 503);

  res = await makeRequest(
    '/api/status/505',
    {method: 'POST', body: new Blob(['Hello from Blob'], {type: 'text/plain'})},
    onResult,
  );
  assert(res, 505);

  // TODO: TextEncoder is not supported in React Native
  res = await makeRequest('/api/status/506', {method: 'POST', body: 'hello world!'}, onResult);
  assert(res, 506);

  res = await makeRequest('/api/status/507', {method: 'GET'}, onResult);
  assert(res, 507);

  res = await makeRequest('/api/status/200', {method: 'GET'}, onResult);
  assert(res, 200);

  res = await makeRequest('/api/status/200', {method: 'HEAD'}, onResult);
  assert(res, 200);

  res = await makeRequest('/api/status/200', {method: 'OPTIONS'}, onResult);
  assert(res, 200);

  res = await makeRequest('/api/status/200', {method: 'DELETE'}, onResult);
  assert(res, 200);

  res = await makeRequest(
    '/api/status/200',
    {
      method: 'PUT',
      body: JSON.stringify({message: 'Update'}),
      headers: {'Content-Type': 'application/json'},
    },
    onResult,
  );
  assert(res, 200);

  res = await makeRequest('/api/test', {method: 'GET'}, onResult);
  assert(res, 200);

  res = await makeRequest('https://notrealdomain', undefined, onResult);
  assert(res, 0);

  res = await makeRequest('/api/status/200?sleep=5000', {method: 'GET'}, onResult);
  assert(res, 200);

  return 'All tests completed successfully!';
}

export default function FetchNetworkTestScreen() {
  const [completionMessage, setCompletionMessage] = useState('Running tests...');
  const [isComplete, setIsComplete] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [results, setResults] = useState<DisplayResult[]>([]);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) {
      return;
    }
    hasStarted.current = true;

    const timeoutId = setTimeout(async () => {
      try {
        const message = await runFetchNetworkTests((item) => {
          setResults((current) => [...current, item]);
        });
        setIsComplete(true);
        setIsSuccess(true);
        setCompletionMessage(message);
      } catch (error) {
        const failureMessage = `Test failed: ${error instanceof Error ? error.message : String(error)}`;
        setIsComplete(true);
        setIsSuccess(false);
        setCompletionMessage(failureMessage);
        console.error(failureMessage);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Fetch Network Tracking Test</Text>

      <View
        style={[
          styles.completionIndicator,
          isComplete && (isSuccess ? styles.completionSuccess : styles.completionFailure),
        ]}
      >
        <Text
          style={[
            styles.completionText,
            isComplete && (isSuccess ? styles.completionTextSuccess : styles.completionTextFailure),
          ]}
        >
          {completionMessage}
        </Text>
      </View>

      <Text style={styles.description}>
        This tests the autocapture.networkTracking feature and the fetch API. It will make a series of
        requests to various endpoints and display the results to verify that the fetch override is working.
      </Text>

      <Text style={styles.serverHint}>Test server: {BASE_URL}</Text>

      {results.map((result, index) => (
        <View
          key={`${result.url}-${result.method}-${index}`}
          style={[styles.resultItem, result.isError ? styles.resultError : styles.resultSuccess]}
        >
          <Text style={styles.resultUrl}>{result.url}</Text>
          <Text style={styles.resultStatus}>
            Status: {result.status} {result.statusText}
          </Text>
          <View style={styles.resultDetails}>
            <Text style={styles.resultDetailsText}>
              {`Method: ${result.method}`}
              {result.data !== undefined && result.data !== null
                ? `\nResponse: ${JSON.stringify(result.data, null, 2)}`
                : ''}
              {result.error ? `\nError: ${result.error.message}` : ''}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  completionIndicator: {
    padding: 10,
    marginVertical: 10,
    borderRadius: 4,
    backgroundColor: '#e3f2fd',
  },
  completionSuccess: {
    backgroundColor: '#e8f5e9',
  },
  completionFailure: {
    backgroundColor: '#ffebee',
  },
  completionText: {
    color: '#1565c0',
    fontWeight: '700',
  },
  completionTextSuccess: {
    color: '#2e7d32',
  },
  completionTextFailure: {
    color: '#c62828',
  },
  description: {
    marginBottom: 12,
    lineHeight: 20,
  },
  serverHint: {
    marginBottom: 12,
    fontFamily: Platform.select({ios: 'Menlo', android: 'monospace', default: 'monospace'}),
    fontSize: 12,
    color: '#555',
  },
  resultItem: {
    marginVertical: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    borderLeftWidth: 4,
  },
  resultSuccess: {
    borderLeftColor: '#4CAF50',
  },
  resultError: {
    borderLeftColor: '#f44336',
  },
  resultUrl: {
    fontWeight: '700',
  },
  resultStatus: {
    marginVertical: 5,
  },
  resultDetails: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 4,
  },
  resultDetailsText: {
    fontFamily: Platform.select({ios: 'Menlo', android: 'monospace', default: 'monospace'}),
  },
});

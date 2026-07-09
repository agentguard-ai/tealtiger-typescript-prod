const webStreams = require('stream/web');
const { Blob } = require('buffer');

for (const name of ['ReadableStream', 'TransformStream', 'WritableStream']) {
  if (typeof globalThis[name] === 'undefined' && webStreams[name]) {
    globalThis[name] = webStreams[name];
  }
}

if (typeof globalThis.Blob === 'undefined' && Blob) {
  globalThis.Blob = Blob;
}

class TestHeaders {
  constructor(init = {}) {
    this.values = new Map();

    if (init instanceof TestHeaders) {
      for (const [key, value] of init.entries()) {
        this.set(key, value);
      }
      return;
    }

    if (Array.isArray(init)) {
      for (const [key, value] of init) {
        this.set(key, value);
      }
      return;
    }

    for (const [key, value] of Object.entries(init)) {
      this.set(key, value);
    }
  }

  set(key, value) {
    this.values.set(String(key).toLowerCase(), String(value));
  }

  entries() {
    return this.values.entries();
  }
}

class TestRequest {
  constructor(url, options = {}) {
    this.url = String(url);
    this.method = options.method || 'GET';
    this.headers = options.headers || {};
    this.body = options.body;
    this.keepalive = Boolean(options.keepalive);
  }
}

class TestResponse {
  constructor(body, options = {}) {
    this.body = body;
    this.status = options.status || 200;
    this.statusText = options.statusText || '';
    this.headers = new TestHeaders(options.headers);
  }

  blob() {
    return Promise.resolve(new Blob([this.body || '']));
  }
}

if (typeof globalThis.Headers === 'undefined') {
  globalThis.Headers = TestHeaders;
}

if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = TestRequest;
}

if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = TestResponse;
}

if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = () => Promise.reject(new Error('fetch is not available in this Jest environment'));
}

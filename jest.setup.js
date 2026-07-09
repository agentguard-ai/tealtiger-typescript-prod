const webStreams = require('stream/web');

for (const name of ['ReadableStream', 'TransformStream', 'WritableStream']) {
  if (typeof globalThis[name] === 'undefined' && webStreams[name]) {
    globalThis[name] = webStreams[name];
  }
}

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

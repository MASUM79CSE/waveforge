/**
 * FLAC export worker (M4) — classic worker on purpose: it drives the
 * vendored emscripten libflac build via importScripts (AudioMass-proven
 * wiring, bundler-free wasm loading; see ADR 006 §2). Hand-validated
 * messages instead of zod (this file is a boundary shim, plain JS).
 *
 * Global `Flac` comes from /vendor/libflac.min.wasm.js.
 */
/* eslint-disable */
importScripts('/vendor/libflac.min.wasm.js');

var currentId = -1;
var cancelled = false;

function clampLevel(level) {
  var n = Math.round(Number(level));
  if (!isFinite(n)) return 5;
  return Math.max(0, Math.min(8, n));
}

function sampleToInt(x, bps) {
  if (!isFinite(x)) x = 0;
  var full = bps === 24 ? 8388608 : 32768;
  var max = full - 1;
  var v = Math.round(x < 0 ? x * full : x * max);
  return Math.max(-full, Math.min(max, v));
}

// the UMD wrapper assigns self.Flac immediately, but the wasm runtime
// initialises asynchronously — encoding before isReady() fails
function ensureFlac() {
  return new Promise(function (resolve, reject) {
    var flac = self.Flac;
    if (!flac || typeof flac.create_libflac_encoder !== 'function') {
      reject(new Error('Flac global missing'));
      return;
    }
    if (flac.isReady()) {
      resolve(flac);
      return;
    }
    var timer = setTimeout(function () {
      reject(new Error('libflac init timeout'));
    }, 15000);
    flac.onready = function () {
      clearTimeout(timer);
      resolve(flac);
    };
  });
}

self.onmessage = function (ev) {
  var msg = ev.data || {};
  if (msg.cmd === 'cancel') {
    cancelled = true;
    currentId = msg.id;
    return;
  }
  if (msg.cmd !== 'encode') return;

  // defensive boundary validation (classic worker, plain JS)
  var channels = msg.channels === 2 ? 2 : 1;
  var bps = msg.bits === 24 ? 24 : 16;
  var sampleRate = Math.round(Number(msg.sampleRate));
  var frames = Math.round(Number(msg.frames));
  var level = clampLevel(msg.level);
  if (!isFinite(sampleRate) || sampleRate <= 0 || !isFinite(frames) || frames <= 0) {
    postMessage({ type: 'error', id: msg.id, detail: 'bad encode parameters' });
    return;
  }
  if (!(msg.left instanceof Float32Array) || (channels === 2 && !(msg.right instanceof Float32Array))) {
    postMessage({ type: 'error', id: msg.id, detail: 'bad channel data' });
    return;
  }

  cancelled = false;
  currentId = msg.id;
  ensureFlac()
    .then(function (flac) {
      encodeWith(msg, flac);
    })
    .catch(function (error) {
      postMessage({ type: 'error', id: msg.id, detail: String(error) });
    });
};

function encodeWith(msg, Flac) {
  var channels = msg.channels === 2 ? 2 : 1;
  var bps = msg.bits === 24 ? 24 : 16;
  var sampleRate = Math.round(Number(msg.sampleRate));
  var frames = Math.round(Number(msg.frames));
  var level = clampLevel(msg.level);
  var left = msg.left;
  var right = channels === 2 ? msg.right : null;
  var totalFrames = Math.min(frames, left.length);

  var chunks = [];
  var totalBytes = 0;
  var encoder = Flac.create_libflac_encoder(sampleRate, channels, bps, level, totalFrames, false, 0);
  if (!encoder) {
    postMessage({ type: 'error', id: msg.id, detail: 'encoder creation failed' });
    return;
  }
  var status = Flac.init_encoder_stream(encoder, function (buffer, bytes) {
    chunks.push(new Uint8Array(buffer));
    totalBytes += bytes;
  });
  if (status !== 0) {
    Flac.FLAC__stream_encoder_delete(encoder);
    postMessage({ type: 'error', id: msg.id, detail: 'init status ' + status });
    return;
  }

  var blockSize = 4096;
  var interleaved = new Int32Array(blockSize * channels);
  for (var pos = 0; pos < totalFrames; pos += blockSize) {
    if (cancelled && currentId === msg.id) {
      Flac.FLAC__stream_encoder_finish(encoder);
      Flac.FLAC__stream_encoder_delete(encoder);
      cancelled = false;
      postMessage({ type: 'cancelled', id: msg.id });
      return;
    }
    var end = Math.min(pos + blockSize, totalFrames);
    var n = end - pos;
    for (var i = 0; i < n; ++i) {
      interleaved[i * channels] = sampleToInt(left[pos + i], bps);
      if (channels === 2) interleaved[i * channels + 1] = sampleToInt(right[pos + i], bps);
    }
    var block = n * channels === interleaved.length ? interleaved : interleaved.subarray(0, n * channels);
    Flac.FLAC__stream_encoder_process_interleaved(encoder, block, n);
    if (pos % (blockSize * 16) === 0) {
      postMessage({ type: 'progress', id: msg.id, done: pos, total: totalFrames });
    }
  }

  Flac.FLAC__stream_encoder_finish(encoder);
  Flac.FLAC__stream_encoder_delete(encoder);

  var out = new Uint8Array(totalBytes);
  var offset = 0;
  for (var c = 0; c < chunks.length; ++c) {
    out.set(chunks[c], offset);
    offset += chunks[c].length;
  }
  postMessage({ type: 'done', id: msg.id, data: out.buffer, bytes: totalBytes }, [out.buffer]);
}

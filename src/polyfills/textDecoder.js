/**
 * TextDecoder polyfill for Hermes — adds latin1/iso-8859-1 support.
 *
 * Hermes (React Native's JS engine) only supports UTF-8 in TextDecoder.
 * The `fast-png` library's dependency `iobuffer` needs latin1 decoding.
 * This polyfill patches TextDecoder to handle latin1 before fast-png loads.
 *
 * Must be imported BEFORE any module that uses fast-png.
 * That's why it's in index.js at the very top.
 */

(function () {
  const OriginalTextDecoder = globalThis.TextDecoder;

  if (!OriginalTextDecoder) return;

  // Test if latin1 is already supported
  try {
    new OriginalTextDecoder('latin1');
    return; // Already works — no patch needed
  } catch (_e) {
    // Hermes doesn't support latin1 — patch it
  }

  globalThis.TextDecoder = function PatchedTextDecoder(encoding, options) {
    const enc = (encoding || 'utf-8').toLowerCase().replace(/[-_\s]/g, '');

    if (enc === 'latin1' || enc === 'iso88591' || enc === 'windows1252') {
      // Return a manual latin1 decoder object
      return {
        encoding: 'latin1',
        fatal: (options && options.fatal) || false,
        ignoreBOM: (options && options.ignoreBOM) || false,
        decode: function (input) {
          if (!input) return '';
          var bytes;
          if (input instanceof Uint8Array) {
            bytes = input;
          } else if (ArrayBuffer.isView(input)) {
            bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
          } else {
            bytes = new Uint8Array(input);
          }
          var result = '';
          for (var i = 0; i < bytes.length; i++) {
            result += String.fromCharCode(bytes[i]);
          }
          return result;
        },
      };
    }

    // For all other encodings, delegate to the original TextDecoder
    return new OriginalTextDecoder(encoding, options);
  };

  // Copy static properties
  globalThis.TextDecoder.prototype = OriginalTextDecoder.prototype;
})();

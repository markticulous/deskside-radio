/*
 * Markticulous supporter check for web apps. Asks the support Worker whether
 * an email supported on Ko-fi. Only the SHA-256 hash of the trimmed,
 * lower-cased email leaves the browser, and only when the person clicks Check.
 * Must hash exactly like csharp/SupportVerifier.cs and worker/core.js (same
 * test vector). Works via <script> (window.MarkticulousVerify) or require().
 * Needs a secure context for crypto.subtle: https, localhost or a file: page.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarkticulousVerify = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ENDPOINT = 'https://support.markticulous.com/verify';

  function normaliseEmail(email) {
    return String(email == null ? '' : email).trim().toLowerCase();
  }

  // Resolves to the 64-hex SHA-256 of the normalised email.
  function hashEmail(email, subtle) {
    var bytes = new TextEncoder().encode(normaliseEmail(email));
    return (subtle || crypto.subtle).digest('SHA-256', bytes).then(function (digest) {
      var out = '';
      new Uint8Array(digest).forEach(function (b) { out += (b < 16 ? '0' : '') + b.toString(16); });
      return out;
    });
  }

  // Resolves to 'found', 'not-found' or 'error'. Never rejects.
  function check(email, fetchImpl, subtle) {
    var doFetch = fetchImpl || fetch;
    return hashEmail(email, subtle).then(function (h) {
      return doFetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ h: h }),
      });
    }).then(function (r) {
      if (!r.ok) return 'error';
      return r.json().then(function (body) { return body && body.supporter === true ? 'found' : 'not-found'; });
    }).catch(function () { return 'error'; });
  }

  return { ENDPOINT: ENDPOINT, normaliseEmail: normaliseEmail, hashEmail: hashEmail, check: check };
}));

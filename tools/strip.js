/* Take the comments and the indentation out of what ships.

   The source is commented the way it is on purpose: the why of a thing is
   worth more than the what, and it lives next to the code it explains. But
   the download is not the place people read it — that is the repository —
   and in a single-file app the reader pays for every byte of it twice, once
   in the file and once in the parse. So the build strips, and the source
   keeps its comments.

   This is not a minifier. Nothing is renamed, nothing is rearranged, no
   expression is rewritten: comments go, leading and trailing whitespace on
   each line goes, blank lines go. In CSS a line is also joined to the one
   before it when that one ends in a character which cannot begin a
   descendant combinator, which is where most of the newlines are.

   Deliberately conservative, because a build that can silently produce a
   broken file is worse than a larger one. The three things that have to be
   got right are strings, regular expressions and url(), the last because
   base64 contains slashes and stars and a data: URI will sooner or later
   hold a literal comment opener. */

/* A slash begins a regular expression rather than a division when what
   came before it cannot end an expression. Word operators are checked as
   words, so the g of a variable called "log" is not read as the g of a
   preceding keyword. */
var WORDS = ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void',
  'instanceof', 'do', 'else', 'yield', 'await', 'throw'];

function regexAllowed(prev, prevWord) {
  if (prev === '') return true;
  if ('(,=:[!&|?{};+-*%~^<>'.indexOf(prev) !== -1) return true;
  return WORDS.indexOf(prevWord) !== -1;
}

function tidy(text) {
  return text.split('\n')
    .map(function (line) { return line.trim(); })
    .filter(function (line) { return line !== ''; })
    .join('\n');
}

function stripJs(src) {
  var out = '';
  var i = 0, n = src.length;
  var prev = '', word = '', prevWord = '';

  while (i < n) {
    var c = src.charAt(i), d = src.charAt(i + 1);

    if (c === '/' && d === '/') {
      while (i < n && src.charAt(i) !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src.charAt(i) === '*' && src.charAt(i + 1) === '/')) i++;
      i += 2;
      /* A block comment between two lines leaves them looking like one, so
         it is replaced by the break it was sitting on. */
      out += '\n';
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      out += c; i++;
      while (i < n) {
        var s = src.charAt(i);
        if (s === '\\') { out += s + src.charAt(i + 1); i += 2; continue; }
        out += s; i++;
        if (s === c) break;
      }
      prev = c; prevWord = ''; word = '';
      continue;
    }

    if (c === '/' && regexAllowed(prev, prevWord)) {
      out += c; i++;
      var inClass = false;
      while (i < n) {
        var r = src.charAt(i);
        if (r === '\\') { out += r + src.charAt(i + 1); i += 2; continue; }
        if (r === '[') inClass = true;
        else if (r === ']') inClass = false;
        out += r; i++;
        if (r === '/' && !inClass) break;
      }
      // the flags
      while (i < n && /[a-z]/i.test(src.charAt(i))) { out += src.charAt(i); i++; }
      prev = '/'; prevWord = ''; word = '';
      continue;
    }

    out += c;
    if (/[A-Za-z_$0-9]/.test(c)) word += c;
    else if (word) { prevWord = word; word = ''; }
    if (!/\s/.test(c)) prev = c;
    i++;
  }

  return tidy(out);
}

function stripCss(src) {
  var out = '';
  var i = 0, n = src.length;

  while (i < n) {
    var c = src.charAt(i);

    if (c === '/' && src.charAt(i + 1) === '*') {
      i += 2;
      while (i < n && !(src.charAt(i) === '*' && src.charAt(i + 1) === '/')) i++;
      i += 2;
      out += '\n';
      continue;
    }

    if (c === '"' || c === "'") {
      out += c; i++;
      while (i < n) {
        var s = src.charAt(i);
        if (s === '\\') { out += s + src.charAt(i + 1); i += 2; continue; }
        out += s; i++;
        if (s === c) break;
      }
      continue;
    }

    /* Copied through as written. A base64 data: URI is not CSS and must not
       be read as any: it contains / and * in any order it likes. */
    if ((c === 'u' || c === 'U') && /^url\(/i.test(src.substr(i, 4))) {
      out += src.substr(i, 4); i += 4;
      var quote = src.charAt(i);
      if (quote === '"' || quote === "'") {
        out += quote; i++;
        while (i < n) {
          var q = src.charAt(i);
          if (q === '\\') { out += q + src.charAt(i + 1); i += 2; continue; }
          out += q; i++;
          if (q === quote) break;
        }
      }
      while (i < n && src.charAt(i) !== ')') { out += src.charAt(i); i++; }
      continue;
    }

    out += c; i++;
  }

  /* Newlines that cannot be carrying meaning. A break after any of these
     characters can only be formatting; a break between two selectors, or
     between two words of one selector, is a descendant combinator and has
     to stay. */
  return tidy(out).replace(/([{};,])\n/g, '$1');
}

module.exports = { stripJs: stripJs, stripCss: stripCss };

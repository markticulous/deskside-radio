/* The body of a GitHub release, composed rather than pasted.

     node tools/release-notes.js > notes.md
     gh release create vX.Y.Z --notes-file notes.md ...

   Every release page opens with the same block: download this one file,
   double-click it, and what to do instead on a Mac or on Linux. It is the
   first thing anyone arriving at the page needs and the last thing worth
   retyping, and 1.4.8 went out without it because the body was built from
   version.json alone. So it lives in docs/release-header.md and is put in
   front of the notes here, where forgetting it is not an option.

   What follows the divider is version.json's own notes -- the same text
   the radio shows in Settings when it finds an update, so the page and
   the app cannot describe a release differently. */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const header = read('docs/release-header.md').replace(/\s+$/, '');
const notes = JSON.parse(read('version.json')).notes.trim();

process.stdout.write(header + '\n\n---\n\n' + notes + '\n');

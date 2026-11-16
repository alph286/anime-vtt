const path = require('path');
const fs = require('fs');

/**
 * Removes an uploaded file from disk, but only if it genuinely resolves inside
 * `dir` — a stored filename must never be able to reach outside its own folder.
 * A missing file is not an error: the state entry is what the user asked to
 * remove, and an orphaned reference should still clean up silently.
 */
function deleteUploadedFile(dir, filename) {
  if (!filename) return;
  const target = path.resolve(dir, filename);
  if (path.dirname(target) !== path.resolve(dir)) return;
  try {
    fs.unlinkSync(target);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Impossibile eliminare ${target}:`, err.message);
  }
}

module.exports = { deleteUploadedFile };

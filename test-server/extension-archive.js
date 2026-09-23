// Serves the configurator's runner extension as a zip, so installing it doesn't take a checkout of this
// repository or a build of the SDK.
//
// The archive isn't an installable package. Chrome only accepts an unpacked folder from outside the Web
// Store — a .crx can't be dragged in any more — so this is a way to get the files: download, unzip, hand
// the folder to "Load unpacked". Everything is nested under one directory named after the source folder,
// so every unzipping tool produces the same single folder to point at.
//
// It's built from the working tree per request rather than checked in, which keeps it in step with the
// extension and with the SDK bundles vendored into it. `vite build` emits the same bytes as a static
// asset, since a hosted copy of the configurator has no middleware to build it on demand.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

// Also hardcoded by the configurator's runner-extension-panel.jsx, which links to it. It can't import
// this module for the constant: this one reads the filesystem.
const ARCHIVE_NAME = 'configurator-extension.zip';

const ARCHIVE_URL = `/${ARCHIVE_NAME}`;

// The version this server would hand out, for the configurator to hold against the one the installed
// extension reports. An unpacked extension is a folder Chrome loaded once and won't look at again until it
// is reloaded, and the page it talks to is pinned to whichever copy was loaded when the page opened, so the
// two drift apart constantly during development with nothing to say that they have. It is served rather
// than read from the folder by the page because a hosted copy of the configurator has no folder to read.
const VERSION_NAME = 'configurator-extension-version.json';

const VERSION_URL = `/${VERSION_NAME}`;

function shippedVersion(extensionDir) {
  const manifest = JSON.parse(readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'));
  return JSON.stringify({ version: manifest.version });
}

// The single directory every entry sits under, named after the folder in the repository so the install
// steps read the same whether the folder came from a checkout or from here.
const ROOT_DIRECTORY = 'configurator-extension';

// Only meaningful in a checkout: .gitignore covers the vendored bundles, which are already inside the
// archive, and the script that produces them has nothing left to do once they are.
const EXCLUDED = new Set(['.gitignore', 'sync-vendor.mjs']);

const VENDOR_DIRECTORY = 'vendor/';

const SYNC_COMMAND = 'node test-server/configurator-extension/sync-vendor.mjs';

// CRC-32 (IEEE 802.3), which every zip entry carries twice: once in its local header and once in the
// central directory.
const CRC_TABLE = Int32Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value;
});

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

// A fixed 1980-01-01 in the DOS encoding zip entries use, rather than each file's mtime: nothing reads
// these timestamps, and a constant makes the archive byte-identical between builds of the same files.
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

// A regular file, 0644, in the high half of the external attributes field, so unzipping on a Unix system
// doesn't produce files with no permissions at all. Shifted back to unsigned, since << is signed.
const UNIX_FILE_MODE = (0o100644 << 16) >>> 0;

// Paths of every file to archive, relative to the extension directory, depth first and sorted so the
// archive doesn't depend on the order the filesystem hands entries back.
function collectFiles(root, prefix = '') {
  const entries = readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  return entries.flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (EXCLUDED.has(relative)) {
      return [];
    }
    return entry.isDirectory() ? collectFiles(root, relative) : [relative];
  });
}

// No data descriptors and no zip64: the whole archive is assembled in memory, so every size and checksum
// is known before its header is written, and a few hundred kilobytes of minified JS is nowhere near the
// 4 GB the classic format tops out at. Directory entries are left out — the paths imply them.
function zip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, bytes } of files) {
    const compressed = deflateRawSync(bytes, { level: 9 });
    const nameBytes = Buffer.from(name, 'utf8');
    const checksum = crc32(bytes);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed to extract: 2.0, for deflate
    local.writeUInt16LE(0, 6); // no flags: sizes are known up front and the names are ASCII
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // no extra field
    localParts.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // no extra field
    central.writeUInt16LE(0, 32); // no comment
    central.writeUInt16LE(0, 34); // single disk
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(UNIX_FILE_MODE, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }

  const directory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // the disk the central directory starts on
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // no archive comment

  return Buffer.concat([...localParts, directory, end]);
}

function buildArchive(extensionDir) {
  if (!existsSync(extensionDir)) {
    throw new Error(`There is no extension at ${extensionDir}.`);
  }
  const names = collectFiles(extensionDir);
  // An extension without the bundles it injects loads and then fails on the first run, which is a much
  // worse thing to hand someone than no download at all.
  if (!names.some((name) => name.startsWith(VENDOR_DIRECTORY))) {
    throw new Error(`The extension has no vendored SDK bundles. Build them, then: ${SYNC_COMMAND}`);
  }
  return zip(
    names.map((name) => ({
      name: `${ROOT_DIRECTORY}/${name}`,
      bytes: readFileSync(path.join(extensionDir, name)),
    })),
  );
}

export function createExtensionArchive(extensionDir) {
  const serve = (req, res, next) => {
    const url = req.url?.split('?')[0];
    if (url === VERSION_URL) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(shippedVersion(extensionDir));
      return;
    }
    if (url !== ARCHIVE_URL) {
      next();
      return;
    }
    try {
      const archive = buildArchive(extensionDir);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${ARCHIVE_NAME}"`);
      // Rebuilt per request, so an edit to the extension is in the next download rather than in whatever
      // the browser kept.
      res.setHeader('Cache-Control', 'no-store');
      res.end(archive);
    } catch (error) {
      // Plain text and a 503: this is read by whoever clicked the link, and the fix is a command.
      res.statusCode = 503;
      res.setHeader('Content-Type', 'text/plain');
      res.end(`${error.message}\n`);
    }
  };

  return {
    name: 'configurator-extension-archive',
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: VERSION_NAME, source: shippedVersion(extensionDir) });
      try {
        this.emitFile({ type: 'asset', fileName: ARCHIVE_NAME, source: buildArchive(extensionDir) });
      } catch (error) {
        this.warn(`${error.message} This build has no ${ARCHIVE_NAME}.`);
      }
    },
  };
}

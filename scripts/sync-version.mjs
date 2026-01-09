import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function getWorkspaceRoot() {
  // This script lives at <repo>/scripts/sync-version.mjs
  const filePath = fileURLToPath(import.meta.url);
  const dir = path.dirname(filePath);
  return path.resolve(dir, "..");
}

function readUtf8(p) {
  return fs.readFileSync(p, "utf8");
}

function writeUtf8(p, s) {
  fs.writeFileSync(p, s, "utf8");
}

function isSemver(v) {
  // x.y.z with optional prerelease/build metadata
  return /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(v);
}

function updateTauriConfJson(filePath, nextVersion, { checkOnly }) {
  const raw = readUtf8(filePath);
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    die(`Failed to parse JSON: ${filePath}\n${String(e)}`);
  }
  const prev = obj?.version;
  if (typeof prev !== "string") die(`Missing string "version" in ${filePath}`);
  if (prev !== nextVersion) {
    if (checkOnly) return { ok: false, prev, next: nextVersion };
    obj.version = nextVersion;
    writeUtf8(filePath, JSON.stringify(obj, null, 2) + "\n");
  }
  return { ok: true, prev, next: nextVersion };
}

function updateCargoToml(filePath, nextVersion, { checkOnly }) {
  const raw = readUtf8(filePath);
  const lines = raw.split(/\r?\n/);

  const pkgStart = lines.findIndex((l) => l.trim() === "[package]");
  if (pkgStart < 0) die(`Missing [package] section in ${filePath}`);
  let pkgEnd = lines.length;
  for (let i = pkgStart + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("[") && t.endsWith("]")) {
      pkgEnd = i;
      break;
    }
  }

  let versionLineIdx = -1;
  for (let i = pkgStart + 1; i < pkgEnd; i++) {
    const t = lines[i].trim();
    if (t.startsWith("version")) {
      versionLineIdx = i;
      break;
    }
  }
  if (versionLineIdx < 0) die(`Missing version in [package] section: ${filePath}`);

  const m = lines[versionLineIdx].match(/^(\s*version\s*=\s*)"([^"]+)"(\s*)$/);
  if (!m) die(`Unsupported version line format in ${filePath}: ${lines[versionLineIdx]}`);
  const prev = m[2];
  if (prev !== nextVersion) {
    if (checkOnly) return { ok: false, prev, next: nextVersion };
    lines[versionLineIdx] = `${m[1]}"${nextVersion}"${m[3]}`;
    writeUtf8(filePath, lines.join("\n").replace(/\s*$/, "\n"));
  }
  return { ok: true, prev, next: nextVersion };
}

function parseArgs(argv) {
  const args = { checkOnly: false, version: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.checkOnly = true;
    else if (a === "--version") {
      const v = argv[i + 1];
      if (!v) die("--version requires a value");
      args.version = v;
      i++;
    } else if (!a.startsWith("-") && !args.version) {
      // allow positional version
      args.version = a;
    } else {
      die(`Unknown arg: ${a}`);
    }
  }
  return args;
}

const { checkOnly, version } = parseArgs(process.argv.slice(2));

const nextVersion = version ?? process.env.npm_package_version ?? null;
if (!nextVersion) {
  die("No version provided. Usage: node scripts/sync-version.mjs <x.y.z> or rely on npm_package_version env.");
}
if (!isSemver(nextVersion)) {
  die(`Not a SemVer version: ${nextVersion}`);
}

const root = getWorkspaceRoot();
const targets = [
  {
    name: "src-tauri/tauri.conf.json",
    path: path.join(root, "src-tauri", "tauri.conf.json"),
    apply: updateTauriConfJson,
  },
  {
    name: "src-tauri/Cargo.toml",
    path: path.join(root, "src-tauri", "Cargo.toml"),
    apply: updateCargoToml,
  },
];

let allOk = true;
for (const t of targets) {
  const r = t.apply(t.path, nextVersion, { checkOnly });
  if (!r.ok) {
    allOk = false;
    console.error(`[version mismatch] ${t.name}: expected ${r.next}, got ${r.prev}`);
  }
}

if (!allOk) {
  process.exit(2);
}

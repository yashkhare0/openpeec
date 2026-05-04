#!/usr/bin/env node
// Download the AMO-signed Buster captcha-solver .xpi and extract it into
// runner/addons/buster/ — Camoufox requires extracted addon directories with
// a manifest.json, not raw .xpi archives.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ADDONS_DIR = path.resolve(process.cwd(), "runner/addons");
const XPI_PATH = path.join(ADDONS_DIR, "buster.xpi");
const EXTRACT_DIR = path.join(ADDONS_DIR, "buster");
const MANIFEST = path.join(EXTRACT_DIR, "manifest.json");
const AMO_LATEST =
  "https://addons.mozilla.org/firefox/downloads/latest/buster-captcha-solver/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0";

async function download(url, destination) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("xpinstall") && !contentType.includes("zip")) {
    throw new Error(
      `Unexpected content-type "${contentType}" from ${url}; aborting.`
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  return { bytes: buffer.length, finalUrl: response.url };
}

function extract(xpi, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync("unzip", ["-q", "-o", xpi, "-d", dir], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    throw new Error(`unzip exited with ${r.status} extracting ${xpi}`);
  }
}

const force = process.argv.includes("--force");

try {
  fs.mkdirSync(ADDONS_DIR, { recursive: true });
  if (!force && fs.existsSync(MANIFEST)) {
    process.exit(0);
  }
  const { bytes, finalUrl } = await download(AMO_LATEST, XPI_PATH);
  console.log(`Downloaded ${bytes} bytes from ${finalUrl}`);
  extract(XPI_PATH, EXTRACT_DIR);
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(`manifest.json not found after extraction at ${EXTRACT_DIR}`);
  }
  console.log(`Buster extracted to ${EXTRACT_DIR}.`);
  console.log(
    'Reference it from monitor configs as browser.camoufox.addons: ["runner/addons/buster"].'
  );
} catch (error) {
  if (process.env.OPENPEEC_BUSTER_OPTIONAL !== "0") {
    console.warn(
      `[install-buster] skipped: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(0);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

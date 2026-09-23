"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const MOCHA_JSON_MARKER = "__MOCHA_JSON_REPORT__";
const REPORT_PATH = path.join("out", "results", "test-results.json");
const TEST_SUITES_PATH = path.join("src", "web", "test", "suite");

function extractReport(buffer) {
  const markerIndex = buffer.lastIndexOf(MOCHA_JSON_MARKER);
  if (markerIndex === -1) {
    return undefined;
  }
  const afterMarker = buffer.slice(markerIndex + MOCHA_JSON_MARKER.length);
  const line = afterMarker.split(/\r?\n/, 1)[0].trim();
  if (!line) {
    return undefined;
  }
  return JSON.parse(line);
}

function getFallbackTestFile(repoRoot) {
  const testSuiteDirectory = path.join(repoRoot, TEST_SUITES_PATH);
  const testFiles = fs
    .readdirSync(testSuiteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => path.join(TEST_SUITES_PATH, entry.name));

  return testFiles.length === 1 ? testFiles[0].split(path.sep).join("/") : "";
}

function normalizeReport(results, repoRoot) {
  const fallbackFile = getFallbackTestFile(repoRoot);
  for (const key of ["tests", "passes", "failures", "pending"]) {
    for (const testCase of results[key] ?? []) {
      if (testCase && typeof testCase.file !== "string") {
        testCase.file = fallbackFile;
      }
    }
  }
  return results;
}

const repoRoot = path.join(__dirname, "..");
const vscodeTestWebBin =
  process.platform === "win32"
    ? path.join(repoRoot, "node_modules", ".bin", "vscode-test-web.cmd")
    : path.join(repoRoot, "node_modules", ".bin", "vscode-test-web");

const child = spawn(
  vscodeTestWebBin,
  [
    "--browserType=chromium",
    "--extensionDevelopmentPath=.",
    "--extensionTestsPath=dist/web/test/suite/index.js",
  ],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  },
);

let stdout = "";
let stderr = "";

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  stdout += text;
  process.stdout.write(chunk);
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  stderr += text;
  process.stderr.write(chunk);
});

child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

child.on("close", (code, signal) => {
  try {
    const results = extractReport(stdout + stderr);
    if (results) {
      normalizeReport(results, repoRoot);
      const reportFile = path.join(repoRoot, REPORT_PATH);
      fs.mkdirSync(path.dirname(reportFile), { recursive: true });
      fs.writeFileSync(reportFile, JSON.stringify(results, null, 2) + "\n");
    } else {
      console.error(
        `No Mocha JSON report found (marker ${MOCHA_JSON_MARKER}).`,
      );
    }
  } catch (err) {
    console.error("Failed to write Mocha JSON report:", err);
  }

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

// Checks that this computer can run the app. Run with: node scripts/check-env.mjs
import { execSync } from "node:child_process";

const MIN_NODE = [20, 9, 0];
const results = [];

function check(name, ok, detail, fix) {
  results.push({ name, ok, detail, fix });
}

const nodeVersion = process.versions.node.split(".").map(Number);
const nodeOk = nodeVersion[0] > MIN_NODE[0] || (nodeVersion[0] === MIN_NODE[0] && nodeVersion[1] >= MIN_NODE[1]);
check("Node.js", nodeOk, `v${process.versions.node} (needs ${MIN_NODE.join(".")} or newer)`, "Install the LTS version from https://nodejs.org");

let npmVersion = null;
try {
  npmVersion = execSync("npm -v", { encoding: "utf8" }).trim();
} catch {}
check("npm", !!npmVersion && Number(npmVersion.split(".")[0]) >= 10, npmVersion ? `v${npmVersion} (needs 10 or newer)` : "not found", "npm comes with Node.js; reinstall Node.js LTS");

let gitVersion = null;
try {
  gitVersion = execSync("git --version", { encoding: "utf8" }).trim();
} catch {}
check("Git (optional, for cloning from GitHub)", true, gitVersion ?? "not installed", "Install from https://git-scm.com if you want to clone the repository");

check("Operating system", true, `${process.platform} ${process.arch}`, "");

for (const r of results) {
  console.log(`${r.ok ? "✔" : "✘"} ${r.name}: ${r.detail}${r.ok ? "" : `\n    Fix: ${r.fix}`}`);
}
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? "\nFix the items marked ✘, then run this again." : "\nAll set. Run: npm install && npm run dev");
process.exit(failed.length ? 1 : 0);

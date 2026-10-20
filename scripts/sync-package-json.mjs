/**
 * 上游同步之后，把移植版自己的改动重新写回 package.json。
 *
 * scripts/update-upstream.sh 会整体采用上游的 package.json（依赖、脚本都以上游为准），
 * 本脚本负责补回两处移植层改动：本仓库自己的 version，以及 Safari 相关的构建脚本。
 * 这样上游同步不会因为版本号或脚本差异产生冲突。
 *
 * 用法：PORT_VERSION=1.2 node scripts/sync-package-json.mjs [package.json 路径]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// 移植版新增的脚本，会插在 build:dist-firefox 之后，与手工维护时的顺序一致
const portScripts = {
  "build:dist-safari": "cross-env TARGET=safari vite build",
  "build:safari-project": "bash scripts/create-safari-project.sh",
  "build:safari-app": "bash scripts/build-safari-app.sh",
  "update:upstream": "bash scripts/update-upstream.sh",
};

const portVersion = (process.env.PORT_VERSION ?? "").trim();
if (!/^\d+(\.\d+){0,3}$/.test(portVersion)) {
  console.error(`error: PORT_VERSION 必须是版本号，当前为 '${portVersion}'。`);
  process.exit(1);
}

const file = resolve(process.argv[2] ?? "package.json");
const pkg = JSON.parse(readFileSync(file, "utf8"));

pkg.version = portVersion;

const source = pkg.scripts ?? {};
const names = Object.keys(source).filter((name) => !(name in portScripts));
const anchor = names.indexOf("build:dist-firefox");
names.splice(anchor === -1 ? names.length : anchor + 1, 0, ...Object.keys(portScripts));
pkg.scripts = Object.fromEntries(names.map((name) => [name, portScripts[name] ?? source[name]]));

// 与 prettier 对 JSON 的输出保持一致：两空格缩进、无尾逗号、结尾换行
writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`package.json: version=${pkg.version}，已补回 ${Object.keys(portScripts).length} 个移植版脚本`);

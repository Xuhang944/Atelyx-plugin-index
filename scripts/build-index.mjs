/**
 * 插件市场索引聚合脚本。
 *
 * 扫描 GitHub 上打了 `atelyx-plugin` topic 的仓库，逐个校验：
 * 仓库默认分支存在合法 `package.json`（name/version/main，atelyx 块含 type，代码类须有 main）即收录——
 * 插件 = git 仓库，最新提交即版本，无打包/Release 要求。
 * 校验通过后写入 `index.json`（按 star 降序，上限 500）。由 GitHub Actions 每 6 小时运行一次。
 *
 * 徽标不在索引中：App 侧按 repo owner 判定官方、按 endorsed.json 判定认可。
 */
import { writeFileSync } from "node:fs";

const TOPIC = "atelyx-plugin";
const MANIFEST = "package.json";
const CAP = 500;
// 已知插件类型（与 App 端 PluginType 一致；未知类型前向兼容跳过）。
const KNOWN_TYPES = new Set(["tool", "setting", "panel", "app", "node", "theme", "command", "background", "tableview"]);
const HEADERS = { "User-Agent": "atelyx-plugin-index", "Accept": "application/vnd.github+json" };
if (process.env.GH_TOKEN) HEADERS.Authorization = `Bearer ${process.env.GH_TOKEN}`;

async function gh(url) {
  const resp = await fetch(url, { headers: HEADERS });
  if (!resp.ok) throw new Error(`GitHub API ${resp.status}: ${url}`);
  return resp.json();
}

function validManifest(m) {
  if (!m || typeof m !== "object") return false;
  // package.json：name（反向域名 id）/version 必填；atelyx 块（type）必填。
  const need = ["name", "version"];
  if (!need.every((k) => typeof m[k] === "string" && m[k].length > 0)) return false;
  const ax = m.atelyx;
  if (!ax || typeof ax !== "object" || typeof ax.type !== "string" || !KNOWN_TYPES.has(ax.type)) return false;
  // main 仅在纯 theme 插件（无代码承载类型）时可省略，与 App 校验一致——
  // 未知附加类型按前向兼容跳过（KNOWN_TYPES 过滤后再判全 theme）。
  const types = Array.isArray(ax.types) ? ax.types.filter((t) => typeof t === "string" && KNOWN_TYPES.has(t)) : [];
  const themeOnly = ax.type === "theme" && types.every((t) => t === "theme");
  if (!themeOnly && !(typeof m.main === "string" && m.main.length > 0)) return false;
  return true;
}

async function fetchManifest(repo, branch) {
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${MANIFEST}`;
  const resp = await fetch(url, { headers: { "User-Agent": "atelyx-plugin-index" } });
  if (!resp.ok) return null;
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

async function main() {
  const items = [];
  let page = 1;
  while (page <= 10 && items.length < CAP) {
    const data = await gh(
      `https://api.github.com/search/repositories?q=topic:${TOPIC}&sort=stars&order=desc&per_page=100&page=${page}`,
    );
    const repos = data.items ?? [];
    if (repos.length === 0) break;
    for (const repo of repos) {
      if (items.length >= CAP) break;
      try {
        const manifest = await fetchManifest(repo.full_name, repo.default_branch);
        if (!validManifest(manifest)) continue;
        items.push({
          id: manifest.name,
          name: manifest.atelyx.name ?? manifest.name,
          tagline: manifest.atelyx.tagline ?? "",
          type: manifest.atelyx.type,
          repo: repo.full_name,
          defaultBranch: repo.default_branch,
          stars: repo.stargazers_count,
          updatedAt: repo.updated_at,
          topics: repo.topics ?? [],
        });
      } catch (e) {
        console.warn(`skip ${repo.full_name}: ${e.message}`);
      }
    }
    if (data.total_count <= page * 100) break;
    page++;
  }
  const out = { generatedAt: new Date().toISOString(), version: "v1", items };
  writeFileSync("index.json", JSON.stringify(out, null, 2) + "\n");
  console.log(`index.json 更新：${items.length} 个插件`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

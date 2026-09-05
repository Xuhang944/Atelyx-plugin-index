/**
 * 插件市场索引聚合脚本。
 *
 * 扫描 GitHub 上打了 `atelyx-plugin` topic 的仓库，逐个校验：
 * 1) 仓库默认分支存在 `atelyx.json` 且字段齐全（schemaVersion/id/name/version/type/main）
 * 2) 仓库有带 .zip 资产的 Release
 * 校验通过后写入 `index.json`（按 star 降序，上限 500）。由 GitHub Actions 每 6 小时运行一次。
 *
 * 徽标不在索引中：App 侧按 repo owner 判定官方、按 endorsed.json 判定认可。
 */
import { writeFileSync } from "node:fs";

const TOPIC = "atelyx-plugin";
const MANIFEST = "atelyx.json";
const CAP = 500;
const HEADERS = { "User-Agent": "atelyx-plugin-index", "Accept": "application/vnd.github+json" };
if (process.env.GH_TOKEN) HEADERS.Authorization = `Bearer ${process.env.GH_TOKEN}`;

async function gh(url) {
  const resp = await fetch(url, { headers: HEADERS });
  if (!resp.ok) throw new Error(`GitHub API ${resp.status}: ${url}`);
  return resp.json();
}

function validManifest(m) {
  if (!m || typeof m !== "object") return false;
  const need = ["id", "name", "version", "type", "main"];
  return (
    need.every((k) => typeof m[k] === "string" && m[k].length > 0) &&
    Number.isInteger(m.schemaVersion) &&
    m.schemaVersion > 0
  );
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

async function hasReleaseZip(repo) {
  const list = await gh(`https://api.github.com/repos/${repo}/releases?per_page=3`);
  return list.some((r) => (r.assets ?? []).some((a) => a.name.endsWith(".zip")));
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
        if (!(await hasReleaseZip(repo.full_name))) continue;
        items.push({
          id: manifest.id,
          name: manifest.name,
          tagline: manifest.tagline ?? "",
          type: manifest.type,
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

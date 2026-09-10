/**
 * 插件市场索引聚合脚本。
 *
 * 扫描 GitHub 上打了 `atelyx-plugin` topic 的仓库，逐个校验：
 * 仓库默认分支存在合法 `package.json`（name/version/main，atelyx 块含 type，代码类须有 main）即收录——
 * 插件 = git 仓库，最新提交即版本，无打包/Release 要求。
 * 校验通过后写入 `index.json`（按 star 降序，上限 500）。由 GitHub Actions 每 6 小时运行一次。
 *
 * 清单抓取失败（网络抖动/服务端错误）重试 2 次，仍取不到且上一轮已收录该仓库时沿用上一轮条目
 * （只刷新 star 与时间），避免一次抖动让正常插件从市场消失一个周期；404 或清单本身不合法属
 * 确定性失效，直接剔除。索引每轮全量重建，失效条目无需单独清理。
 *
 * 徽标不在索引中：App 侧按 repo owner 判定官方、按 endorsed.json 判定认可。
 */
import { readFileSync, writeFileSync } from "node:fs";

const TOPIC = "atelyx-plugin";
const MANIFEST = "package.json";
const CAP = 500;
// 清单抓取尝试次数（首次 + 2 次重试），间隔按次数递增；仍失败即视为暂时取不到。
const MANIFEST_ATTEMPTS = 3;
const RETRY_BASE_MS = 1500;
// 已知插件类型（与 App 端 PluginType 一致；未知类型前向兼容跳过）。
const KNOWN_TYPES = new Set(["tool", "setting", "panel", "app", "node", "theme", "command", "background", "tableview"]);
const HEADERS = { "User-Agent": "atelyx-plugin-index", "Accept": "application/vnd.github+json" };
if (process.env.GH_TOKEN) HEADERS.Authorization = `Bearer ${process.env.GH_TOKEN}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/** 上一轮索引条目（按 repo 检索）；文件缺失/损坏时视为空，本轮退化为全量重建。 */
function readPreviousItems() {
  try {
    const prev = JSON.parse(readFileSync("index.json", "utf8"));
    return Array.isArray(prev.items) ? prev.items : [];
  } catch {
    return [];
  }
}

/**
 * 取插件清单，区分失败性质（决定是重试、剔除还是沿用上一轮）：
 * - ok：取到且解析成功；
 * - invalid：404，或 200 但正文非 JSON——确定性失效，剔除；
 * - unavailable：重试用尽仍是网络/服务端错误（含限流）——暂时取不到，可沿用上一轮条目。
 */
async function fetchManifest(repo, branch) {
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${MANIFEST}`;
  let reason = "unknown";
  for (let attempt = 1; attempt <= MANIFEST_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(url, { headers: { "User-Agent": "atelyx-plugin-index" } });
      if (resp.status === 404) return { state: "invalid" };
      if (resp.ok) {
        try {
          return { state: "ok", manifest: await resp.json() };
        } catch {
          return { state: "invalid" };
        }
      }
      reason = `HTTP ${resp.status}`;
    } catch (e) {
      reason = e.message;
    }
    if (attempt < MANIFEST_ATTEMPTS) await sleep(RETRY_BASE_MS * attempt);
  }
  return { state: "unavailable", reason };
}

async function main() {
  const previousByRepo = new Map(readPreviousItems().map((item) => [item.repo, item]));
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
      const result = await fetchManifest(repo.full_name, repo.default_branch);
      if (result.state === "unavailable") {
        const prev = previousByRepo.get(repo.full_name);
        if (!prev) {
          console.warn(`${repo.full_name} 清单暂时取不到（${result.reason}），本轮不收录`);
          continue;
        }
        // star/时间取本轮搜索（新鲜元数据），清单字段沿用上一轮，避免抖动让插件从市场消失。
        items.push({ ...prev, stars: repo.stargazers_count, updatedAt: repo.updated_at });
        console.warn(`${repo.full_name} 清单暂时取不到（${result.reason}），沿用上一轮条目`);
        continue;
      }
      if (result.state === "invalid" || !validManifest(result.manifest)) continue;
      const manifest = result.manifest;
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

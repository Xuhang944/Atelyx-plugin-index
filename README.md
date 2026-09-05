# atelyx-plugin-index

Atelyx 插件市场索引仓库。Atelyx 内置市场从这里读取插件清单、自动聚合收录；本仓库公开可见。

## 如何上架你的插件

零申请、零审核，三步即可：

1. **写好插件**：插件根目录放一份 `atelyx.json` 清单（含 `schemaVersion`、`id`、`name`、`version`、`type`、`main` 等字段）+ 入口脚本。
2. **发布 Release**：把插件文件打成 zip（zip 根含 `atelyx.json`，或置于唯一顶层目录），上传到仓库的 GitHub Release。
3. **打标签**：给仓库添加 GitHub topic：`atelyx-plugin`。

市场索引每 6 小时扫描一次带 `atelyx-plugin` topic 的仓库，校验清单与 Release zip 后自动收录。收录后，所有 Atelyx 用户都能在内置市场中搜索并安装你的插件。

> 发布者对插件的质量、安全与合规负全部责任。`atelyx.json` 完整字段与插件 API 见 Atelyx 的插件开发文档。

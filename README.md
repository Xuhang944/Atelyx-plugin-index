# atelyx-plugin-index

Atelyx 插件市场索引仓库。Atelyx 内置市场从这里读取插件清单、自动聚合收录；本仓库公开可见。

## 如何上架你的插件

零申请、零审核，三步即可：

1. **写好插件**：插件根目录放一份 `package.json` 清单（含 `name`、`version`、`main` 与 `atelyx` 块——`type` 等元数据）+ 入口源码（默认导出 `apply(ctx)`）。字段说明见 Atelyx 的插件开发文档。
2. **推送到 GitHub**：插件 = git 仓库，仓库最新提交即发布版本，无需打包。
3. **打标签**：给仓库添加 GitHub topic：`atelyx-plugin`。

市场索引每 6 小时扫描一次带 `atelyx-plugin` topic 的仓库，校验清单后自动收录。收录后，所有 Atelyx 用户都能在内置市场中搜索并安装你的插件。

> 发布者对插件的质量、安全与合规负全部责任。

# 居家 Bot

上传户型之后，先交互确认平面和软装，再谈物品归位。当前仓库只做第一段的可运行骨架。

场景 JSON 是唯一事实来源。识别、平面编辑、三维预览和替换命令都只读写它。

## 现在做

- 手写两室一厅：`fixtures/two-bedroom.json`
- 目录：`fixtures/catalog.json`，由 `@jujia/catalog` 读取
- 换地板、换沙发、换门窗款式、改柜体容量

## 现在不做

照片识别、杂物归位建议、施工图、报价、照片级渲染、从效果图反推模型。

## 分支

并行开发各自使用独立工作树，只改自己的目录：

| 分支 | 目录 |
| --- | --- |
| `codex/scene-schema` | `packages/scene` |
| `codex/commands` | `packages/commands` |
| `codex/preview-3d` | `packages/preview-3d` |
| `codex/web-3d` | `apps/web` |

不要改 `fixtures/`、`docs/`、各包的 `src/types.ts`，也不要改别人的目录。契约有问题就在提交说明里指出，不要悄悄改类型。

## 命令

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm --filter @jujia/web dev
```

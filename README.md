# 居家 Bot

上传户型之后，先交互确认平面和软装，再给杂物归位建议。归位只读，不改场景 JSON。

场景 JSON 是唯一事实来源。识别、平面编辑、三维预览和替换命令都只读写它。

## 现在做

- 手写两室一厅：`fixtures/two-bedroom.json`
- 目录：`fixtures/catalog.json`，由 `@jujia/catalog` 读取
- 换地板、换沙发和茶几、换门窗款式、改柜体容量。客厅、主卧、次卧已摆上 Poly Haven 的桌、床和书架
- 确认之后的杂物归位：`@jujia/clutter` 对示例清单给建议，网页点一项就在三维里高亮对应柜体或家具

## 现在不做

照片识别、施工图、报价、照片级渲染、从效果图反推模型。归位只建议，不改场景。

## 分支

并行开发各自使用独立工作树，只改自己的目录：

| 分支 | 目录 |
| --- | --- |
| `codex/scene-schema` | `packages/scene` |
| `codex/commands` | `packages/commands` |
| `codex/preview-3d` | `packages/preview-3d` |
| `codex/web-3d` | `apps/web` |
| `codex/clutter` | `packages/clutter` |

不要改 `fixtures/`、`docs/`、各包的 `src/types.ts`，也不要改别人的目录。契约有问题就在提交说明里指出，不要悄悄改类型。

## 命令

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm --filter @jujia/web dev
```

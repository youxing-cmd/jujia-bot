# 第一版验收

统筹分支只合并同时满足下面条件的提交。

## 场景包

- `pnpm --filter @jujia/scene test` 通过
- `pnpm --filter @jujia/scene typecheck` 通过
- `fixtures/two-bedroom.json` 可以被 `parseScene` 解析
- 覆盖 `docs/algorithms.md` 里列出的拒绝条件，每条至少一个测试

## 命令包

- 测试和类型检查通过
- 四类命令的成功和失败路径都有测试
- 失败不修改入参，可用调用前后的 `JSON.stringify` 比较

## 预览包

- 测试和类型检查通过
- 示例场景网格数为 32
- 客厅地板颜色是 `#C4A574`
- 沙发位置 y 是 0.41，z 是 1.6
- 入户门 `size.x` 是 0.9，换样式不会出现在预览函数里；预览只读场景

## 界面

- `pnpm --filter @jujia/web typecheck` 和 `build` 通过
- 打开后能看到两室一厅，可以轨道观察
- 能把客厅地板换成地砖，把沙发换成双人沙发，把主卧柜体宽度改到 1.6 并看到容积变化，把主卧门换成平板门且宽度仍是 0.8
- 导出的 JSON 是命令作用后的场景
- 把场景状态改成草稿后，界面上的命令失败并给出原因
- 界面文案使用中文

## 合并顺序

1. `codex/scene-schema`
2. `codex/commands` 与 `codex/preview-3d` 可以同时合，只要都不改共享文件
3. `codex/web-3d` 最后合，它要调用前三个包的真实实现

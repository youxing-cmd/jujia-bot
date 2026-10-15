# 算法（实现必须一致）

类型字段以各包 `src/types.ts` 为准。行为以本文为准。

## 解析 `parseScene`

用 zod 解析，失败时抛 `SceneParseError`，`name` 为 `SceneParseError`，`message` 说明第一条原因。成功返回与输入等价、但不再共享引用的场景对象。

必须拒绝：

- `version` 不是 `1.0.0`，或 `units` 不是 `m`
- 没有楼层，或房间多边形少于 3 个点
- 多边形顺时针、自交，或鞋带面积绝对值不大于 1
- 房间、墙、门窗、槽位的 id 在本层重复；楼层 id 全局重复
- 门窗的 `wallId` 不存在，或 `offset < 0`，或 `offset + width` 大于墙长加 `1e-6`
- 墙长小于 `1e-6`
- 槽位的 `roomId` 不存在，或槽位中心不在所属房间多边形内（边界算内部）
- 房间引用的材质不在 `scene.materials` 中
- 材质 id 重复，或颜色不是 `#` 加 6 位十六进制
- 柜体槽位缺少 `capacity`，或容积、层数与公式不一致
- 家具槽位带了 `capacity`
- `scale.confirmed === true` 且方法是 `user_edge` 或 `dimension_label`，但没有大于 0 的 `metersPerPixel`
- `ceilingHeight` 不在 2.2 到 4.0 之间
- 门窗的 `sill + height` 大于所在楼层的 `ceilingHeight`

`authored_meters` 可以没有 `metersPerPixel`。点在多边形内用射线法，边上的点算内部。

## 目录

`@jujia/catalog` 只暴露 `fixtures/catalog.json` 的内容。按 id 查找，找不到返回 `undefined`。不要增删条目。

## 命令 `applyCommand(scene, command)`

先深拷贝。失败时返回 `{ ok: false, code, message }`，并且原始 `scene` 的 JSON 不变。成功返回新场景。

顺序：

1. `status === "frozen"` → `frozen`
2. `status !== "plan_confirmed"` 或 `scale.confirmed !== true` → `not_confirmed`
3. 命令形状不完整、数字不是有限数 → `invalid_command`

`change_material`：

- 找不到房间 → `unknown_target`
- 目录没有该材质 → `unknown_material`
- 地面命令的材质类别不是 `floor`，或墙面不是 `wall` → `category_mismatch`
- 把目录材质写入 `scene.materials`（已有则覆盖同 id 字段），再改 `floorMaterialId` 或 `wallMaterialId`
- 多边形、门窗、槽位保持不变

`change_opening_style`：

- 找不到门窗 → `unknown_target`
- 目录没有该款式 → `unknown_style`
- 款式的 `kind` 和门窗不一致 → `category_mismatch`
- 只改 `styleId`

`replace_furniture`：

- 找不到槽位 → `unknown_target`
- 槽位不是 `furniture`，或物品类别是 `cabinet` → `wrong_slot_kind`
- 目录没有该物品 → `unknown_item`
- 物品宽、深、高任一超过槽位 `maxWidth`、`maxDepth`、`maxHeight` → `footprint_exceeds_slot`
- 写入 `catalogItemId` 和当前 `width`、`depth`、`height`。不改位置、旋转和上限

`resize_cabinet`：

- 找不到槽位 → `unknown_target`
- 不是 `cabinet` → `wrong_slot_kind`
- 任一尺寸小于 0.2 → `invalid_command`
- 任一尺寸超过对应上限 → `footprint_exceeds_slot`
- 写入当前尺寸，并按容量公式重写 `capacity`

## 预览 `buildPreviewModel(scene)`

不抛异常。缺材质时地板用 `#CCCCCC`，粗糙度 1，金属度 0。

网格数量等于房间数 + 墙数 + 门窗数 + 槽位数。示例场景是 25。

- 地板：`id` 为 `{roomId}:floor`，`polygon` 为房间多边形，`position` 为 `{x:0,y:elevation,z:0}`，`size` 为 `{x:0,y:0.02,z:0}`，`rotationY` 为 0。颜色和粗糙度来自 `floorMaterialId`。
- 墙：中点映射为位置，`y = height / 2 + elevation`。高度缺省用层高。`rotationY = atan2(b.y - a.y, b.x - a.x)`。`size.x` 是墙长，`size.y` 是高度，`size.z` 是厚度。颜色优先用 id 为 `wall_white` 的材质，否则用第一份墙面材质。
- 门窗：沿墙，中心在 `offset + width / 2`。`y = sill + height / 2 + elevation`。旋转与所在墙相同。`size` 为 `{x:width,y:height,z:0.06}`。颜色按 `styleId`：`door_flat #8C6A4A`，`door_glass #9BB8C4`，`window_sliding #A9C7D6`，`window_casement #8FB4C4`。没有款式时门用 `#8C6A4A`，窗用 `#A9C7D6`。
- 家具和柜体：使用槽位当前宽深高，不用目录尺寸。`position` 为 `{x:slot.x, y:height/2+elevation, z:slot.y}`，`rotationY` 为槽位旋转，`size` 为 `{x:width,y:height,z:depth}`。`sofa_210 #4E6A78`，`sofa_160 #8C6E5A`，`cabinet_120 #A67C52`。其他家具 `#4E6A78`，其他柜体 `#A67C52`。

`role` 分别是 `floor`、`wall`、`door`、`window`、`furniture`、`cabinet`。门窗写 `openingId`，地板写 `roomId`，槽位写 `slotId` 和 `roomId`。

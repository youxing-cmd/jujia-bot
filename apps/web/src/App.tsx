import { getItem, getMaterial, getOpeningStyle, listMaterials, listOpeningStyles } from "@jujia/catalog";
import { demoClutter, suggestPlacements } from "@jujia/clutter";
import type { Command } from "@jujia/commands";
import type { Scene, SceneStatus } from "@jujia/scene";
import { useMemo, useState } from "react";
import fixture from "../../../fixtures/two-bedroom.json";
import { applyCommand, buildPreviewModel, parseScene } from "./api";
import { PreviewStage } from "./preview";

type Notice = { tone: "idle" | "ok" | "error"; text: string };

const STATUS_LABEL: Record<SceneStatus, string> = {
  draft: "草稿",
  plan_confirmed: "平面已确认",
  frozen: "已冻结",
};

function firstLevel(scene: Scene) {
  return scene.levels[0];
}

function explainFailure(error: unknown, fallback: string) {
  const detail = error instanceof Error ? error.message : "";
  if (!detail || detail.includes("NOT_IMPLEMENTED")) return fallback;
  return detail;
}

function loadScene(): { scene: Scene | null; error: string | null } {
  try {
    return { scene: parseScene(fixture), error: null };
  } catch (error) {
    return { scene: null, error: explainFailure(error, "场景解析还没有接上，这套户型暂时读不进来。") };
  }
}

function wardrobeSize(scene: Scene | null) {
  const slot = scene?.levels[0]?.slots.find((item) => item.id === "slot_wardrobe");
  return {
    width: slot?.width ?? 1.2,
    depth: slot?.depth ?? 0.55,
    height: slot?.height ?? 2.2,
  };
}

function downloadScene(scene: Scene) {
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${scene.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const initial = useMemo(loadScene, []);
  const [scene, setScene] = useState<Scene | null>(initial.scene);
  const [notice, setNotice] = useState<Notice>({ tone: "idle", text: "命令结果会显示在这里。" });
  const [showJson, setShowJson] = useState(false);
  const [cabinetSize, setCabinetSize] = useState(() => wardrobeSize(initial.scene));
  const [pickedItemId, setPickedItemId] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!scene) return { model: null, error: null as string | null };
    try {
      return { model: buildPreviewModel(scene), error: null };
    } catch (error) {
      return { model: null, error: explainFailure(error, "三维网格还没有接上，房子暂时显示不出来。右侧仍然可以改场景并导出。") };
    }
  }, [scene]);

  const suggestion = useMemo(() => (scene ? suggestPlacements(scene, demoClutter) : null), [scene]);

  if (!scene || !suggestion) {
    return (
      <main className="stage">
        <div className="blocker">
          <p className="eyebrow">居家</p>
          <h1>两室一厅还打不开</h1>
          <p className="meta">{initial.error}</p>
        </div>
      </main>
    );
  }

  const level = firstLevel(scene);
  const living = level?.rooms.find((room) => room.id === "living");
  const wardrobe = level?.slots.find((slot) => slot.id === "slot_wardrobe");
  const masterDoor = level?.openings.find((opening) => opening.id === "door_master");
  const floorMaterials = listMaterials().filter((material) => material.category === "floor");
  const wallMaterials = listMaterials().filter((material) => material.category === "wall");
  const doorStyles = listOpeningStyles().filter((style) => style.kind === "door");
  const furnitureChoices = [
    { slotId: "slot_sofa", title: "客厅沙发", note: "新沙发不能超过槽位上限。", options: ["sofa_210", "sofa_160"] },
    { slotId: "slot_coffee", title: "客厅茶几", note: "咖啡桌和茶桌都能放进这个位置。", options: ["table_coffee", "table_tea"] },
  ] as const;

  function run(command: Command) {
    const result = applyCommand(scene!, command);
    if (result.ok) {
      setScene(result.scene);
      setNotice({ tone: "ok", text: "已经写进场景。导出的 JSON 就是这一版。" });
      return;
    }
    setNotice({ tone: "error", text: result.message });
  }

  function setStatus(status: SceneStatus) {
    setScene((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.status = status;
      return next;
    });
    setNotice({
      tone: "idle",
      text: status === "draft" ? "场景已改成草稿。现在下命令会失败，并说明原因。" : `场景状态已改为${STATUS_LABEL[status]}。`,
    });
  }

  const livingFloor = living ? getMaterial(living.floorMaterialId) : undefined;
  const livingWall = living ? getMaterial(living.wallMaterialId) : undefined;
  const doorStyle = masterDoor?.styleId ? getOpeningStyle(masterDoor.styleId) : undefined;
  const picked = suggestion.ok ? suggestion.placements.find((item) => item.itemId === pickedItemId) : undefined;
  const highlight = picked ? { slotId: picked.slotId, label: `${demoClutter.find((item) => item.id === picked.itemId)?.name ?? picked.itemId} · 第 ${picked.shelf} 层` } : null;

  return (
    <main className="app">
      <section className="stage" aria-label="三维预览">
        <div className="stage-copy">
          <p className="eyebrow">居家</p>
          <h1>{scene.name}</h1>
          <p className="hint">拖动旋转，滚轮缩放。只改软装，不拆墙。</p>
          <p className="credit">沙发、桌、床、书架和衣柜来自 Poly Haven，门来自 Kenney，都是 CC0。</p>
        </div>
        {preview.model && level ? <PreviewStage model={preview.model} rooms={level.rooms} scene={scene} highlight={highlight} /> : null}
        {preview.error ? <div className="stage-note">{preview.error}</div> : null}
      </section>
      <aside className="panel">
        <div className="panel-head">
          <h2>这一套</h2>
          <p className="status">{STATUS_LABEL[scene.status]}</p>
        </div>

        <section className="section">
          <h3>场景状态</h3>
          <p className="meta">墙和比例确认之后才能换。草稿和冻结都会拒绝命令。</p>
          <div className="status-row">
            <button type="button" className="text-button" onClick={() => setStatus("draft")}>改成草稿</button>
            <button type="button" className="text-button" onClick={() => setStatus("plan_confirmed")}>恢复已确认</button>
            <button type="button" className="text-button" onClick={() => setStatus("frozen")}>冻结</button>
          </div>
        </section>

        <section className="section" aria-label="杂物归位">
          <h3>杂物归位</h3>
          <p className="meta">平面和比例确认之后，按这 11 件示例给建议。只看不改，场景 JSON 保持原样。</p>
          {suggestion.ok ? (
            <ul className="placed clutter-list">
              {demoClutter.map((item) => {
                const placed = suggestion.placements.find((entry) => entry.itemId === item.id);
                const missed = suggestion.unplaced.find((entry) => entry.itemId === item.id);
                const detail = placed
                  ? `${placed.roomName} · ${placed.hostName} · 第 ${placed.shelf} 层${placed.shelfCount > 1 ? `起共 ${placed.shelfCount} 层` : ""}`
                  : missed?.reason ?? "还没有位置";
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="choice clutter-row"
                      aria-pressed={pickedItemId === item.id}
                      disabled={!placed}
                      onClick={() => setPickedItemId((current) => (current === item.id ? null : item.id))}
                    >
                      <span>{item.name}</span>
                      <span>{detail}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="meta">{suggestion.message}</p>
          )}
        </section>

        <section className="section">
          <h3>客厅地面</h3>
          <p className="meta">现在是{livingFloor?.name ?? living?.floorMaterialId ?? "未设置"}。换材质不改房间形状。</p>
          <div className="choices">
            {floorMaterials.map((material) => (
              <button
                key={material.id}
                type="button"
                className="choice"
                aria-pressed={living?.floorMaterialId === material.id}
                onClick={() => run({ type: "change_material", roomId: "living", surface: "floor", materialId: material.id })}
              >
                {material.name}
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <h3>客厅墙面</h3>
          <p className="meta">现在是{livingWall?.name ?? living?.wallMaterialId ?? "未设置"}。</p>
          <div className="choices">
            {wallMaterials.map((material) => (
              <button
                key={material.id}
                type="button"
                className="choice"
                aria-pressed={living?.wallMaterialId === material.id}
                onClick={() => run({ type: "change_material", roomId: "living", surface: "wall", materialId: material.id })}
              >
                {material.name}
              </button>
            ))}
          </div>
        </section>

        {furnitureChoices.map((group) => {
          const slot = level?.slots.find((item) => item.id === group.slotId);
          const current = slot?.catalogItemId ? getItem(slot.catalogItemId) : undefined;
          return (
            <section className="section" key={group.slotId}>
              <h3>{group.title}</h3>
              <p className="meta">
                现在是{current?.name ?? "空槽位"}
                {slot ? `，${slot.width} × ${slot.depth} × ${slot.height} 米` : ""}。{group.note}
              </p>
              <div className="choices">
                {group.options.map((id) => {
                  const item = getItem(id);
                  if (!item) return null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="choice"
                      aria-pressed={slot?.catalogItemId === item.id}
                      onClick={() => run({ type: "replace_furniture", slotId: group.slotId, catalogItemId: item.id })}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        <section className="section">
          <h3>已经摆好</h3>
          <p className="meta">这些位置只放一件，避免把床或书架换进沙发槽位。</p>
          <ul className="placed">
            {["slot_side", "slot_shelf", "slot_bed_master", "slot_nightstand", "slot_bed_second", "slot_desk"].map((slotId) => {
              const slot = level?.slots.find((item) => item.id === slotId);
              const item = slot?.catalogItemId ? getItem(slot.catalogItemId) : undefined;
              const room = level?.rooms.find((entry) => entry.id === slot?.roomId);
              return (
                <li key={slotId}>
                  {room?.name ?? "房间"} · {item?.name ?? slotId}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="section">
          <h3>主卧柜体</h3>
          <p className="meta">
            上限 {wardrobe ? `${wardrobe.maxWidth} × ${wardrobe.maxDepth} × ${wardrobe.maxHeight}` : "—"} 米。
            单边不能小于 0.2 米。
            {wardrobe?.capacity ? ` 容积 ${Number(wardrobe.capacity.volumeM3.toFixed(3))} 立方米和 ${wardrobe.capacity.shelves} 层。` : ""}
          </p>
          <div className="dimensions">
            {(["width", "depth", "height"] as const).map((key) => (
              <label key={key}>
                <span>{key === "width" ? "宽" : key === "depth" ? "深" : "高"}</span>
                <input
                  type="number"
                  min={0.2}
                  step={0.05}
                  value={cabinetSize[key]}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setCabinetSize((current) => ({ ...current, [key]: value }));
                  }}
                />
              </label>
            ))}
          </div>
          <div className="actions">
            <button
              type="button"
              className="solid"
              onClick={() =>
                run({
                  type: "resize_cabinet",
                  slotId: "slot_wardrobe",
                  width: cabinetSize.width,
                  depth: cabinetSize.depth,
                  height: cabinetSize.height,
                })
              }
            >
              改柜体尺寸
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const next = { width: 1.6, depth: wardrobe?.depth ?? cabinetSize.depth, height: wardrobe?.height ?? cabinetSize.height };
                setCabinetSize(next);
                run({ type: "resize_cabinet", slotId: "slot_wardrobe", ...next });
              }}
            >
              宽度改到 1.6
            </button>
          </div>
        </section>

        <section className="section">
          <h3>主卧门</h3>
          <p className="meta">
            现在是{doorStyle?.name ?? "未选款式"}。宽度仍是 {masterDoor ? Number(masterDoor.width.toFixed(3)) : "—"} 米，换款式不会改宽。
          </p>
          <div className="choices">
            {doorStyles.map((style) => (
              <button
                key={style.id}
                type="button"
                className="choice"
                aria-pressed={masterDoor?.styleId === style.id}
                onClick={() => run({ type: "change_opening_style", openingId: "door_master", styleId: style.id })}
              >
                {style.name}
              </button>
            ))}
          </div>
        </section>

        <section className="section">
          <h3>带走这版</h3>
          <div className="actions">
            <button type="button" className="solid" onClick={() => downloadScene(scene)}>导出 JSON</button>
            <button type="button" className="text-button" onClick={() => setShowJson((value) => !value)}>
              {showJson ? "收起 JSON" : "查看 JSON"}
            </button>
          </div>
          {showJson ? <pre className="json-view">{JSON.stringify(scene, null, 2)}</pre> : null}
        </section>

        <p className="reason" data-tone={notice.tone} role="status">{notice.text}</p>
      </aside>
    </main>
  );
}

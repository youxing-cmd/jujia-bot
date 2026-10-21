import { getItem, getOpeningStyle, listGltfModels, type GltfModel } from "@jujia/catalog";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import type { PreviewMesh, PreviewModel } from "@jujia/preview-3d";
import type { Room, Scene } from "@jujia/scene";
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { fitGltf } from "./fit-gltf";

const HOUSE_CENTER: [number, number, number] = [4.3, 0.9, 3.5];
const FRAME_DEPTH = 0.22;
const FRAME_COLOR = "#f4f0e8";

for (const model of listGltfModels()) useGLTF.preload(model.url);

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function floorGeometry(mesh: PreviewMesh) {
  const polygon = mesh.polygon ?? [];
  const thickness = mesh.size.y > 0 ? mesh.size.y : 0.02;
  if (polygon.length < 3) return new THREE.BoxGeometry(0.01, thickness, 0.01);
  const shape = new THREE.Shape();
  shape.moveTo(polygon[0].x, -polygon[0].y);
  for (const point of polygon.slice(1)) shape.lineTo(point.x, -point.y);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -thickness, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function FloorMesh({ mesh }: { mesh: PreviewMesh }) {
  const geometry = useMemo(() => floorGeometry(mesh), [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[mesh.position.x, mesh.position.y, mesh.position.z]} receiveShadow>
      <meshStandardMaterial color={mesh.color} roughness={mesh.roughness} metalness={mesh.metalness} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SolidBox({
  size,
  color,
  roughness,
  metalness,
  opacity = 1,
}: {
  size: { x: number; y: number; z: number };
  color: string;
  roughness: number;
  metalness: number;
  opacity?: number;
}) {
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[size.x, size.y, size.z]} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

function BoxMesh({ mesh }: { mesh: PreviewMesh }) {
  const proud = mesh.role === "door" || mesh.role === "window";
  const depth = proud ? Math.max(mesh.size.z, 0.24) : mesh.size.z;
  return (
    <mesh
      position={[mesh.position.x, mesh.position.y, mesh.position.z]}
      rotation={[0, mesh.rotationY, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[mesh.size.x, mesh.size.y, depth]} />
      <meshStandardMaterial
        color={mesh.color}
        roughness={mesh.roughness}
        metalness={mesh.metalness}
        side={THREE.DoubleSide}
        transparent={mesh.role === "window"}
        opacity={mesh.role === "window" ? 0.78 : 1}
      />
    </mesh>
  );
}

function localOffset(origin: PreviewMesh, target: PreviewMesh) {
  const theta = origin.rotationY;
  const dx = target.position.x - origin.position.x;
  const dy = target.position.y - origin.position.y;
  const dz = target.position.z - origin.position.z;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: dx * c - dz * s, y: dy, z: dx * s + dz * c };
}

function holesFor(wall: PreviewMesh, meshes: PreviewMesh[]) {
  return meshes.filter((mesh) => {
    if (mesh.role !== "door" && mesh.role !== "window") return false;
    const delta = Math.atan2(Math.sin(mesh.rotationY - wall.rotationY), Math.cos(mesh.rotationY - wall.rotationY));
    if (Math.abs(delta) > 0.02) return false;
    return Math.abs(localOffset(wall, mesh).z) <= wall.size.z * 0.75 + 0.02;
  });
}

function subtractIntervals(start: number, end: number, cuts: Array<[number, number]>) {
  const sorted = cuts
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number])
    .filter(([a, b]) => b - a > 1e-4)
    .sort((left, right) => left[0] - right[0]);
  const free: Array<[number, number]> = [];
  let cursor = start;
  for (const [a, b] of sorted) {
    const from = Math.max(start, a);
    const to = Math.min(end, b);
    if (from > cursor + 1e-4) free.push([cursor, from]);
    cursor = Math.max(cursor, to);
  }
  if (end > cursor + 1e-4) free.push([cursor, end]);
  return free;
}

function wallPieces(wall: PreviewMesh, holes: PreviewMesh[]) {
  const x0 = -wall.size.x / 2;
  const x1 = wall.size.x / 2;
  const y0 = -wall.size.y / 2;
  const y1 = wall.size.y / 2;
  const rects = holes
    .map((hole) => {
      const offset = localOffset(wall, hole);
      return {
        x0: Math.max(x0, offset.x - hole.size.x / 2),
        x1: Math.min(x1, offset.x + hole.size.x / 2),
        y0: Math.max(y0, offset.y - hole.size.y / 2),
        y1: Math.min(y1, offset.y + hole.size.y / 2),
      };
    })
    .filter((rect) => rect.x1 - rect.x0 > 1e-4 && rect.y1 - rect.y0 > 1e-4);

  const cuts = [x0, x1];
  for (const rect of rects) cuts.push(rect.x0, rect.x1);
  cuts.sort((a, b) => a - b);

  const pieces: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const left = cuts[index];
    const right = cuts[index + 1];
    if (right - left < 1e-4) continue;
    const mid = (left + right) / 2;
    const covered = rects
      .filter((rect) => rect.x0 < mid && rect.x1 > mid)
      .map((rect) => [rect.y0, rect.y1] as [number, number]);
    for (const [bottom, top] of subtractIntervals(y0, y1, covered)) {
      pieces.push({ x: (left + right) / 2, y: (bottom + top) / 2, w: right - left, h: top - bottom });
    }
  }
  return pieces;
}

function WallMesh({ mesh, holes }: { mesh: PreviewMesh; holes: PreviewMesh[] }) {
  const pieces = useMemo(() => wallPieces(mesh, holes), [mesh, holes]);
  return (
    <group position={[mesh.position.x, mesh.position.y, mesh.position.z]} rotation={[0, mesh.rotationY, 0]}>
      {pieces.map((piece) => (
        <mesh key={`${piece.x}:${piece.y}:${piece.w}:${piece.h}`} position={[piece.x, piece.y, 0]} castShadow receiveShadow>
          <boxGeometry args={[piece.w, piece.h, mesh.size.z]} />
          <meshStandardMaterial color={mesh.color} roughness={mesh.roughness} metalness={mesh.metalness} />
        </mesh>
      ))}
    </group>
  );
}

function frameBars(width: number, height: number, depth: number, border: number, mullion: number, variant: "sliding" | "casement") {
  const innerH = height - border * 2;
  const innerW = width - border * 2;
  const bars = [
    { position: [0, height / 2 - border / 2, 0] as [number, number, number], size: [width, border, depth] as [number, number, number] },
    { position: [0, -height / 2 + border / 2, 0] as [number, number, number], size: [width, border, depth] as [number, number, number] },
    { position: [-width / 2 + border / 2, 0, 0] as [number, number, number], size: [border, innerH, depth] as [number, number, number] },
    { position: [width / 2 - border / 2, 0, 0] as [number, number, number], size: [border, innerH, depth] as [number, number, number] },
    { position: [0, 0, 0] as [number, number, number], size: [mullion, innerH, depth * 0.86] as [number, number, number] },
  ];
  if (variant === "casement") {
    bars.push({ position: [0, 0, 0], size: [innerW, mullion, depth * 0.86] });
  }
  return bars;
}

function WindowFrame({ mesh, variant }: { mesh: PreviewMesh; variant: "sliding" | "casement" }) {
  const width = mesh.size.x;
  const height = mesh.size.y;
  const border = Math.min(0.07, width * 0.12, height * 0.16);
  const mullion = Math.min(0.045, border);
  const bars = frameBars(width, height, FRAME_DEPTH, border, mullion, variant);
  const glassDepth = 0.02;
  const panes =
    variant === "casement"
      ? [
          { x: -width / 4, y: height / 4 },
          { x: width / 4, y: height / 4 },
          { x: -width / 4, y: -height / 4 },
          { x: width / 4, y: -height / 4 },
        ]
      : [
          { x: -width / 4, y: 0 },
          { x: width / 4, y: 0 },
        ];
  const paneW = variant === "casement" ? (width - border * 2 - mullion) / 2 : (width - border * 2 - mullion) / 2;
  const paneH = variant === "casement" ? (height - border * 2 - mullion) / 2 : height - border * 2;
  return (
    <group position={[mesh.position.x, mesh.position.y, mesh.position.z]} rotation={[0, mesh.rotationY, 0]}>
      {bars.map((bar, index) => (
        <mesh key={index} position={bar.position} castShadow receiveShadow>
          <boxGeometry args={bar.size} />
          <meshStandardMaterial color={FRAME_COLOR} roughness={0.42} metalness={0.04} />
        </mesh>
      ))}
      {panes.map((pane) => (
        <mesh key={`${pane.x}:${pane.y}`} position={[pane.x, pane.y, 0]}>
          <boxGeometry args={[Math.max(paneW, 0.02), Math.max(paneH, 0.02), glassDepth]} />
          <meshStandardMaterial color={mesh.color} transparent opacity={0.38} roughness={0.06} metalness={0.12} />
        </mesh>
      ))}
    </group>
  );
}

function isGlassMaterial(material: THREE.Material) {
  const named = /glass/i.test(material.name);
  const faded = material.transparent && "opacity" in material && material.opacity < 0.95;
  return named || faded;
}

function prepareClone(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const glass = materials.some(isGlassMaterial);
    if (node.name.includes("(%ignore)") && !glass) mesh.visible = false;
    if (!glass) return;
    for (const material of materials) {
      material.transparent = true;
      material.depthWrite = false;
      material.side = THREE.DoubleSide;
    }
  });
}

function FittedObject({ spec, target }: { spec: GltfModel; target: { x: number; y: number; z: number } }) {
  const gltf = useGLTF(spec.url);
  const object = useMemo(() => {
    const clone = gltf.scene.clone(true);
    prepareClone(clone);
    fitGltf(clone, spec, target);
    return clone;
  }, [gltf.scene, spec, target.x, target.y, target.z]);
  return <primitive object={object} />;
}

function gltfFor(scene: Scene, mesh: PreviewMesh): GltfModel | undefined {
  const level = scene.levels[0];
  if (!level) return undefined;
  if (mesh.slotId) {
    const slot = level.slots.find((item) => item.id === mesh.slotId);
    const catalogItem = slot?.catalogItemId ? getItem(slot.catalogItemId) : undefined;
    if (catalogItem?.model.kind === "gltf") return catalogItem.model;
  }
  if (mesh.role === "door" && mesh.openingId) {
    const opening = level.openings.find((item) => item.id === mesh.openingId);
    const style = opening?.styleId ? getOpeningStyle(opening.styleId) : undefined;
    if (style?.model?.kind === "gltf") return style.model;
  }
  return undefined;
}

function windowVariant(scene: Scene, openingId?: string): "sliding" | "casement" {
  const opening = scene.levels[0]?.openings.find((item) => item.id === openingId);
  return opening?.styleId === "window_casement" ? "casement" : "sliding";
}

function FittedModel({ mesh, spec }: { mesh: PreviewMesh; spec: GltfModel }) {
  const proud = mesh.role === "door";
  const fallbackSize = {
    x: mesh.size.x,
    y: mesh.size.y,
    z: proud ? Math.max(mesh.size.z, 0.24) : mesh.size.z,
  };
  const target = { x: mesh.size.x, y: mesh.size.y, z: mesh.size.z };
  const fallback = <SolidBox size={fallbackSize} color={mesh.color} roughness={mesh.roughness} metalness={mesh.metalness} />;
  return (
    <group position={[mesh.position.x, mesh.position.y + 0.004, mesh.position.z]} rotation={[0, mesh.rotationY, 0]}>
      <ModelBoundary key={spec.url} fallback={fallback}>
        <Suspense fallback={fallback}>
          <FittedObject spec={spec} target={target} />
        </Suspense>
      </ModelBoundary>
    </group>
  );
}

function centroid(room: Room) {
  const count = room.polygon.length || 1;
  return room.polygon.reduce(
    (sum, point) => ({ x: sum.x + point.x / count, y: sum.y + point.y / count }),
    { x: 0, y: 0 },
  );
}

function SlotHighlight({ mesh, label }: { mesh: PreviewMesh; label: string }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const pulse = 0.22 + Math.sin(clock.elapsedTime * 3) * 0.08;
    group.current.traverse((node) => {
      const material = (node as THREE.Mesh).material;
      if (material && !Array.isArray(material) && "opacity" in material) material.opacity = pulse;
    });
  });
  const depth = mesh.role === "door" || mesh.role === "window" ? Math.max(mesh.size.z, 0.24) : mesh.size.z;
  return (
    <group ref={group} position={[mesh.position.x, mesh.position.y, mesh.position.z]} rotation={[0, mesh.rotationY, 0]}>
      <mesh>
        <boxGeometry args={[mesh.size.x + 0.12, mesh.size.y + 0.12, depth + 0.12]} />
        <meshStandardMaterial color="#c45c26" emissive="#c45c26" emissiveIntensity={0.7} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <Html position={[0, mesh.size.y / 2 + 0.28, 0]} center zIndexRange={[12, 0]}>
        <div className="slot-tag">{label}</div>
      </Html>
    </group>
  );
}

export function PreviewStage({
  model,
  rooms,
  scene,
  highlight,
}: {
  model: PreviewModel;
  rooms: Room[];
  scene: Scene;
  highlight?: { slotId: string; label: string } | null;
}) {
  return (
    <Canvas shadows camera={{ position: [13.2, 10.4, 13.4], fov: 36, near: 0.1, far: 80 }}>
      <color attach="background" args={["#e4d9c8"]} />
      <hemisphereLight args={["#fff6ea", "#c4b29a", 1.05]} />
      <ambientLight intensity={0.28} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.45}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-7, 9, -5]} intensity={0.38} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[4.3, -0.03, 3.5]} receiveShadow>
        <circleGeometry args={[18, 64]} />
        <meshStandardMaterial color="#d5c7b4" roughness={1} metalness={0} />
      </mesh>
      {model.meshes.map((mesh) => {
        if (mesh.role === "floor") return <FloorMesh key={mesh.id} mesh={mesh} />;
        if (mesh.role === "wall") return <WallMesh key={mesh.id} mesh={mesh} holes={holesFor(mesh, model.meshes)} />;
        if (mesh.role === "window") return <WindowFrame key={mesh.id} mesh={mesh} variant={windowVariant(scene, mesh.openingId)} />;
        const spec = gltfFor(scene, mesh);
        if (spec) return <FittedModel key={`${mesh.id}:${spec.url}`} mesh={mesh} spec={spec} />;
        return <BoxMesh key={mesh.id} mesh={mesh} />;
      })}
      {highlight
        ? model.meshes
            .filter((mesh) => mesh.slotId === highlight.slotId)
            .map((mesh) => <SlotHighlight key={`highlight:${mesh.id}`} mesh={mesh} label={highlight.label} />)
        : null}
      {rooms.map((room) => {
        const center = centroid(room);
        return (
          <Html key={room.id} position={[center.x, 0.12, center.y]} center zIndexRange={[2, 0]}>
            <div className="room-label">{room.name}</div>
          </Html>
        );
      })}
      <OrbitControls target={HOUSE_CENTER} maxPolarAngle={Math.PI / 2.08} minDistance={3} maxDistance={26} enableDamping />
    </Canvas>
  );
}

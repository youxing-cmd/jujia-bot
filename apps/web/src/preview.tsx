import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { PreviewMesh, PreviewModel } from "@jujia/preview-3d";
import type { Room } from "@jujia/scene";
import { Html } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

const HOUSE_CENTER: [number, number, number] = [4.3, 0.9, 3.5];

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

function centroid(room: Room) {
  const count = room.polygon.length || 1;
  return room.polygon.reduce(
    (sum, point) => ({ x: sum.x + point.x / count, y: sum.y + point.y / count }),
    { x: 0, y: 0 },
  );
}

export function PreviewStage({ model, rooms }: { model: PreviewModel; rooms: Room[] }) {
  return (
    <Canvas shadows camera={{ position: [13.2, 10.4, 13.4], fov: 36, near: 0.1, far: 80 }}>
      <color attach="background" args={["#e4d9c8"]} />
      <hemisphereLight args={["#fff6ea", "#c4b29a", 1.15]} />
      <directionalLight position={[8, 14, 6]} intensity={1.35} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[4.3, -0.03, 3.5]} receiveShadow>
        <circleGeometry args={[18, 64]} />
        <meshStandardMaterial color="#d5c7b4" roughness={1} metalness={0} />
      </mesh>
      {model.meshes.map((mesh) =>
        mesh.role === "floor" ? <FloorMesh key={mesh.id} mesh={mesh} /> : <BoxMesh key={mesh.id} mesh={mesh} />,
      )}
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

import type { GltfModel, ModelAxis } from "@jujia/catalog";
import * as THREE from "three";

const TARGET_KEYS = ["width", "height", "depth"] as const;

function corners(box: THREE.Box3) {
  const { min, max } = box;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
}

function safeSize(value: number) {
  return Math.abs(value) < 1e-6 ? 1 : value;
}

function localBox(root: THREE.Object3D) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;
    const local = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    box.union(geometry.boundingBox.clone().applyMatrix4(local));
  });
  return box;
}

/**
 * Fits a glTF root into a target box.
 * Width becomes local X, height local Y, depth local Z.
 * contain uses one scale and sits the bottom at -target.y / 2.
 * fill matches width and height; thickness follows the height scale.
 */
export function fitGltf(root: THREE.Object3D, model: GltfModel, target: { x: number; y: number; z: number }) {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrix();

  const box = localBox(root);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const axes = model.axes ?? { width: "x" as const, height: "y" as const, depth: "z" as const };
  const fit = model.fit ?? "contain";
  const source = {
    width: size[axes.width],
    height: size[axes.height],
    depth: size[axes.depth],
  };

  const widthScale = Math.max(target.x, 1e-4) / safeSize(source.width);
  const heightScale = Math.max(target.y, 1e-4) / safeSize(source.height);
  const depthScale = Math.max(target.z, 1e-4) / safeSize(source.depth);
  const uniform = Math.min(widthScale, heightScale, depthScale);
  const applied = {
    width: fit === "fill" ? widthScale : uniform,
    height: fit === "fill" ? heightScale : uniform,
    depth: fit === "fill" ? heightScale : uniform,
  };

  const scale = new THREE.Vector3(1, 1, 1);
  scale[axes.width] = applied.width;
  scale[axes.height] = applied.height;
  scale[axes.depth] = applied.depth;

  const columns: Record<ModelAxis, THREE.Vector3> = {
    x: new THREE.Vector3(),
    y: new THREE.Vector3(),
    z: new THREE.Vector3(),
  };
  const destination = {
    width: new THREE.Vector3(1, 0, 0),
    height: new THREE.Vector3(0, 1, 0),
    depth: new THREE.Vector3(0, 0, 1),
  };
  for (const key of TARGET_KEYS) columns[axes[key]].copy(destination[key]);

  let basis = new THREE.Matrix4().makeBasis(columns.x, columns.y, columns.z);
  if (basis.determinant() < 0) {
    columns[axes.depth].negate();
    basis = new THREE.Matrix4().makeBasis(columns.x, columns.y, columns.z);
  }

  const yaw = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(model.yaw ?? 0));
  const rotation = yaw.clone().multiply(basis);
  const aligned = basis.clone().multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z));
  const fitted = new THREE.Box3();
  for (const corner of corners(box)) fitted.expandByPoint(corner.applyMatrix4(aligned));

  const anchor = new THREE.Vector3(
    (fitted.min.x + fitted.max.x) / 2,
    fit === "fill" ? (fitted.min.y + fitted.max.y) / 2 : fitted.min.y + target.y / 2,
    (fitted.min.z + fitted.max.z) / 2,
  );

  root.scale.copy(scale);
  root.quaternion.setFromRotationMatrix(rotation);
  root.position.copy(anchor.applyMatrix4(yaw).multiplyScalar(-1));
  root.updateMatrixWorld(true);
}

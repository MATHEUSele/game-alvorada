/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type DungeonAssetKey =
  | 'pillar_decorated'
  | 'torch_mounted'
  | 'candle_triple'
  | 'barrel_decorated'
  | 'crates_stacked'
  | 'rubble_large'
  | 'banner_royal'
  | 'chest_gold'
  | 'coin_stack'
  | 'wall_arched'
  | 'column_broken'
  | 'candelabrum_tall'
  | 'cave_wall_rocks'
  | 'boulder_large'
  | 'mountain_group_1'
  | 'mountain_group_2';

const ASSET_PATHS: Record<DungeonAssetKey, string> = {
  pillar_decorated: 'models/dungeon/pillar_decorated.glb',
  torch_mounted: 'models/dungeon/torch_mounted.glb',
  candle_triple: 'models/dungeon/candle_triple.glb',
  barrel_decorated: 'models/dungeon/barrel_decorated.glb',
  crates_stacked: 'models/dungeon/crates_stacked.glb',
  rubble_large: 'models/dungeon/rubble_large.glb',
  banner_royal: 'models/dungeon/banner_royal.glb',
  chest_gold: 'models/dungeon/chest_gold.glb',
  coin_stack: 'models/dungeon/coin_stack.glb',
  wall_arched: 'models/dungeon/wall_arched.glb',
  column_broken: 'models/dungeon/column_broken.glb',
  candelabrum_tall: 'models/dungeon/candelabrum_tall.glb',
  cave_wall_rocks: 'models/dungeon/cave_wall_rocks.glb',
  boulder_large: 'models/dungeon/boulder_large.glb',
  mountain_group_1: 'models/dungeon/mountain_group_1.glb',
  mountain_group_2: 'models/dungeon/mountain_group_2.glb',
};

interface CachedTemplate {
  root: THREE.Group;
  width: number;
  height: number;
  depth: number;
}

export interface SpawnPropOptions {
  x?: number;
  y?: number;
  z?: number;
  rotY?: number;
  targetHeight: number;
  scaleXZ?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  isDisposed?: () => boolean;
  onMissingFallback?: () => THREE.Object3D | null;
}

class DungeonAssetLibrary {
  private readonly loader = new GLTFLoader();
  private readonly templates = new Map<DungeonAssetKey, CachedTemplate>();
  private readonly pending = new Map<
    DungeonAssetKey,
    Promise<CachedTemplate | null>
  >();

  private loadTemplate(key: DungeonAssetKey): Promise<CachedTemplate | null> {
    const cached = this.templates.get(key);
    if (cached) return Promise.resolve(cached);

    const existingPromise = this.pending.get(key);
    if (existingPromise) return existingPromise;

    const url = `${import.meta.env.BASE_URL}${ASSET_PATHS[key]}`;
    const promise = new Promise<CachedTemplate | null>((resolve) => {
      this.loader.load(
        url,
        (gltf) => {
          const raw = gltf.scene;
          raw.updateMatrixWorld(true);

          const box = new THREE.Box3().setFromObject(raw);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);

          // Centraliza em X/Z e apoia exatamente a base (min.y) no plano y = 0
          raw.position.x -= center.x;
          raw.position.z -= center.z;
          raw.position.y -= box.min.y;

          const wrapper = new THREE.Group();
          wrapper.add(raw);
          wrapper.updateMatrixWorld(true);

          const template: CachedTemplate = {
            root: wrapper,
            width: Math.max(0.01, size.x),
            height: Math.max(0.01, size.y),
            depth: Math.max(0.01, size.z),
          };
          this.templates.set(key, template);
          this.pending.delete(key);
          resolve(template);
        },
        undefined,
        () => {
          this.pending.delete(key);
          resolve(null);
        },
      );
    });

    this.pending.set(key, promise);
    return promise;
  }

  public preload(keys: readonly DungeonAssetKey[]): void {
    for (const k of keys) {
      void this.loadTemplate(k);
    }
  }

  private placeInstance(
    template: CachedTemplate,
    targetGroup: THREE.Group,
    options: SpawnPropOptions,
  ): void {
    const instance = template.root.clone(true);
    const uniformScale = options.targetHeight / template.height;
    const xzFactor = options.scaleXZ ?? 1;

    instance.scale.set(
      uniformScale * xzFactor,
      uniformScale,
      uniformScale * xzFactor,
    );
    instance.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
    instance.rotation.y = options.rotY ?? 0;

    const castShadow = options.castShadow ?? true;
    const receiveShadow = options.receiveShadow ?? true;
    instance.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = castShadow;
        obj.receiveShadow = receiveShadow;
      }
    });

    targetGroup.add(instance);
  }

  public spawnProp(
    key: DungeonAssetKey,
    targetGroup: THREE.Group,
    options: SpawnPropOptions,
  ): void {
    const cached = this.templates.get(key);
    if (cached) {
      if (options.isDisposed?.()) return;
      this.placeInstance(cached, targetGroup, options);
      return;
    }

    void this.loadTemplate(key).then((template) => {
      if (options.isDisposed?.()) return;
      if (template) {
        this.placeInstance(template, targetGroup, options);
      } else if (options.onMissingFallback) {
        const fb = options.onMissingFallback();
        if (fb) {
          fb.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
          fb.rotation.y = options.rotY ?? 0;
          targetGroup.add(fb);
        }
      }
    });
  }

  public dispose(): void {
    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();

    for (const template of this.templates.values()) {
      template.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (obj.geometry && !disposedGeos.has(obj.geometry)) {
            disposedGeos.add(obj.geometry);
            obj.geometry.dispose();
          }
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          for (const m of mats) {
            if (m && !disposedMats.has(m)) {
              disposedMats.add(m);
              m.dispose();
            }
          }
        }
      });
    }

    this.templates.clear();
    this.pending.clear();
  }
}

export const dungeonAssetLibrary = new DungeonAssetLibrary();

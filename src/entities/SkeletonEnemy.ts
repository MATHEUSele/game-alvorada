/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  resolveCollisions,
  type BoxCollider,
  type CircleCollider,
} from '../world/Collision';

export type SkeletonArchetype = 'minion' | 'rogue' | 'warrior' | 'champion';
type SkeletonModelKey = 'minion' | 'rogue' | 'warrior';
type WeaponKey =
  | 'sword_skeleton'
  | 'axe_skeleton'
  | 'dagger_skeleton'
  | 'shield_skeleton';

interface ArchetypeConfig {
  modelKey: SkeletonModelKey;
  scale: number;
  radius: number;
  maxHp: number;
  moveSpeed: number;
  patrolSpeed: number;
  hpBarHeight: number;
  hpBarColor: string;
  attackClip: string;
  rightWeapon: WeaponKey;
  rightWeaponHeight: number;
  leftWeapon?: WeaponKey;
  leftWeaponHeight?: number;
}

const ARCHETYPE_CONFIG: Record<SkeletonArchetype, ArchetypeConfig> = {
  minion: {
    modelKey: 'minion',
    scale: 0.83,
    radius: 0.45,
    maxHp: 90,
    moveSpeed: 3.2,
    patrolSpeed: 1.5,
    hpBarHeight: 2.1,
    hpBarColor: '#ef4444',
    attackClip: '1H_Melee_Attack_Slice_Horizontal',
    rightWeapon: 'sword_skeleton',
    rightWeaponHeight: 1.05,
  },
  rogue: {
    modelKey: 'rogue',
    scale: 0.85,
    radius: 0.45,
    maxHp: 105,
    moveSpeed: 4.1,
    patrolSpeed: 1.9,
    hpBarHeight: 2.15,
    hpBarColor: '#f97316',
    attackClip: 'Dualwield_Melee_Attack_Slice',
    rightWeapon: 'dagger_skeleton',
    rightWeaponHeight: 0.72,
    leftWeapon: 'dagger_skeleton',
    leftWeaponHeight: 0.72,
  },
  warrior: {
    modelKey: 'warrior',
    scale: 0.94,
    radius: 0.5,
    maxHp: 155,
    moveSpeed: 2.9,
    patrolSpeed: 1.4,
    hpBarHeight: 2.35,
    hpBarColor: '#ef4444',
    attackClip: '1H_Melee_Attack_Chop',
    rightWeapon: 'axe_skeleton',
    rightWeaponHeight: 1.25,
    leftWeapon: 'shield_skeleton',
    leftWeaponHeight: 0.82,
  },
  champion: {
    modelKey: 'warrior',
    scale: 1.16,
    radius: 0.62,
    maxHp: 280,
    moveSpeed: 3.1,
    patrolSpeed: 1.5,
    hpBarHeight: 2.85,
    hpBarColor: '#a855f7',
    attackClip: '1H_Melee_Attack_Chop',
    rightWeapon: 'axe_skeleton',
    rightWeaponHeight: 1.32,
    leftWeapon: 'shield_skeleton',
    leftWeaponHeight: 0.9,
  },
};

const MODEL_PATHS: Record<SkeletonModelKey, string> = {
  minion: 'models/characters/enemy_skeleton_minion.glb',
  rogue: 'models/characters/enemy_skeleton_rogue.glb',
  warrior: 'models/characters/enemy_skeleton_warrior.glb',
};

const WEAPON_PATHS: Record<WeaponKey, string> = {
  sword_skeleton: 'models/items/sword_skeleton.glb',
  axe_skeleton: 'models/items/axe_skeleton.glb',
  dagger_skeleton: 'models/items/dagger_skeleton.glb',
  shield_skeleton: 'models/items/shield_skeleton.glb',
};

interface CachedSkeletonModel {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

interface CachedWeaponTemplate {
  root: THREE.Group;
  height: number;
}

class SkeletonAssetLibrary {
  private readonly loader = new GLTFLoader();
  private readonly models = new Map<SkeletonModelKey, CachedSkeletonModel>();
  private readonly modelPending = new Map<
    SkeletonModelKey,
    Promise<CachedSkeletonModel | null>
  >();
  private readonly weapons = new Map<WeaponKey, CachedWeaponTemplate>();
  private readonly weaponPending = new Map<
    WeaponKey,
    Promise<CachedWeaponTemplate | null>
  >();

  public preloadAll(): void {
    for (const k of ['minion', 'rogue', 'warrior'] as const) {
      void this.loadModel(k);
    }
    for (const w of [
      'sword_skeleton',
      'axe_skeleton',
      'dagger_skeleton',
      'shield_skeleton',
    ] as const) {
      void this.loadWeapon(w);
    }
  }

  public loadModel(
    key: SkeletonModelKey,
  ): Promise<CachedSkeletonModel | null> {
    const cached = this.models.get(key);
    if (cached) return Promise.resolve(cached);

    const existing = this.modelPending.get(key);
    if (existing) return existing;

    const url = `${import.meta.env.BASE_URL}${MODEL_PATHS[key]}`;
    const p = new Promise<CachedSkeletonModel | null>((resolve) => {
      this.loader.load(
        url,
        (gltf: GLTF) => {
          const entry: CachedSkeletonModel = {
            scene: gltf.scene,
            animations: gltf.animations,
          };
          this.models.set(key, entry);
          this.modelPending.delete(key);
          resolve(entry);
        },
        undefined,
        () => {
          this.modelPending.delete(key);
          resolve(null);
        },
      );
    });
    this.modelPending.set(key, p);
    return p;
  }

  public loadWeapon(key: WeaponKey): Promise<CachedWeaponTemplate | null> {
    const cached = this.weapons.get(key);
    if (cached) return Promise.resolve(cached);

    const existing = this.weaponPending.get(key);
    if (existing) return existing;

    const url = `${import.meta.env.BASE_URL}${WEAPON_PATHS[key]}`;
    const p = new Promise<CachedWeaponTemplate | null>((resolve) => {
      this.loader.load(
        url,
        (gltf: GLTF) => {
          const raw = gltf.scene;
          raw.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(raw);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);

          raw.position.x -= center.x;
          raw.position.z -= center.z;
          raw.position.y -= box.min.y;

          const wrapper = new THREE.Group();
          wrapper.add(raw);
          const entry: CachedWeaponTemplate = {
            root: wrapper,
            height: Math.max(0.05, size.y),
          };
          this.weapons.set(key, entry);
          this.weaponPending.delete(key);
          resolve(entry);
        },
        undefined,
        () => {
          this.weaponPending.delete(key);
          resolve(null);
        },
      );
    });
    this.weaponPending.set(key, p);
    return p;
  }

  public dispose(): void {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();

    const collect = (obj: THREE.Object3D) => {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) geos.add(child.geometry);
          const mList = Array.isArray(child.material)
            ? child.material
            : [child.material];
          for (const m of mList) if (m) mats.add(m);
        }
      });
    };

    for (const m of this.models.values()) collect(m.scene);
    for (const w of this.weapons.values()) collect(w.root);

    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();

    this.models.clear();
    this.modelPending.clear();
    this.weapons.clear();
    this.weaponPending.clear();
  }
}

export const skeletonAssetLibrary = new SkeletonAssetLibrary();

type EnemyState = 'patrol' | 'chase' | 'attack' | 'dead';

interface ClonedBodyMat {
  mat: THREE.MeshStandardMaterial;
  baseEmissive: THREE.Color;
  baseEmissiveIntensity: number;
}

function normalizeAngleDiff(target: number, current: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export class SkeletonEnemy {
  public readonly id: number;
  public readonly archetype: SkeletonArchetype;
  public readonly group = new THREE.Group();
  public readonly radius: number;
  public readonly maxHp: number;
  public hp: number;

  private readonly config: ArchetypeConfig;
  private readonly bodyPivot = new THREE.Group();
  private readonly anchorX: number;
  private readonly anchorZ: number;
  private readonly aggroRadius = 11.0;
  private readonly leashRadius = 15.5;
  private readonly attackRange = 1.68;

  private state: EnemyState = 'patrol';
  private patrolTargetX: number;
  private patrolTargetZ: number;
  private patrolWaitTimer: number;
  private attackCooldown = 0;
  private hitFlashTimer = 0;
  private deadTimer = 0;
  private readonly knockbackVel = new THREE.Vector3();

  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private attackAction: THREE.AnimationAction | null = null;
  private hitAction: THREE.AnimationAction | null = null;
  private deathAction: THREE.AnimationAction | null = null;
  private activeOneShot: THREE.AnimationAction | null = null;

  private idleWeight = 1;
  private walkWeight = 0;
  private runWeight = 0;

  private readonly clonedMaterials: ClonedBodyMat[] = [];
  private readonly baseRing: THREE.Mesh;
  private readonly hpBarGroup = new THREE.Group();
  private readonly hpFillMesh: THREE.Mesh;
  private readonly ownedGeos: THREE.BufferGeometry[] = [];
  private readonly ownedMats: THREE.Material[] = [];

  private rngState: number;
  private disposed = false;

  constructor(
    id: number,
    archetype: SkeletonArchetype,
    x: number,
    z: number,
    initialYaw: number,
  ) {
    this.id = id;
    this.archetype = archetype;
    this.config = ARCHETYPE_CONFIG[archetype];
    this.radius = this.config.radius;
    this.maxHp = this.config.maxHp;
    this.hp = this.config.maxHp;
    this.anchorX = x;
    this.anchorZ = z;
    this.patrolTargetX = x;
    this.patrolTargetZ = z;
    this.rngState = (id * 2654435761) >>> 0 || 1;
    this.patrolWaitTimer = 0.6 + this.nextRand() * 1.8;

    this.group.position.set(x, 0, z);
    this.bodyPivot.rotation.y = initialYaw;
    this.group.add(this.bodyPivot);

    // Anel discreto no chão identificando inimigo (roxo para Champion, rubro para esqueletos)
    const ringGeo = new THREE.RingGeometry(
      this.radius * 0.85,
      this.radius * 1.05,
      24,
    );
    const ringMat = new THREE.MeshBasicMaterial({
      color: archetype === 'champion' ? '#c084fc' : '#ef4444',
      transparent: true,
      opacity: archetype === 'champion' ? 0.55 : 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ownedGeos.push(ringGeo);
    this.ownedMats.push(ringMat);
    this.baseRing = new THREE.Mesh(ringGeo, ringMat);
    this.baseRing.rotation.x = -Math.PI / 2;
    this.baseRing.position.y = 0.025;
    this.group.add(this.baseRing);

    // Barra de vida 3D acima da cabeça
    const barW = archetype === 'champion' ? 1.35 : 0.94;
    const barH = archetype === 'champion' ? 0.13 : 0.1;
    const bgGeo = new THREE.PlaneGeometry(barW + 0.08, barH + 0.05);
    const bgMat = new THREE.MeshBasicMaterial({
      color: '#090d18',
      transparent: true,
      opacity: 0.82,
      depthTest: true,
    });
    const fillGeo = new THREE.PlaneGeometry(barW, barH);
    fillGeo.translate(barW * 0.5, 0, 0);
    const fillMat = new THREE.MeshBasicMaterial({
      color: this.config.hpBarColor,
    });
    this.ownedGeos.push(bgGeo, fillGeo);
    this.ownedMats.push(bgMat, fillMat);

    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    this.hpFillMesh = new THREE.Mesh(fillGeo, fillMat);
    this.hpFillMesh.position.set(-barW * 0.5, 0, 0.006);

    this.hpBarGroup.add(bgMesh, this.hpFillMesh);
    this.hpBarGroup.position.set(0, this.config.hpBarHeight, 0);
    this.hpBarGroup.visible = archetype === 'champion';
    this.group.add(this.hpBarGroup);

    this.initModel();
  }

  private nextRand(): number {
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  private initModel(): void {
    void skeletonAssetLibrary.loadModel(this.config.modelKey).then((tpl) => {
      if (this.disposed || !tpl) return;

      const root = cloneSkinned(tpl.scene);
      root.scale.setScalar(this.config.scale);

      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (obj instanceof THREE.SkinnedMesh) {
            obj.frustumCulled = false;
          }

          if (Array.isArray(obj.material)) {
            obj.material = obj.material.map((m) => this.cloneMat(m));
          } else if (obj.material) {
            obj.material = this.cloneMat(obj.material);
          }
        }
      });

      this.bodyPivot.add(root);
      this.attachWeapons(root);
      this.setupAnimations(root, tpl.animations);
    });
  }

  private cloneMat(mat: THREE.Material): THREE.Material {
    const cloned = mat.clone();
    if (cloned instanceof THREE.MeshStandardMaterial) {
      this.clonedMaterials.push({
        mat: cloned,
        baseEmissive: cloned.emissive.clone(),
        baseEmissiveIntensity: cloned.emissiveIntensity,
      });
    }
    this.ownedMats.push(cloned);
    return cloned;
  }

  private attachWeapons(modelRoot: THREE.Object3D): void {
    const bones = new Map<string, THREE.Object3D>();
    modelRoot.traverse((obj) => {
      if ((obj as THREE.Bone).isBone || obj.type === 'Bone' || obj.name.startsWith('handslot')) {
        bones.set(obj.name, obj);
      }
    });

    const mountToSlot = (
      slotName: string,
      weaponKey: WeaponKey,
      targetHeight: number,
      isShield = false,
    ) => {
      const slot = bones.get(slotName);
      if (!slot) return;
      void skeletonAssetLibrary.loadWeapon(weaponKey).then((wTpl) => {
        if (this.disposed || !wTpl) return;
        const wInstance = wTpl.root.clone(true);
        const s = targetHeight / wTpl.height;
        wInstance.scale.setScalar(s);

        if (isShield) {
          wInstance.rotation.set(0, Math.PI * 0.5, 0);
          wInstance.position.set(0.06, 0, 0.04);
        } else {
          wInstance.rotation.set(Math.PI * 0.5, 0, 0);
          wInstance.position.set(0, 0.04, 0);
        }

        wInstance.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        slot.add(wInstance);
      });
    };

    mountToSlot(
      'handslot.r',
      this.config.rightWeapon,
      this.config.rightWeaponHeight,
      false,
    );
    if (this.config.leftWeapon && this.config.leftWeaponHeight) {
      mountToSlot(
        'handslot.l',
        this.config.leftWeapon,
        this.config.leftWeaponHeight,
        this.config.leftWeapon === 'shield_skeleton',
      );
    }
  }

  private setupAnimations(
    modelRoot: THREE.Object3D,
    clips: THREE.AnimationClip[],
  ): void {
    const mixer = new THREE.AnimationMixer(modelRoot);
    this.mixer = mixer;

    const findClip = (names: readonly string[]): THREE.AnimationClip | undefined => {
      for (const n of names) {
        const found =
          THREE.AnimationClip.findByName(clips, n) ??
          clips.find((c) => c.name.toLowerCase() === n.toLowerCase());
        if (found) return found;
      }
      return undefined;
    };

    const makeLoop = (
      names: readonly string[],
      initialWeight: number,
    ): THREE.AnimationAction | null => {
      const clip = findClip(names);
      if (!clip) return null;
      const act = mixer.clipAction(clip);
      act.setLoop(THREE.LoopRepeat, Infinity);
      act.setEffectiveWeight(initialWeight);
      act.play();
      return act;
    };

    const makeOnce = (
      names: readonly string[],
      timeScale = 1,
    ): THREE.AnimationAction | null => {
      const clip = findClip(names);
      if (!clip) return null;
      const act = mixer.clipAction(clip);
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = true;
      act.setEffectiveTimeScale(timeScale);
      return act;
    };

    this.idleAction = makeLoop(['Idle_Combat', 'Idle', 'Unarmed_Idle'], 1);
    this.walkAction = makeLoop(['Walking_D_Skeletons', 'Walking_A'], 0);
    this.runAction = makeLoop(['Running_A', 'Running_B'], 0);

    this.attackAction = makeOnce(
      [this.config.attackClip, '1H_Melee_Attack_Chop', 'Unarmed_Melee_Attack_Punch_A'],
      1.15,
    );
    this.hitAction = makeOnce(['Hit_A', 'Hit_B'], 1.2);
    this.deathAction = makeOnce(
      ['Death_C_Skeletons', 'Death_A', 'Death_B'],
      1.05,
    );

    mixer.addEventListener('finished', (ev) => {
      if (ev.action === this.deathAction) return;
      if (this.activeOneShot && ev.action === this.activeOneShot) {
        this.activeOneShot.fadeOut(0.14);
        this.activeOneShot = null;
      }
    });

    mixer.update(0);
  }

  private playOneShot(action: THREE.AnimationAction | null): void {
    if (!action || this.state === 'dead') return;
    if (this.activeOneShot && this.activeOneShot !== action) {
      this.activeOneShot.stop();
    }
    action.reset();
    action.setEffectiveWeight(1);
    action.fadeIn(0.06).play();
    this.activeOneShot = action;
  }

  public isAlive(): boolean {
    return this.state !== 'dead';
  }

  public takeDamage(
    amount: number,
    knockDirX: number,
    knockDirZ: number,
    knockStrength: number,
  ): boolean {
    if (this.state === 'dead') return false;

    this.hp = Math.max(0, this.hp - amount);
    this.hitFlashTimer = 0.15;
    this.hpBarGroup.visible = true;
    this.hpFillMesh.scale.x = Math.max(0.001, this.hp / this.maxHp);

    const kScale = this.archetype === 'champion' ? 0.5 : 1.0;
    this.knockbackVel.set(
      knockDirX * knockStrength * kScale,
      0,
      knockDirZ * knockStrength * kScale,
    );

    if (this.hp <= 0) {
      this.state = 'dead';
      this.deadTimer = 0;
      this.hpBarGroup.visible = false;
      this.baseRing.visible = false;

      if (this.activeOneShot) {
        this.activeOneShot.stop();
        this.activeOneShot = null;
      }
      this.idleAction?.setEffectiveWeight(0);
      this.walkAction?.setEffectiveWeight(0);
      this.runAction?.setEffectiveWeight(0);
      if (this.deathAction) {
        this.deathAction.reset();
        this.deathAction.setEffectiveWeight(1);
        this.deathAction.play();
      }
      return true;
    }

    if (this.activeOneShot !== this.attackAction) {
      this.playOneShot(this.hitAction);
    }
    return true;
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    cameraQuat: THREE.Quaternion,
    circleColliders: readonly CircleCollider[],
    boxColliders: readonly BoxCollider[],
    boundsRadius: number,
    otherEnemies: readonly SkeletonEnemy[],
  ): void {
    if (!this.group.visible) return;

    // Flash emissivo individual de dano
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      const t = this.hitFlashTimer / 0.15;
      for (const entry of this.clonedMaterials) {
        entry.mat.emissive.set('#ff6b4a');
        entry.mat.emissiveIntensity = 1.6 * t;
      }
    } else if (this.clonedMaterials.length > 0) {
      for (const entry of this.clonedMaterials) {
        entry.mat.emissive.copy(entry.baseEmissive);
        entry.mat.emissiveIntensity = entry.baseEmissiveIntensity;
      }
    }

    if (this.state === 'dead') {
      this.deadTimer += dt;
      this.mixer?.update(dt);
      if (this.deadTimer > 3.2) {
        this.group.position.y -= dt * 0.7;
        if (this.deadTimer > 4.1) {
          this.group.visible = false;
        }
      }
      return;
    }

    if (this.hpBarGroup.visible) {
      this.hpBarGroup.quaternion.copy(cameraQuat);
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    }

    const pos = this.group.position;
    const toPlayerX = playerPos.x - pos.x;
    const toPlayerZ = playerPos.z - pos.z;
    const distToPlayer = Math.hypot(toPlayerX, toPlayerZ);
    const distFromAnchor = Math.hypot(pos.x - this.anchorX, pos.z - this.anchorZ);

    let desiredVelX = 0;
    let desiredVelZ = 0;
    let isChasing = false;

    if (distToPlayer <= this.aggroRadius && distFromAnchor <= this.leashRadius) {
      this.hpBarGroup.visible = true;
      if (distToPlayer <= this.attackRange) {
        this.state = 'attack';
        const faceYaw = Math.atan2(toPlayerX, toPlayerZ);
        const diff = normalizeAngleDiff(faceYaw, this.bodyPivot.rotation.y);
        this.bodyPivot.rotation.y += diff * (1 - Math.exp(-12 * dt));

        if (this.attackCooldown <= 0 && this.activeOneShot !== this.attackAction) {
          this.playOneShot(this.attackAction);
          this.attackCooldown = 1.45;
        }
      } else {
        this.state = 'chase';
        isChasing = true;
        const inv = 1 / Math.max(0.001, distToPlayer);
        desiredVelX = toPlayerX * inv * this.config.moveSpeed;
        desiredVelZ = toPlayerZ * inv * this.config.moveSpeed;
      }
    } else {
      this.state = 'patrol';
      if (this.hp >= this.maxHp && this.archetype !== 'champion') {
        this.hpBarGroup.visible = false;
      }

      const toTargetX = this.patrolTargetX - pos.x;
      const toTargetZ = this.patrolTargetZ - pos.z;
      const distTarget = Math.hypot(toTargetX, toTargetZ);

      if (distTarget > 0.35) {
        const inv = 1 / distTarget;
        desiredVelX = toTargetX * inv * this.config.patrolSpeed;
        desiredVelZ = toTargetZ * inv * this.config.patrolSpeed;
      } else {
        this.patrolWaitTimer -= dt;
        if (this.patrolWaitTimer <= 0) {
          const ang = this.nextRand() * Math.PI * 2;
          const r = 1.4 + this.nextRand() * 2.2;
          this.patrolTargetX = this.anchorX + Math.cos(ang) * r;
          this.patrolTargetZ = this.anchorZ + Math.sin(ang) * r;
          this.patrolWaitTimer = 1.2 + this.nextRand() * 2.2;
        }
      }
    }

    // Aplica movimento + knockback amortecido
    pos.x += (desiredVelX + this.knockbackVel.x) * dt;
    pos.z += (desiredVelZ + this.knockbackVel.z) * dt;

    const kDecay = Math.exp(-11 * dt);
    this.knockbackVel.multiplyScalar(kDecay);

    // Separação leve entre esqueletos vivos
    for (let i = 0; i < otherEnemies.length; i++) {
      const other = otherEnemies[i];
      if (other === this || !other.isAlive()) continue;
      const dx = pos.x - other.group.position.x;
      const dz = pos.z - other.group.position.z;
      const minDist = this.radius + other.radius;
      const dSq = dx * dx + dz * dz;
      if (dSq > 1e-6 && dSq < minDist * minDist) {
        const d = Math.sqrt(dSq);
        const push = (minDist - d) * 0.5;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      }
    }

    // Resolve colisão contra paredes e pilares da masmorra
    const xz = { x: pos.x, z: pos.z };
    resolveCollisions(xz, this.radius, circleColliders, boxColliders, boundsRadius);
    pos.x = xz.x;
    pos.z = xz.z;

    const moveSpeed = Math.hypot(desiredVelX, desiredVelZ);
    if (moveSpeed > 0.2) {
      const targetYaw = Math.atan2(desiredVelX, desiredVelZ);
      const diff = normalizeAngleDiff(targetYaw, this.bodyPivot.rotation.y);
      this.bodyPivot.rotation.y += diff * (1 - Math.exp(-10 * dt));
    }

    this.updateAnimations(moveSpeed, isChasing, dt);
  }

  private updateAnimations(
    moveSpeed: number,
    isChasing: boolean,
    dt: number,
  ): void {
    if (!this.mixer) return;

    let tIdle = 1;
    let tWalk = 0;
    let tRun = 0;

    if (this.activeOneShot) {
      tIdle = 0.05;
      tWalk = 0;
      tRun = 0;
    } else if (moveSpeed > 0.25) {
      tIdle = 0;
      if (isChasing && this.runAction) {
        tRun = 1;
      } else {
        tWalk = 1;
      }
    }

    const alpha = 1 - Math.exp(-12 * dt);
    this.idleWeight += (tIdle - this.idleWeight) * alpha;
    this.walkWeight += (tWalk - this.walkWeight) * alpha;
    this.runWeight += (tRun - this.runWeight) * alpha;

    this.idleAction?.setEffectiveWeight(this.idleWeight);
    this.walkAction?.setEffectiveWeight(this.walkWeight);
    this.runAction?.setEffectiveWeight(this.runWeight);

    this.mixer.update(dt);
  }

  public dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.mixer = null;
    for (const g of this.ownedGeos) g.dispose();
    for (const m of this.ownedMats) m.dispose();
    this.ownedGeos.length = 0;
    this.ownedMats.length = 0;
    this.clonedMaterials.length = 0;
  }
}

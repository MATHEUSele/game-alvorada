/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SwordVfx, type SwordSkillType } from './SwordVfx';

function normalizeAngleDiff(target: number, current: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export interface PlayerEquipmentSockets {
  head: THREE.Group;
  chest: THREE.Group;
  back: THREE.Group;
  rightHand: THREE.Group;
  leftHand: THREE.Group;
}

export type SwordSkillSlot = SwordSkillType;
export type PlayerOneShotAction =
  | 'AttackSlash'
  | 'AttackSlash2'
  | 'AttackSlash3'
  | 'SkillSpin'
  | 'SkillThrust'
  | 'SkillUlt'
  | 'Dodge';

export interface SkillMeta {
  slot: SwordSkillSlot;
  clip: PlayerOneShotAction;
  label: string;
  cooldown: number;
  speedFactor: number;
  dashSpeed: number;
  dashDuration: number;
  lungeSpeed: number;
}

export const SKILL_CONFIG: Record<SwordSkillSlot, SkillMeta> = {
  slash: {
    slot: 'slash',
    clip: 'AttackSlash',
    label: 'Corte I',
    cooldown: 0.36,
    speedFactor: 0.54,
    dashSpeed: 0,
    dashDuration: 0,
    lungeSpeed: 3.1,
  },
  spin: {
    slot: 'spin',
    clip: 'SkillSpin',
    label: 'Giro Ciclone 360°',
    cooldown: 3.5,
    speedFactor: 0.92,
    dashSpeed: 0,
    dashDuration: 0,
    lungeSpeed: 0,
  },
  thrust: {
    slot: 'thrust',
    clip: 'SkillThrust',
    label: 'Investida Real',
    cooldown: 4.5,
    speedFactor: 0.3,
    dashSpeed: 13.5,
    dashDuration: 0.26,
    lungeSpeed: 0,
  },
  ult: {
    slot: 'ult',
    clip: 'SkillUlt',
    label: 'ULT: Julgamento',
    cooldown: 9.0,
    speedFactor: 0.25,
    dashSpeed: 5.5,
    dashDuration: 0.28,
    lungeSpeed: 0,
  },
};

export interface SkillRuntimeState {
  cooldownRemaining: number;
  cooldownTotal: number;
  ready: boolean;
  active: boolean;
}

export class Player {
  public readonly group = new THREE.Group();
  public readonly radius = 0.45;
  public readonly sockets: PlayerEquipmentSockets;

  private readonly bodyPivot = new THREE.Group();
  private readonly baseRing: THREE.Mesh;
  private readonly swordVfx = new SwordVfx();

  private readonly velocity = new THREE.Vector3();
  private readonly targetVelocity = new THREE.Vector3();
  private readonly walkSpeed = 5.8;
  private readonly sprintSpeed = 8.4;

  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private runAction: THREE.AnimationAction | null = null;
  private readonly oneShotActions = new Map<
    PlayerOneShotAction,
    THREE.AnimationAction
  >();
  private activeOneShot: THREE.AnimationAction | null = null;
  private activeSkillSlot: SwordSkillSlot | null = null;
  private activeSkillLabel: string | null = null;

  private slashComboStep: 1 | 2 | 3 = 1;
  private slashComboWindow = 0;

  private readonly cooldowns: Record<SwordSkillSlot, number> = {
    slash: 0,
    spin: 0,
    thrust: 0,
    ult: 0,
  };
  private dashTimer = 0;
  private dashSpeed = 0;
  private readonly dashDir = new THREE.Vector3();

  private idleWeight = 1;
  private walkWeight = 0;
  private runWeight = 0;
  private isSprinting = false;
  private modelReady = false;

  constructor() {
    const ringGeo = new THREE.RingGeometry(0.45, 0.54, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#2957a8',
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.baseRing = new THREE.Mesh(ringGeo, ringMat);
    this.baseRing.rotation.x = -Math.PI / 2;
    this.baseRing.position.y = 0.02;
    this.group.add(this.baseRing);

    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.2, 3),
      new THREE.MeshBasicMaterial({
        color: '#d8ab4c',
        transparent: true,
        opacity: 0.82,
      }),
    );
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.025, 0.61);
    this.bodyPivot.add(arrow);
    this.bodyPivot.add(this.swordVfx.group);

    this.group.add(this.bodyPivot);

    const headSocket = new THREE.Group();
    const chestSocket = new THREE.Group();
    const backSocket = new THREE.Group();
    const rightHandSocket = new THREE.Group();
    const leftHandSocket = new THREE.Group();

    headSocket.position.set(0, 1.72, 0);
    chestSocket.position.set(0, 1.32, 0);
    backSocket.position.set(0, 1.32, -0.2);
    rightHandSocket.position.set(-0.35, 1.0, 0.15);
    leftHandSocket.position.set(0.35, 1.0, 0.15);

    this.bodyPivot.add(
      headSocket,
      chestSocket,
      backSocket,
      rightHandSocket,
      leftHandSocket,
    );

    this.sockets = {
      head: headSocket,
      chest: chestSocket,
      back: backSocket,
      rightHand: rightHandSocket,
      leftHand: leftHandSocket,
    };

    this.group.position.set(0, 0, 0);
    this.bodyPivot.rotation.y = Math.PI * 0.25;

    this.loadCharacterModel();
  }

  private loadCharacterModel(): void {
    const loader = new GLTFLoader();
    const modelUrl = `${import.meta.env.BASE_URL}models/protagonist.glb`;

    loader.load(
      modelUrl,
      (gltf) => {
        const modelRoot = gltf.scene;

        modelRoot.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
            if (obj instanceof THREE.SkinnedMesh) {
              obj.frustumCulled = false;
            }
          }
        });

        this.bodyPivot.add(modelRoot);
        this.attachSocketsToBones(modelRoot);
        this.setupAnimations(modelRoot, gltf.animations);
        this.modelReady = true;
      },
      undefined,
      (err) => {
        console.error('Erro ao carregar protagonista 3D (protagonist.glb):', err);
      },
    );
  }

  private attachSocketsToBones(modelRoot: THREE.Object3D): void {
    const bones = new Map<string, THREE.Object3D>();
    modelRoot.traverse((obj) => {
      if ((obj as THREE.Bone).isBone || obj.type === 'Bone') {
        bones.set(obj.name, obj);
      }
    });

    const headBone = bones.get('Head');
    if (headBone) {
      this.sockets.head.position.set(0, 0.12, 0);
      headBone.add(this.sockets.head);
    }

    const chestBone = bones.get('Spine2') ?? bones.get('Spine1');
    if (chestBone) {
      this.sockets.chest.position.set(0, 0.08, 0);
      chestBone.add(this.sockets.chest);

      this.sockets.back.position.set(0, 0.08, -0.18);
      chestBone.add(this.sockets.back);
    }

    const rightHandBone = bones.get('RightHand');
    if (rightHandBone) {
      this.sockets.rightHand.position.set(0, 0.06, 0);
      rightHandBone.add(this.sockets.rightHand);
    }

    const leftHandBone = bones.get('LeftHand');
    if (leftHandBone) {
      this.sockets.leftHand.position.set(0, 0.06, 0);
      leftHandBone.add(this.sockets.leftHand);
    }
  }

  private setupAnimations(
    modelRoot: THREE.Object3D,
    clips: THREE.AnimationClip[],
  ): void {
    const mixer = new THREE.AnimationMixer(modelRoot);
    this.mixer = mixer;

    const findClip = (name: string): THREE.AnimationClip | undefined =>
      THREE.AnimationClip.findByName(clips, name) ??
      clips.find((c) => c.name.toLowerCase() === name.toLowerCase());

    const idleClip = findClip('Idle') ?? clips[0];
    const walkClip = findClip('Walk');
    const runClip = findClip('Run');

    if (idleClip) {
      this.idleAction = mixer.clipAction(idleClip);
      this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
      this.idleAction.setEffectiveWeight(1);
      this.idleAction.play();
    }

    if (walkClip) {
      this.walkAction = mixer.clipAction(walkClip);
      this.walkAction.setLoop(THREE.LoopRepeat, Infinity);
      this.walkAction.setEffectiveWeight(0);
      this.walkAction.play();
    }

    if (runClip) {
      this.runAction = mixer.clipAction(runClip);
      this.runAction.setLoop(THREE.LoopRepeat, Infinity);
      this.runAction.setEffectiveWeight(0);
      this.runAction.play();
    }

    for (const actionName of [
      'AttackSlash',
      'AttackSlash2',
      'AttackSlash3',
      'SkillSpin',
      'SkillThrust',
      'SkillUlt',
      'Dodge',
    ] as const) {
      const clip = findClip(actionName);
      if (clip) {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        this.oneShotActions.set(actionName, action);
      }
    }

    mixer.addEventListener('finished', (event) => {
      if (event.action === this.activeOneShot) {
        this.activeOneShot.fadeOut(0.14);
        this.activeOneShot = null;
        this.activeSkillSlot = null;
        this.activeSkillLabel = null;
      }
    });

    mixer.update(0);
  }

  public isModelLoaded(): boolean {
    return this.modelReady;
  }

  public useSkill(slot: SwordSkillSlot, aimWorldDir?: THREE.Vector3): boolean {
    if (this.cooldowns[slot] > 0) return false;

    if (this.activeSkillSlot !== null && this.activeSkillSlot !== 'slash') {
      return false;
    }

    const meta = SKILL_CONFIG[slot];
    if (aimWorldDir && aimWorldDir.lengthSq() > 1e-4) {
      this.bodyPivot.rotation.y = Math.atan2(aimWorldDir.x, aimWorldDir.z);
    }

    let clipToPlay: PlayerOneShotAction = meta.clip;
    let labelToShow = meta.label;
    let cdDuration = meta.cooldown;
    let comboStepForVfx: 1 | 2 | 3 = 1;

    if (slot === 'slash') {
      const step: 1 | 2 | 3 =
        this.slashComboWindow > 0 ? this.slashComboStep : 1;
      comboStepForVfx = step;

      if (step === 1) {
        clipToPlay = 'AttackSlash';
        labelToShow = 'Corte I';
        cdDuration = 0.36;
        this.slashComboStep = 2;
      } else if (step === 2) {
        clipToPlay = 'AttackSlash2';
        labelToShow = 'Corte II';
        cdDuration = 0.36;
        this.slashComboStep = 3;
      } else {
        clipToPlay = 'AttackSlash3';
        labelToShow = 'Corte Final!';
        cdDuration = 0.62;
        this.slashComboStep = 1;
      }
      this.slashComboWindow = 1.4;
    }

    this.cooldowns[slot] = cdDuration;
    this.activeSkillSlot = slot;
    this.activeSkillLabel = labelToShow;
    this.triggerAction(clipToPlay);
    this.swordVfx.trigger(slot, comboStepForVfx);

    const yaw = this.bodyPivot.rotation.y;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);

    if (meta.dashDuration > 0 && meta.dashSpeed > 0) {
      this.dashDir.set(fwdX, 0, fwdZ);
      this.dashSpeed = meta.dashSpeed;
      this.dashTimer = meta.dashDuration;
    } else if (meta.lungeSpeed > 0) {
      const bonus = comboStepForVfx === 3 ? 1.45 : 1.0;
      this.velocity.x += fwdX * meta.lungeSpeed * bonus;
      this.velocity.z += fwdZ * meta.lungeSpeed * bonus;
    }

    return true;
  }

  public getSkillState(slot: SwordSkillSlot): SkillRuntimeState {
    const total = SKILL_CONFIG[slot].cooldown;
    const remaining = Math.max(0, this.cooldowns[slot]);
    return {
      cooldownRemaining: remaining,
      cooldownTotal: total,
      ready: remaining <= 0.001,
      active: this.activeSkillSlot === slot,
    };
  }

  public getActiveSkillLabel(): string | null {
    return this.activeSkillLabel;
  }

  public triggerAction(name: PlayerOneShotAction): boolean {
    const action = this.oneShotActions.get(name);
    if (!action) return false;

    if (this.activeOneShot && this.activeOneShot !== action) {
      this.activeOneShot.stop();
    }
    action.reset();
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.fadeIn(0.05).play();
    this.activeOneShot = action;
    return true;
  }

  public getSpeedRatio(): number {
    return this.velocity.length() / this.sprintSpeed;
  }

  public isRunning(): boolean {
    return this.isSprinting && this.velocity.lengthSq() > 0.25;
  }

  public isMoving(): boolean {
    return this.velocity.lengthSq() > 0.15;
  }

  public update(
    worldMoveDir: THREE.Vector3,
    sprint: boolean,
    dt: number,
    elapsed: number,
  ): void {
    for (const slot of ['slash', 'spin', 'thrust', 'ult'] as const) {
      if (this.cooldowns[slot] > 0) {
        this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - dt);
      }
    }
    if (this.slashComboWindow > 0) {
      this.slashComboWindow = Math.max(0, this.slashComboWindow - dt);
      if (this.slashComboWindow === 0) {
        this.slashComboStep = 1;
      }
    }

    this.isSprinting = sprint;
    const baseSpeed = sprint ? this.sprintSpeed : this.walkSpeed;
    const skillSpeedFactor = this.activeSkillSlot
      ? SKILL_CONFIG[this.activeSkillSlot].speedFactor
      : 1;
    const targetSpeed = baseSpeed * skillSpeedFactor;

    if (worldMoveDir.lengthSq() > 1e-6) {
      this.targetVelocity.copy(worldMoveDir).multiplyScalar(targetSpeed);
    } else {
      this.targetVelocity.set(0, 0, 0);
    }

    const accelAlpha = 1 - Math.exp(-18 * dt);
    this.velocity.lerp(this.targetVelocity, accelAlpha);

    this.group.position.x += this.velocity.x * dt;
    this.group.position.z += this.velocity.z * dt;

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      this.group.position.x += this.dashDir.x * this.dashSpeed * dt;
      this.group.position.z += this.dashDir.z * this.dashSpeed * dt;
    }

    const speed = this.velocity.length();
    let angularDiff = 0;

    if (
      speed > 0.2 &&
      this.activeSkillSlot !== 'thrust' &&
      this.activeSkillSlot !== 'ult'
    ) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      angularDiff = normalizeAngleDiff(targetYaw, this.bodyPivot.rotation.y);
      const rotAlpha = 1 - Math.exp(-15 * dt);
      this.bodyPivot.rotation.y += angularDiff * rotAlpha;
    }

    const bankTarget = THREE.MathUtils.clamp(-angularDiff * 0.12, -0.14, 0.14);
    const bankAlpha = 1 - Math.exp(-12 * dt);
    this.bodyPivot.rotation.z +=
      (bankTarget - this.bodyPivot.rotation.z) * bankAlpha;

    this.baseRing.scale.setScalar(1 + Math.sin(elapsed * 2.5) * 0.015);

    this.swordVfx.update(dt);
    this.updateAnimations(speed, dt);
  }

  private updateAnimations(speed: number, dt: number): void {
    if (!this.mixer) return;

    let targetIdle = 1;
    let targetWalk = 0;
    let targetRun = 0;

    if (speed > 0.35) {
      if (this.isSprinting || speed > this.walkSpeed * 1.12) {
        targetIdle = 0;
        targetWalk = 0;
        targetRun = 1;
      } else {
        const moveRatio = THREE.MathUtils.clamp(speed / this.walkSpeed, 0.25, 1);
        targetIdle = 1 - moveRatio;
        targetWalk = moveRatio;
        targetRun = 0;
      }
    }

    const oneShotScale = this.activeOneShot
      ? this.activeSkillSlot === 'spin' || this.activeSkillSlot === 'ult'
        ? 0.02
        : 0.08
      : 1;
    const blendAlpha = 1 - Math.exp(-15 * dt);

    this.idleWeight += (targetIdle * oneShotScale - this.idleWeight) * blendAlpha;
    this.walkWeight += (targetWalk * oneShotScale - this.walkWeight) * blendAlpha;
    this.runWeight += (targetRun * oneShotScale - this.runWeight) * blendAlpha;

    this.idleAction?.setEffectiveWeight(this.idleWeight);

    if (this.walkAction) {
      this.walkAction.setEffectiveWeight(this.walkWeight);
      const walkTimeScale = THREE.MathUtils.clamp(
        speed / (this.walkSpeed * 0.72),
        0.75,
        1.45,
      );
      this.walkAction.setEffectiveTimeScale(walkTimeScale);
    }

    if (this.runAction) {
      this.runAction.setEffectiveWeight(this.runWeight);
      const runTimeScale = THREE.MathUtils.clamp(
        speed / (this.sprintSpeed * 0.86),
        0.85,
        1.38,
      );
      this.runAction.setEffectiveTimeScale(runTimeScale);
    }

    this.mixer.update(dt);
  }
}

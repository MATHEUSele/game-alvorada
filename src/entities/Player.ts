/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

export type PlayerOneShotAction = 'AttackCombo' | 'Dodge';

export class Player {
  public readonly group = new THREE.Group();
  public readonly radius = 0.45;
  public readonly sockets: PlayerEquipmentSockets;

  private readonly bodyPivot = new THREE.Group();
  private readonly baseRing: THREE.Mesh;

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

  private idleWeight = 1;
  private walkWeight = 0;
  private runWeight = 0;
  private isSprinting = false;
  private modelReady = false;

  constructor() {
    // Anel discreto estilo ARPG/MOBA sob os pés + marcador frontal
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

    this.group.add(this.bodyPivot);

    // Sockets inicializados imediatamente e reparentados aos ossos reais após carregar o .glb
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

    // Posição e orientação iniciais no centro do Salão
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

    for (const actionName of ['AttackCombo', 'Dodge'] as const) {
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
      }
    });

    mixer.update(0);
  }

  public isModelLoaded(): boolean {
    return this.modelReady;
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
    action.fadeIn(0.08).play();
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
    this.isSprinting = sprint;
    const targetSpeed = sprint ? this.sprintSpeed : this.walkSpeed;

    if (worldMoveDir.lengthSq() > 1e-6) {
      this.targetVelocity.copy(worldMoveDir).multiplyScalar(targetSpeed);
    } else {
      this.targetVelocity.set(0, 0, 0);
    }

    // Resposta ágil estilo MOBA/ARPG
    const accelAlpha = 1 - Math.exp(-18 * dt);
    this.velocity.lerp(this.targetVelocity, accelAlpha);

    this.group.position.x += this.velocity.x * dt;
    this.group.position.z += this.velocity.z * dt;

    const speed = this.velocity.length();
    let angularDiff = 0;

    // Rotação suave pelo menor ângulo + leve inclinação em curvas
    if (speed > 0.2) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      angularDiff = normalizeAngleDiff(targetYaw, this.bodyPivot.rotation.y);
      const rotAlpha = 1 - Math.exp(-15 * dt);
      this.bodyPivot.rotation.y += angularDiff * rotAlpha;
    }

    const bankTarget = THREE.MathUtils.clamp(-angularDiff * 0.12, -0.14, 0.14);
    const bankAlpha = 1 - Math.exp(-12 * dt);
    this.bodyPivot.rotation.z +=
      (bankTarget - this.bodyPivot.rotation.z) * bankAlpha;

    // Pulso discreto no anel de base
    this.baseRing.scale.setScalar(1 + Math.sin(elapsed * 2.5) * 0.015);

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

    const oneShotScale = this.activeOneShot ? 0.15 : 1;
    const blendAlpha = 1 - Math.exp(-12 * dt);

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
        1.4,
      );
      this.runAction.setEffectiveTimeScale(runTimeScale);
    }

    this.mixer.update(dt);
  }
}

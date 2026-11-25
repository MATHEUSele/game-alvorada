import * as THREE from 'three';

function normalizeAngleDiff(target: number, current: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export class Player {
  public readonly group = new THREE.Group();
  public readonly radius = 0.45;

  private readonly bodyPivot = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly capePivot = new THREE.Group();
  private readonly rightArmPivot = new THREE.Group();
  private readonly leftArmPivot = new THREE.Group();
  private readonly rightLegPivot = new THREE.Group();
  private readonly leftLegPivot = new THREE.Group();
  private readonly baseRing: THREE.Mesh;

  private readonly velocity = new THREE.Vector3();
  private readonly targetVelocity = new THREE.Vector3();
  private readonly walkSpeed = 5.8;
  private readonly sprintSpeed = 8.4;

  private walkPhase = 0;
  private isSprinting = false;

  constructor() {
    const armorMat = new THREE.MeshStandardMaterial({
      color: '#464e5e',
      roughness: 0.42,
      metalness: 0.72,
    });
    const darkClothMat = new THREE.MeshStandardMaterial({
      color: '#1b1d26',
      roughness: 0.88,
      metalness: 0.08,
    });
    const crimsonClothMat = new THREE.MeshStandardMaterial({
      color: '#5a1e24',
      roughness: 0.82,
      metalness: 0.1,
    });
    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: '#c99e52',
      roughness: 0.35,
      metalness: 0.85,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: '#bfc8d6',
      roughness: 0.25,
      metalness: 0.9,
    });

    // Anel sutil estilo ARPG/MOBA sob os pés
    const ringGeo = new THREE.RingGeometry(0.46, 0.56, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#d6b16e',
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.baseRing = new THREE.Mesh(ringGeo, ringMat);
    this.baseRing.rotation.x = -Math.PI / 2;
    this.baseRing.position.y = 0.025;
    this.group.add(this.baseRing);

    // Seta discreta indicando frente do personagem (+Z local)
    const arrowGeo = new THREE.ConeGeometry(0.11, 0.22, 3);
    const arrow = new THREE.Mesh(
      arrowGeo,
      new THREE.MeshBasicMaterial({
        color: '#f0cc85',
        transparent: true,
        opacity: 0.78,
      }),
    );
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.03, 0.64);
    this.bodyPivot.add(arrow);

    this.group.add(this.bodyPivot);

    // Pernas
    const legGeo = new THREE.BoxGeometry(0.22, 0.68, 0.24);
    const bootGeo = new THREE.BoxGeometry(0.24, 0.22, 0.32);

    const buildLeg = (pivot: THREE.Group, xOffset: number): void => {
      pivot.position.set(xOffset, 0.72, 0);
      const leg = new THREE.Mesh(legGeo, darkClothMat);
      leg.position.y = -0.34;
      leg.castShadow = true;
      pivot.add(leg);

      const boot = new THREE.Mesh(bootGeo, armorMat);
      boot.position.set(0, -0.61, 0.04);
      boot.castShadow = true;
      pivot.add(boot);

      this.bodyPivot.add(pivot);
    };

    buildLeg(this.leftLegPivot, -0.17);
    buildLeg(this.rightLegPivot, 0.17);

    // Tronco / Armadura
    this.torso.position.set(0, 1.08, 0);
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.68, 0.36),
      armorMat,
    );
    chest.castShadow = true;
    chest.receiveShadow = true;
    this.torso.add(chest);

    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.61, 0.11, 0.39),
      goldTrimMat,
    );
    belt.position.y = -0.28;
    this.torso.add(belt);

    // Ombreiras
    for (const side of [-1, 1]) {
      const pauldron = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 6),
        armorMat,
      );
      pauldron.scale.set(1.0, 0.75, 1.0);
      pauldron.position.set(side * 0.38, 0.25, 0);
      pauldron.castShadow = true;
      this.torso.add(pauldron);
    }

    // Capa nas costas (-Z local)
    this.capePivot.position.set(0, 0.28, -0.2);
    const capeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.98, 0.05),
      crimsonClothMat,
    );
    capeMesh.position.set(0, -0.49, -0.02);
    capeMesh.rotation.x = 0.08;
    capeMesh.castShadow = true;
    this.capePivot.add(capeMesh);
    this.torso.add(this.capePivot);

    // Cabeça + Capuz Dark Fantasy
    this.headGroup.position.set(0, 0.56, 0);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.34, 0.32),
      darkClothMat,
    );
    head.castShadow = true;
    this.headGroup.add(head);

    const hood = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.42, 6),
      crimsonClothMat,
    );
    hood.position.set(0, 0.14, -0.04);
    hood.rotation.x = -0.18;
    hood.castShadow = true;
    this.headGroup.add(hood);

    // Olhos brilhantes sutis sob o capuz (+Z local)
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffd38a' });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.04), eyeMat);
      eye.position.set(side * 0.075, 0.01, 0.16);
      this.headGroup.add(eye);
    }
    this.torso.add(this.headGroup);

    // Braço Direito + Espada Longa
    this.rightArmPivot.position.set(0.4, 0.22, 0);
    const rArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.58, 0.18),
      armorMat,
    );
    rArm.position.y = -0.26;
    rArm.castShadow = true;
    this.rightArmPivot.add(rArm);

    const swordGroup = new THREE.Group();
    swordGroup.position.set(0, -0.52, 0.12);
    swordGroup.rotation.x = Math.PI * 0.38;

    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.24, 6),
      darkClothMat,
    );
    swordGroup.add(hilt);

    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.05, 0.07),
      goldTrimMat,
    );
    guard.position.y = 0.12;
    swordGroup.add(guard);

    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.02, 0.025),
      steelMat,
    );
    blade.position.y = 0.64;
    blade.castShadow = true;
    swordGroup.add(blade);

    this.rightArmPivot.add(swordGroup);
    this.torso.add(this.rightArmPivot);

    // Braço Esquerdo + Escudo
    this.leftArmPivot.position.set(-0.4, 0.22, 0);
    const lArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.58, 0.18),
      armorMat,
    );
    lArm.position.y = -0.26;
    lArm.castShadow = true;
    this.leftArmPivot.add(lArm);

    const shield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.26, 0.07, 6),
      armorMat,
    );
    shield.rotation.z = Math.PI / 2;
    shield.position.set(-0.14, -0.34, 0.08);
    shield.castShadow = true;
    this.leftArmPivot.add(shield);

    const shieldTrim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.09, 6),
      goldTrimMat,
    );
    shieldTrim.rotation.z = Math.PI / 2;
    shieldTrim.position.set(-0.15, -0.34, 0.08);
    this.leftArmPivot.add(shieldTrim);

    this.torso.add(this.leftArmPivot);
    this.bodyPivot.add(this.torso);

    // Posição inicial no centro do Santuário
    this.group.position.set(0, 0, 0);
    // Olhando inicialmente na direção sudoeste/frontal agradável para a câmera
    this.bodyPivot.rotation.y = Math.PI * 0.25;
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

    // Rotação suave pelo menor ângulo
    if (speed > 0.2) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      const diff = normalizeAngleDiff(targetYaw, this.bodyPivot.rotation.y);
      const rotAlpha = 1 - Math.exp(-14 * dt);
      this.bodyPivot.rotation.y += diff * rotAlpha;
    }

    this.animate(speed, dt, elapsed);
  }

  private animate(speed: number, dt: number, elapsed: number): void {
    if (speed > 0.25) {
      const strideFreq = 2.1 + speed * 0.95;
      this.walkPhase += dt * strideFreq;

      const swing = Math.sin(this.walkPhase) * Math.min(0.75, speed * 0.09);
      this.leftLegPivot.rotation.x = swing;
      this.rightLegPivot.rotation.x = -swing;

      this.rightArmPivot.rotation.x = swing * 0.72 - 0.15;
      this.leftArmPivot.rotation.x = -swing * 0.55 - 0.1;

      const bob = Math.abs(Math.cos(this.walkPhase)) * 0.055;
      this.torso.position.y = 1.08 + bob;
      this.torso.rotation.x = Math.min(0.18, speed * 0.02);
      this.capePivot.rotation.x = 0.22 + Math.sin(this.walkPhase * 2) * 0.08 + speed * 0.03;
    } else {
      const idleAlpha = 1 - Math.exp(-10 * dt);
      const breathe = Math.sin(elapsed * 2.4) * 0.02;

      this.leftLegPivot.rotation.x += (0 - this.leftLegPivot.rotation.x) * idleAlpha;
      this.rightLegPivot.rotation.x += (0 - this.rightLegPivot.rotation.x) * idleAlpha;
      this.rightArmPivot.rotation.x += (-0.12 - this.rightArmPivot.rotation.x) * idleAlpha;
      this.leftArmPivot.rotation.x += (-0.08 - this.leftArmPivot.rotation.x) * idleAlpha;

      this.torso.position.y = 1.08 + breathe;
      this.torso.rotation.x += (0 - this.torso.rotation.x) * idleAlpha;
      this.capePivot.rotation.x = 0.06 + Math.sin(elapsed * 1.9) * 0.03;
    }
  }
}

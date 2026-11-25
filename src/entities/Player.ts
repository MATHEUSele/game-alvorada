import * as THREE from 'three';

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

export class Player {
  public readonly group = new THREE.Group();
  public readonly radius = 0.45;
  public readonly sockets: PlayerEquipmentSockets;

  private readonly bodyPivot = new THREE.Group();
  private readonly pelvisPivot = new THREE.Group();
  private readonly chestPivot = new THREE.Group();
  private readonly headPivot = new THREE.Group();

  private readonly leftShoulderPivot = new THREE.Group();
  private readonly leftElbowPivot = new THREE.Group();
  private readonly rightShoulderPivot = new THREE.Group();
  private readonly rightElbowPivot = new THREE.Group();

  private readonly leftHipPivot = new THREE.Group();
  private readonly leftKneePivot = new THREE.Group();
  private readonly rightHipPivot = new THREE.Group();
  private readonly rightKneePivot = new THREE.Group();

  private readonly baseRing: THREE.Mesh;

  private readonly velocity = new THREE.Vector3();
  private readonly targetVelocity = new THREE.Vector3();
  private readonly walkSpeed = 5.8;
  private readonly sprintSpeed = 8.4;

  private walkPhase = 0;
  private isSprinting = false;

  constructor() {
    // Paleta estilizada estilo Sett (LoL) + roupa inicial simples estilo Last Day on Earth
    const skinMat = new THREE.MeshStandardMaterial({
      color: '#d99e79',
      roughness: 0.64,
      metalness: 0.04,
    });
    const hairMainMat = new THREE.MeshStandardMaterial({
      color: '#3f221c',
      roughness: 0.72,
      metalness: 0.06,
    });
    const hairHighlightMat = new THREE.MeshStandardMaterial({
      color: '#63372c',
      roughness: 0.68,
      metalness: 0.06,
    });
    const vestMat = new THREE.MeshStandardMaterial({
      color: '#32404e',
      roughness: 0.78,
      metalness: 0.08,
    });
    const vestTrimMat = new THREE.MeshStandardMaterial({
      color: '#506273',
      roughness: 0.72,
      metalness: 0.1,
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: '#523422',
      roughness: 0.68,
      metalness: 0.12,
    });
    const darkLeatherMat = new THREE.MeshStandardMaterial({
      color: '#2e1e15',
      roughness: 0.65,
      metalness: 0.15,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#d2a349',
      roughness: 0.34,
      metalness: 0.82,
    });
    const wrapMat = new THREE.MeshStandardMaterial({
      color: '#e3dac8',
      roughness: 0.84,
      metalness: 0.04,
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: '#3d4239',
      roughness: 0.86,
      metalness: 0.04,
    });
    const pantsPatchMat = new THREE.MeshStandardMaterial({
      color: '#2d312b',
      roughness: 0.88,
      metalness: 0.04,
    });
    const soleMat = new THREE.MeshStandardMaterial({
      color: '#181412',
      roughness: 0.9,
      metalness: 0.08,
    });

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

    // Pelve / Quadril (y = 0.94)
    this.pelvisPivot.position.set(0, 0.94, 0);
    this.bodyPivot.add(this.pelvisPivot);

    const pelvisMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.175, 0.165, 0.17, 14),
      pantsMat,
    );
    pelvisMesh.scale.set(1.16, 1, 0.82);
    pelvisMesh.castShadow = true;
    pelvisMesh.receiveShadow = true;
    this.pelvisPivot.add(pelvisMesh);

    // Cinto utilitário de couro + fivela de latão + bolsinhas (Last Day on Earth)
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.186, 0.184, 0.085, 16),
      darkLeatherMat,
    );
    belt.scale.set(1.16, 1, 0.85);
    belt.position.y = 0.055;
    belt.castShadow = true;
    this.pelvisPivot.add(belt);

    const buckle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.042, 0.03, 6),
      brassMat,
    );
    buckle.rotation.x = Math.PI / 2;
    buckle.position.set(0, 0.055, 0.155);
    this.pelvisPivot.add(buckle);

    for (const side of [-1, 1]) {
      const pouch = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.045, 0.055, 6, 8),
        leatherMat,
      );
      pouch.scale.set(0.8, 1, 1.1);
      pouch.position.set(side * 0.21, 0.02, -0.02);
      pouch.castShadow = true;
      this.pelvisPivot.add(pouch);
    }

    // Tronco Atlético em V + Regata/Colete simples aberto no peito
    this.chestPivot.position.set(0, 0.08, 0);
    this.pelvisPivot.add(this.chestPivot);

    // Abdômen + peitoral largo (pele na parte central superior para gola aberta)
    const upperTorsoSkin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.225, 0.165, 0.43, 14),
      skinMat,
    );
    upperTorsoSkin.scale.set(1.22, 1, 0.82);
    upperTorsoSkin.position.y = 0.22;
    upperTorsoSkin.castShadow = true;
    upperTorsoSkin.receiveShadow = true;
    this.chestPivot.add(upperTorsoSkin);

    // Contornos suaves do peitoral
    for (const side of [-1, 1]) {
      const pec = new THREE.Mesh(
        new THREE.SphereGeometry(0.115, 12, 10),
        skinMat,
      );
      pec.scale.set(1.08, 0.82, 0.65);
      pec.position.set(side * 0.1, 0.31, 0.125);
      pec.castShadow = true;
      this.chestPivot.add(pec);
    }

    // Camisa/colete simples com frente aberta em V
    const vestLower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.195, 0.174, 0.2, 14),
      vestMat,
    );
    vestLower.scale.set(1.22, 1, 0.84);
    vestLower.position.y = 0.11;
    vestLower.castShadow = true;
    this.chestPivot.add(vestLower);

    const vestBack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.236, 0.195, 0.28, 14, 1, false, Math.PI * 0.45, Math.PI * 1.1),
      vestMat,
    );
    vestBack.scale.set(1.22, 1, 0.85);
    vestBack.position.y = 0.31;
    vestBack.castShadow = true;
    this.chestPivot.add(vestBack);

    // Lapelas laterais do colete deixando o peitoral em V visível (estilo Sett + LDOE)
    for (const side of [-1, 1]) {
      const lapel = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.068, 0.23, 6, 10),
        vestMat,
      );
      lapel.scale.set(1.05, 1, 0.72);
      lapel.position.set(side * 0.15, 0.31, 0.115);
      lapel.rotation.z = side * 0.22;
      lapel.castShadow = true;
      this.chestPivot.add(lapel);

      const collarTrim = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.022, 0.21, 5, 8),
        vestTrimMat,
      );
      collarTrim.position.set(side * 0.115, 0.32, 0.145);
      collarTrim.rotation.z = side * 0.26;
      this.chestPivot.add(collarTrim);
    }

    // Tira transversal de couro de sobrevivente cruzando o tronco + fivela
    const slingStrap = new THREE.Mesh(
      new THREE.TorusGeometry(0.245, 0.024, 8, 22),
      leatherMat,
    );
    slingStrap.scale.set(1.12, 1.32, 0.86);
    slingStrap.position.set(0, 0.24, 0.01);
    slingStrap.rotation.set(0.12, 0.22, 0.68);
    slingStrap.castShadow = true;
    this.chestPivot.add(slingStrap);

    // Ombreira leve assimétrica de couro no ombro esquerdo (toque estiloso de lutador/aventureiro)
    const leftPad = new THREE.Mesh(
      new THREE.SphereGeometry(0.135, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
      leatherMat,
    );
    leftPad.scale.set(1.15, 0.85, 1.05);
    leftPad.position.set(-0.295, 0.425, 0);
    leftPad.rotation.z = 0.42;
    leftPad.castShadow = true;
    this.chestPivot.add(leftPad);

    const padStud = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 8, 8),
      brassMat,
    );
    padStud.position.set(-0.34, 0.46, 0.07);
    this.chestPivot.add(padStud);

    // Cabeça + Rosto + Cabelo estilizado inspirado no Sett
    this.headPivot.position.set(0, 0.5, 0);
    this.chestPivot.add(this.headPivot);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.076, 0.095, 0.14, 12),
      skinMat,
    );
    neck.position.y = -0.02;
    neck.castShadow = true;
    this.headPivot.add(neck);

    const headSkull = new THREE.Mesh(
      new THREE.SphereGeometry(0.145, 16, 14),
      skinMat,
    );
    headSkull.scale.set(0.92, 1.12, 0.98);
    headSkull.position.y = 0.13;
    headSkull.castShadow = true;
    headSkull.receiveShadow = true;
    this.headPivot.add(headSkull);

    // Maxilar definido
    const jaw = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.072, 0.11, 12),
      skinMat,
    );
    jaw.scale.set(0.95, 1, 0.92);
    jaw.position.set(0, 0.055, 0.022);
    jaw.castShadow = true;
    this.headPivot.add(jaw);

    // Orelhas
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 8, 8),
        skinMat,
      );
      ear.scale.set(0.45, 1.0, 0.7);
      ear.position.set(side * 0.135, 0.12, -0.005);
      this.headPivot.add(ear);
    }

    // Nariz e sobrancelhas/olhos expressivos
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.055, 6),
      skinMat,
    );
    nose.rotation.x = Math.PI * 0.42;
    nose.position.set(0, 0.115, 0.145);
    this.headPivot.add(nose);

    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: '#f4f0e8' });
    const eyeIrisMat = new THREE.MeshBasicMaterial({ color: '#2b2420' });
    for (const side of [-1, 1]) {
      const brow = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.011, 0.042, 4, 6),
        hairMainMat,
      );
      brow.rotation.z = Math.PI / 2 - side * 0.16;
      brow.position.set(side * 0.052, 0.16, 0.132);
      this.headPivot.add(brow);

      const sclera = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 8, 8),
        eyeWhiteMat,
      );
      sclera.scale.set(1.1, 0.68, 0.5);
      sclera.position.set(side * 0.05, 0.135, 0.128);
      this.headPivot.add(sclera);

      const iris = new THREE.Mesh(
        new THREE.SphereGeometry(0.013, 8, 8),
        eyeIrisMat,
      );
      iris.position.set(side * 0.05, 0.135, 0.136);
      this.headPivot.add(iris);
    }

    // Cabelo estilizado em mechas volumosas jogadas para trás/cima (referência Sett)
    const hairCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.152, 14, 12),
      hairMainMat,
    );
    hairCrown.scale.set(0.98, 0.94, 1.05);
    hairCrown.position.set(0, 0.175, -0.025);
    hairCrown.castShadow = true;
    this.headPivot.add(hairCrown);

    const hairSpikes: Array<[number, number, number, number, number, number, number, boolean]> = [
      // [x, y, z, radius, length, rotX, rotZ, highlight]
      [0, 0.28, -0.04, 0.068, 0.16, -0.68, 0, true],
      [-0.07, 0.26, -0.02, 0.058, 0.14, -0.58, 0.34, false],
      [0.07, 0.26, -0.02, 0.058, 0.14, -0.58, -0.34, true],
      [-0.11, 0.21, -0.07, 0.052, 0.13, -0.82, 0.56, false],
      [0.11, 0.21, -0.07, 0.052, 0.13, -0.82, -0.56, false],
      [0, 0.17, -0.14, 0.074, 0.15, -1.05, 0, false],
      [-0.08, 0.12, -0.12, 0.054, 0.12, -1.12, 0.25, true],
      [0.08, 0.12, -0.12, 0.054, 0.12, -1.12, -0.25, false],
      // Mecha frontal estilizada caindo de lado
      [0.055, 0.23, 0.095, 0.036, 0.1, 0.48, -0.45, true],
    ];
    for (const [hx, hy, hz, r, len, rx, rz, hl] of hairSpikes) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(r, len, 8),
        hl ? hairHighlightMat : hairMainMat,
      );
      spike.position.set(hx, hy, hz);
      spike.rotation.set(rx, 0, rz);
      spike.castShadow = true;
      this.headPivot.add(spike);
    }

    // Braços Articulados (ombro -> cotovelo -> antebraço com faixas de luta -> punho)
    const rightHandSocket = new THREE.Group();
    const leftHandSocket = new THREE.Group();

    const buildArm = (
      shoulderPivot: THREE.Group,
      elbowPivot: THREE.Group,
      handSocket: THREE.Group,
      side: number,
    ): void => {
      shoulderPivot.position.set(side * 0.295, 0.385, 0);
      this.chestPivot.add(shoulderPivot);

      const deltoid = new THREE.Mesh(
        new THREE.SphereGeometry(0.088, 12, 10),
        skinMat,
      );
      deltoid.scale.set(1.05, 1.05, 0.95);
      deltoid.castShadow = true;
      shoulderPivot.add(deltoid);

      const bicep = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.064, 0.17, 6, 10),
        skinMat,
      );
      bicep.position.y = -0.145;
      bicep.castShadow = true;
      shoulderPivot.add(bicep);

      // Cotovelo (sempre dobra para frente em rotation.x <= 0)
      elbowPivot.position.set(0, -0.275, 0);
      shoulderPivot.add(elbowPivot);

      const elbowJoint = new THREE.Mesh(
        new THREE.SphereGeometry(0.058, 10, 8),
        skinMat,
      );
      elbowPivot.add(elbowJoint);

      const forearmSkin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.052, 0.14, 10),
        skinMat,
      );
      forearmSkin.position.y = -0.075;
      forearmSkin.castShadow = true;
      elbowPivot.add(forearmSkin);

      // Bandagem / faixa de lutador no antebraço e punho (referência Sett)
      const wristWrap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.052, 0.16, 10),
        wrapMat,
      );
      wristWrap.position.y = -0.175;
      wristWrap.castShadow = true;
      elbowPivot.add(wristWrap);

      const strap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.061, 0.061, 0.032, 10),
        leatherMat,
      );
      strap.position.y = -0.115;
      elbowPivot.add(strap);

      const fist = new THREE.Mesh(
        new THREE.SphereGeometry(0.062, 10, 10),
        wrapMat,
      );
      fist.scale.set(0.9, 1.1, 1.08);
      fist.position.set(0, -0.275, 0.01);
      fist.castShadow = true;
      elbowPivot.add(fist);

      handSocket.position.set(0, -0.275, 0.02);
      elbowPivot.add(handSocket);
    };

    buildArm(this.leftShoulderPivot, this.leftElbowPivot, leftHandSocket, -1);
    buildArm(this.rightShoulderPivot, this.rightElbowPivot, rightHandSocket, 1);

    // Pernas Articuladas (quadril -> coxa -> joelho -> canela/bota tocando exatamente y = 0)
    const buildLeg = (
      hipPivot: THREE.Group,
      kneePivot: THREE.Group,
      side: number,
    ): void => {
      hipPivot.position.set(side * 0.125, -0.02, 0);
      this.pelvisPivot.add(hipPivot);

      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.108, 0.088, 0.42, 12),
        pantsMat,
      );
      thigh.position.y = -0.21;
      thigh.castShadow = true;
      thigh.receiveShadow = true;
      hipPivot.add(thigh);

      // Bolso cargo lateral na calça simples (Last Day on Earth)
      const cargoPocket = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.035, 0.08, 5, 8),
        pantsPatchMat,
      );
      cargoPocket.scale.set(0.65, 1, 1.15);
      cargoPocket.position.set(side * 0.095, -0.21, 0.01);
      hipPivot.add(cargoPocket);

      // Joelho (dobra apenas para trás: rotation.x >= 0)
      kneePivot.position.set(0, -0.44, 0);
      hipPivot.add(kneePivot);

      const kneeCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.082, 10, 8),
        pantsPatchMat,
      );
      kneeCap.scale.set(0.98, 1.05, 1.05);
      kneePivot.add(kneeCap);

      const lowerPant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.084, 0.072, 0.18, 12),
        pantsMat,
      );
      lowerPant.position.y = -0.09;
      lowerPant.castShadow = true;
      kneePivot.add(lowerPant);

      // Bota de couro de cano médio apoiada em y = -0.48 (mundo y = 0.00)
      const bootShaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.082, 0.074, 0.24, 12),
        darkLeatherMat,
      );
      bootShaft.position.y = -0.28;
      bootShaft.castShadow = true;
      kneePivot.add(bootShaft);

      const bootCuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.088, 0.086, 0.05, 12),
        leatherMat,
      );
      bootCuff.position.y = -0.175;
      kneePivot.add(bootCuff);

      const bootFoot = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.07, 0.12, 6, 10),
        darkLeatherMat,
      );
      bootFoot.rotation.x = Math.PI / 2;
      bootFoot.scale.set(1.05, 1.0, 0.72);
      bootFoot.position.set(0, -0.41, 0.055);
      bootFoot.castShadow = true;
      kneePivot.add(bootFoot);

      const bootSole = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.074, 0.13, 6, 10),
        soleMat,
      );
      bootSole.rotation.x = Math.PI / 2;
      bootSole.scale.set(1.06, 1.0, 0.35);
      bootSole.position.set(0, -0.454, 0.055);
      kneePivot.add(bootSole);
    };

    buildLeg(this.leftHipPivot, this.leftKneePivot, -1);
    buildLeg(this.rightHipPivot, this.rightKneePivot, 1);

    // Sockets preparados para futuros itens da Forja/Loja
    const backSocket = new THREE.Group();
    backSocket.position.set(0, 0.28, -0.2);
    this.chestPivot.add(backSocket);

    this.sockets = {
      head: this.headPivot,
      chest: this.chestPivot,
      back: backSocket,
      rightHand: rightHandSocket,
      leftHand: leftHandSocket,
    };

    // Posição e orientação iniciais no centro do Salão
    this.group.position.set(0, 0, 0);
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
      const rotAlpha = 1 - Math.exp(-15 * dt);
      this.bodyPivot.rotation.y += diff * rotAlpha;
    }

    this.animate(speed, dt, elapsed);
  }

  private animate(speed: number, dt: number, elapsed: number): void {
    if (speed > 0.25) {
      const speedNorm = Math.min(1, speed / this.sprintSpeed);
      const strideFreq = 3.0 + speed * 0.95;
      this.walkPhase += dt * strideFreq;

      const s = Math.sin(this.walkPhase);
      const c = Math.cos(this.walkPhase);
      const hipAmp = 0.28 + speedNorm * 0.44;

      // Quadril: negativo = perna vai para frente (+Z)
      this.leftHipPivot.rotation.x = s * hipAmp;
      this.rightHipPivot.rotation.x = -s * hipAmp;

      // Joelhos: SEMPRE >= 0 (dobram apenas para trás durante o balanço da perna)
      this.leftKneePivot.rotation.x =
        0.08 + Math.max(0, -c) * (0.35 + speedNorm * 0.62);
      this.rightKneePivot.rotation.x =
        0.08 + Math.max(0, c) * (0.35 + speedNorm * 0.62);

      // Braços em oposição às pernas + postura aberta de lutador
      const armAmp = 0.3 + speedNorm * 0.45;
      this.rightShoulderPivot.rotation.x = s * armAmp - 0.08;
      this.leftShoulderPivot.rotation.x = -s * armAmp - 0.08;
      this.rightShoulderPivot.rotation.z = 0.14;
      this.leftShoulderPivot.rotation.z = -0.14;

      // Cotovelos: SEMPRE <= 0 (dobram para frente)
      this.rightElbowPivot.rotation.x =
        -(0.58 + speedNorm * 0.55) + Math.max(0, -s) * 0.24;
      this.leftElbowPivot.rotation.x =
        -(0.58 + speedNorm * 0.55) + Math.max(0, s) * 0.24;

      // Movimento orgânico de pelve, contra-rotação do peito e inclinação frontal
      const bob = Math.abs(c) * (0.03 + speedNorm * 0.035);
      this.pelvisPivot.position.y = 0.93 + bob;
      this.chestPivot.rotation.x = 0.07 + speedNorm * 0.14;
      this.chestPivot.rotation.y = -s * (0.07 + speedNorm * 0.06);
      this.headPivot.rotation.x = -(0.04 + speedNorm * 0.08);
      this.headPivot.rotation.y = s * 0.03;
    } else {
      const idleAlpha = 1 - Math.exp(-10 * dt);
      const breathe = Math.sin(elapsed * 2.2);

      this.leftHipPivot.rotation.x += (0 - this.leftHipPivot.rotation.x) * idleAlpha;
      this.rightHipPivot.rotation.x += (0 - this.rightHipPivot.rotation.x) * idleAlpha;
      this.leftKneePivot.rotation.x += (0.06 - this.leftKneePivot.rotation.x) * idleAlpha;
      this.rightKneePivot.rotation.x += (0.06 - this.rightKneePivot.rotation.x) * idleAlpha;

      // Guarda relaxada estilo Sett (ombros abertos, cotovelos levemente flexionados)
      this.rightShoulderPivot.rotation.x +=
        (-0.08 + breathe * 0.02 - this.rightShoulderPivot.rotation.x) * idleAlpha;
      this.leftShoulderPivot.rotation.x +=
        (-0.08 - breathe * 0.02 - this.leftShoulderPivot.rotation.x) * idleAlpha;
      this.rightShoulderPivot.rotation.z +=
        (0.16 - this.rightShoulderPivot.rotation.z) * idleAlpha;
      this.leftShoulderPivot.rotation.z +=
        (-0.16 - this.leftShoulderPivot.rotation.z) * idleAlpha;

      this.rightElbowPivot.rotation.x +=
        (-0.56 + breathe * 0.03 - this.rightElbowPivot.rotation.x) * idleAlpha;
      this.leftElbowPivot.rotation.x +=
        (-0.56 + breathe * 0.03 - this.leftElbowPivot.rotation.x) * idleAlpha;

      this.pelvisPivot.position.y +=
        (0.94 + breathe * 0.012 - this.pelvisPivot.position.y) * idleAlpha;
      this.chestPivot.rotation.x += (0.02 - this.chestPivot.rotation.x) * idleAlpha;
      this.chestPivot.rotation.y += (0 - this.chestPivot.rotation.y) * idleAlpha;
      this.headPivot.rotation.x +=
        (breathe * 0.02 - this.headPivot.rotation.x) * idleAlpha;
      this.headPivot.rotation.y +=
        (Math.sin(elapsed * 0.9) * 0.035 - this.headPivot.rotation.y) * idleAlpha;
    }
  }
}

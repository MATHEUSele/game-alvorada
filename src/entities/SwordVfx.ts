import * as THREE from 'three';

export type SwordSkillType = 'slash' | 'spin' | 'thrust' | 'ult';

export class SwordVfx {
  public readonly group = new THREE.Group();

  private readonly slashArc: THREE.Mesh;
  private readonly slashMat: THREE.MeshBasicMaterial;
  private slashTimer = 0;
  private readonly slashDuration = 0.36;

  private readonly spinGroup = new THREE.Group();
  private readonly spinOuterRing: THREE.Mesh;
  private readonly spinInnerArc: THREE.Mesh;
  private readonly spinGroundRing: THREE.Mesh;
  private readonly spinOuterMat: THREE.MeshBasicMaterial;
  private readonly spinInnerMat: THREE.MeshBasicMaterial;
  private readonly spinGroundMat: THREE.MeshBasicMaterial;
  private spinTimer = 0;
  private readonly spinDuration = 1.05;

  private readonly thrustGroup = new THREE.Group();
  private readonly thrustCone: THREE.Mesh;
  private readonly thrustRing: THREE.Mesh;
  private readonly thrustMat: THREE.MeshBasicMaterial;
  private readonly thrustRingMat: THREE.MeshBasicMaterial;
  private thrustTimer = 0;
  private readonly thrustDuration = 0.4;

  private readonly ultGroup = new THREE.Group();
  private readonly ultAura: THREE.Mesh;
  private readonly ultAuraMat: THREE.MeshBasicMaterial;
  private readonly ultShockwave: THREE.Mesh;
  private readonly ultShockwaveMat: THREE.MeshBasicMaterial;
  private readonly ultRing: THREE.Mesh;
  private readonly ultRingMat: THREE.MeshBasicMaterial;
  private readonly ultPillar: THREE.Mesh;
  private readonly ultPillarMat: THREE.MeshBasicMaterial;
  private ultTimer = 0;
  private readonly ultDuration = 1.3;

  constructor() {
    // 1. Ataque 1 — Arco cortante horizontal (Corte da Alvorada)
    this.slashMat = new THREE.MeshBasicMaterial({
      color: '#5ce1ff',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const slashGeo = new THREE.RingGeometry(0.82, 1.58, 32, 1, -Math.PI * 0.45, Math.PI * 0.95);
    this.slashArc = new THREE.Mesh(slashGeo, this.slashMat);
    this.slashArc.rotation.x = -Math.PI / 2;
    this.slashArc.position.set(0, 1.02, 0.25);
    this.slashArc.visible = false;
    this.group.add(this.slashArc);

    // 2. Ataque 2 — Ciclone circular 360° estilo LoL (Garen/Tryndamere)
    this.spinOuterMat = new THREE.MeshBasicMaterial({
      color: '#f59e0b',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.spinInnerMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.spinGroundMat = new THREE.MeshBasicMaterial({
      color: '#fbbf24',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.spinOuterRing = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.92, 48, 1, 0, Math.PI * 1.65),
      this.spinOuterMat,
    );
    this.spinOuterRing.rotation.x = -Math.PI / 2;
    this.spinOuterRing.position.y = 0.88;

    this.spinInnerArc = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.48, 42, 1, Math.PI * 0.5, Math.PI * 1.45),
      this.spinInnerMat,
    );
    this.spinInnerArc.rotation.x = -Math.PI / 2;
    this.spinInnerArc.position.y = 0.98;

    this.spinGroundRing = new THREE.Mesh(
      new THREE.RingGeometry(1.76, 1.9, 48),
      this.spinGroundMat,
    );
    this.spinGroundRing.rotation.x = -Math.PI / 2;
    this.spinGroundRing.position.y = 0.04;

    this.spinGroup.add(this.spinOuterRing, this.spinInnerArc, this.spinGroundRing);
    this.spinGroup.visible = false;
    this.group.add(this.spinGroup);

    // 3. Ataque 3 — Feixe perfurante da Investida Real
    this.thrustMat = new THREE.MeshBasicMaterial({
      color: '#7dd3fc',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.thrustRingMat = new THREE.MeshBasicMaterial({
      color: '#fde68a',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const coneGeo = new THREE.ConeGeometry(0.36, 2.4, 16, 1, true);
    coneGeo.rotateX(Math.PI / 2);
    this.thrustCone = new THREE.Mesh(coneGeo, this.thrustMat);
    this.thrustCone.position.set(0, 1.0, 1.45);

    this.thrustRing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.62, 24),
      this.thrustRingMat,
    );
    this.thrustRing.position.set(0, 1.0, 0.55);

    this.thrustGroup.add(this.thrustCone, this.thrustRing);
    this.thrustGroup.visible = false;
    this.group.add(this.thrustGroup);

    // 4. Ultimate — Julgamento da Alvorada (aura de salto + onda de choque dourada + pilar)
    this.ultAuraMat = new THREE.MeshBasicMaterial({
      color: '#fbbf24',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ultShockwaveMat = new THREE.MeshBasicMaterial({
      color: '#fcd34d',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ultRingMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ultPillarMat = new THREE.MeshBasicMaterial({
      color: '#fde68a',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.ultAura = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 1.15, 36),
      this.ultAuraMat,
    );
    this.ultAura.rotation.x = -Math.PI / 2;
    this.ultAura.position.y = 0.06;

    this.ultShockwave = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 1.0, 48),
      this.ultShockwaveMat,
    );
    this.ultShockwave.rotation.x = -Math.PI / 2;
    this.ultShockwave.position.set(0, 0.05, 0.55);

    this.ultRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.96, 48),
      this.ultRingMat,
    );
    this.ultRing.rotation.x = -Math.PI / 2;
    this.ultRing.position.set(0, 0.07, 0.55);

    this.ultPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.85, 4.2, 24, 1, true),
      this.ultPillarMat,
    );
    this.ultPillar.position.set(0, 2.1, 0.55);

    this.ultGroup.add(
      this.ultAura,
      this.ultShockwave,
      this.ultRing,
      this.ultPillar,
    );
    this.ultGroup.visible = false;
    this.group.add(this.ultGroup);
  }

  public trigger(skill: SwordSkillType): void {
    if (skill === 'slash') {
      this.slashTimer = this.slashDuration;
      this.slashArc.visible = true;
      this.slashArc.rotation.z = -1.1;
    } else if (skill === 'spin') {
      this.spinTimer = this.spinDuration;
      this.spinGroup.visible = true;
    } else if (skill === 'thrust') {
      this.thrustTimer = this.thrustDuration;
      this.thrustGroup.visible = true;
    } else if (skill === 'ult') {
      this.ultTimer = this.ultDuration;
      this.ultGroup.visible = true;
    }
  }

  public update(dt: number): void {
    // Slash
    if (this.slashTimer > 0) {
      this.slashTimer = Math.max(0, this.slashTimer - dt);
      const p = 1 - this.slashTimer / this.slashDuration;
      this.slashArc.rotation.z = -1.2 + p * 2.8;
      this.slashArc.scale.setScalar(0.88 + p * 0.28);
      this.slashMat.opacity = Math.sin(p * Math.PI) * 0.88;
      if (this.slashTimer <= 0) this.slashArc.visible = false;
    }

    // Spin 360°
    if (this.spinTimer > 0) {
      this.spinTimer = Math.max(0, this.spinTimer - dt);
      const p = 1 - this.spinTimer / this.spinDuration;
      this.spinOuterRing.rotation.z = -p * Math.PI * 6.5;
      this.spinInnerArc.rotation.z = -p * Math.PI * 8.0;
      const fade = p < 0.15 ? p / 0.15 : p > 0.8 ? (1 - p) / 0.2 : 1;
      this.spinOuterMat.opacity = 0.78 * fade;
      this.spinInnerMat.opacity = 0.68 * fade;
      this.spinGroundMat.opacity = 0.42 * fade;
      if (this.spinTimer <= 0) this.spinGroup.visible = false;
    }

    // Thrust
    if (this.thrustTimer > 0) {
      this.thrustTimer = Math.max(0, this.thrustTimer - dt);
      const p = 1 - this.thrustTimer / this.thrustDuration;
      const fade = Math.sin(p * Math.PI);
      this.thrustCone.scale.set(1 - p * 0.35, 1 - p * 0.35, 0.7 + p * 0.75);
      this.thrustMat.opacity = 0.72 * fade;
      this.thrustRing.scale.setScalar(0.75 + p * 1.15);
      this.thrustRingMat.opacity = 0.8 * (1 - p);
      if (this.thrustTimer <= 0) this.thrustGroup.visible = false;
    }

    // Ultimate
    if (this.ultTimer > 0) {
      this.ultTimer = Math.max(0, this.ultTimer - dt);
      const elapsed = this.ultDuration - this.ultTimer;
      const impactTime = 0.68;

      if (elapsed < impactTime) {
        const upP = elapsed / impactTime;
        this.ultAura.visible = true;
        this.ultAura.scale.setScalar(0.75 + upP * 0.6);
        this.ultAuraMat.opacity = 0.55 * Math.sin(upP * Math.PI);
        this.ultShockwave.visible = false;
        this.ultRing.visible = false;
        this.ultPillar.visible = false;
      } else {
        this.ultAura.visible = false;
        const impP = Math.min(
          1,
          (elapsed - impactTime) / (this.ultDuration - impactTime),
        );
        this.ultShockwave.visible = true;
        this.ultRing.visible = true;
        this.ultPillar.visible = true;

        const expand = 0.6 + impP * 3.1;
        this.ultShockwave.scale.setScalar(expand);
        this.ultShockwaveMat.opacity = 0.9 * (1 - impP);

        this.ultRing.scale.setScalar(0.45 + impP * 3.5);
        this.ultRingMat.opacity = 0.85 * (1 - impP);

        this.ultPillar.scale.set(1 - impP * 0.45, 1, 1 - impP * 0.45);
        this.ultPillarMat.opacity = 0.65 * Math.pow(1 - impP, 1.3);
      }

      if (this.ultTimer <= 0) this.ultGroup.visible = false;
    }
  }
}

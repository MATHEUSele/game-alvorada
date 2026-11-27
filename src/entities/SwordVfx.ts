import * as THREE from 'three';

export type SwordSkillType = 'slash' | 'spin' | 'thrust' | 'ult';

function createSlashTrailTexture(
  coreColor: string,
  edgeColor: string,
  tailFadePower = 1.6,
): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, w, h);

  // Degrade angular ao longo da lamina (u=0 cauda transparente -> u=1 ponta brilhante)
  const gradX = ctx.createLinearGradient(0, 0, w, 0);
  gradX.addColorStop(0.0, 'rgba(255,255,255,0)');
  gradX.addColorStop(0.28, 'rgba(255,255,255,0.35)');
  gradX.addColorStop(0.75, 'rgba(255,255,255,0.92)');
  gradX.addColorStop(0.95, 'rgba(255,255,255,1)');
  gradX.addColorStop(1.0, 'rgba(255,255,255,0)');

  // Forma de crescente afiado (borda externa nitida, interior esfumacado)
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;

  const cCore = new THREE.Color(coreColor);
  const cEdge = new THREE.Color(edgeColor);

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1); // 0 = borda interna, 1 = borda externa da lamina
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1); // 0 = cauda, 1 = frente do golpe

      const angularEnv =
        Math.pow(Math.sin(Math.min(1, u / 0.94) * Math.PI * 0.5), tailFadePower) *
        (u > 0.92 ? (1 - u) / 0.08 : 1);

      // Espessura da faixa afina na cauda e engrossa perto da ponta da espada
      const bandStart = 0.72 - 0.56 * Math.sin(u * Math.PI * 0.65);
      const radialNorm = (v - bandStart) / Math.max(0.08, 1 - bandStart);
      let radialEnv = 0;
      if (radialNorm > 0 && radialNorm <= 1) {
        // Pico super brilhante perto da borda externa (radialNorm ~ 0.85)
        radialEnv = Math.pow(radialNorm, 1.4) * (1 - Math.pow(Math.max(0, radialNorm - 0.88) / 0.12, 2));
      }

      // Estrias de energia cortando o ar
      const streak = 0.82 + 0.18 * Math.sin(v * 34 + u * 8);
      const alpha = Math.max(0, Math.min(1, angularEnv * radialEnv * streak));

      const edgeMix = Math.pow(Math.max(0, radialNorm), 2.5);
      const r = THREE.MathUtils.lerp(cCore.r, cEdge.r, edgeMix);
      const g = THREE.MathUtils.lerp(cCore.g, cEdge.g, edgeMix);
      const b = THREE.MathUtils.lerp(cCore.b, cEdge.b, edgeMix);

      const idx = (y * w + x) * 4;
      data[idx] = Math.round(r * 255);
      data[idx + 1] = Math.round(g * 255);
      data[idx + 2] = Math.round(b * 255);
      data[idx + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  void gradX;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Cria malha de fita em arco com UVs mapeados (u = angulo, v = raio interno->externo) */
function createArcRibbonGeometry(
  innerRadius: number,
  outerRadius: number,
  arcRadians: number,
  segments = 36,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const angle = (u - 0.5) * arcRadians;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);

    // Interno (v=0) e Externo (v=1) no plano XZ apontando para +Z
    positions.push(sa * innerRadius, 0, ca * innerRadius);
    uvs.push(u, 0);

    positions.push(sa * outerRadius, 0, ca * outerRadius);
    uvs.push(u, 1);

    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 3);
      indices.push(base, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export class SwordVfx {
  public readonly group = new THREE.Group();

  // Combo 1/2/3 de Corte Simples
  private readonly slashPivot = new THREE.Group();
  private readonly slashMesh: THREE.Mesh;
  private readonly slashMat: THREE.MeshBasicMaterial;
  private readonly slashCyanTex: THREE.CanvasTexture;
  private readonly slashGoldTex: THREE.CanvasTexture;
  private readonly slashImpactRing: THREE.Mesh;
  private readonly slashImpactMat: THREE.MeshBasicMaterial;
  private slashTimer = 0;
  private slashDuration = 0.34;
  private slashComboStep: 1 | 2 | 3 = 1;

  // Giro 360°
  private readonly spinGroup = new THREE.Group();
  private readonly spinOuterMesh: THREE.Mesh;
  private readonly spinInnerMesh: THREE.Mesh;
  private readonly spinGroundRing: THREE.Mesh;
  private readonly spinOuterMat: THREE.MeshBasicMaterial;
  private readonly spinInnerMat: THREE.MeshBasicMaterial;
  private readonly spinGroundMat: THREE.MeshBasicMaterial;
  private spinTimer = 0;
  private readonly spinDuration = 1.08;

  // Investida
  private readonly thrustGroup = new THREE.Group();
  private readonly thrustCone: THREE.Mesh;
  private readonly thrustRing: THREE.Mesh;
  private readonly thrustMat: THREE.MeshBasicMaterial;
  private readonly thrustRingMat: THREE.MeshBasicMaterial;
  private thrustTimer = 0;
  private readonly thrustDuration = 0.42;

  // Ultimate
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
  private readonly ultDuration = 1.28;

  constructor() {
    this.slashCyanTex = createSlashTrailTexture('#38bdf8', '#fffbeb', 1.45);
    this.slashGoldTex = createSlashTrailTexture('#f59e0b', '#ffffff', 1.35);

    // 1. Corte Simples — Crescente estilizado estilo LoL
    this.slashMat = new THREE.MeshBasicMaterial({
      map: this.slashCyanTex,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const slashGeo = createArcRibbonGeometry(0.68, 1.85, Math.PI * 1.18, 40);
    this.slashMesh = new THREE.Mesh(slashGeo, this.slashMat);
    this.slashPivot.position.set(0, 1.0, 0.14);
    this.slashPivot.add(this.slashMesh);
    this.slashPivot.visible = false;
    this.group.add(this.slashPivot);

    this.slashImpactMat = new THREE.MeshBasicMaterial({
      color: '#fde68a',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.slashImpactRing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.72, 32),
      this.slashImpactMat,
    );
    this.slashImpactRing.rotation.x = -Math.PI / 2;
    this.slashImpactRing.position.set(0.25, 0.05, 1.35);
    this.slashImpactRing.visible = false;
    this.group.add(this.slashImpactRing);

    // 2. Giro 360° — Dupla lamina em espiral com texturas hand-painted
    this.spinOuterMat = new THREE.MeshBasicMaterial({
      map: this.slashGoldTex,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.spinInnerMat = new THREE.MeshBasicMaterial({
      map: this.slashCyanTex,
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

    this.spinOuterMesh = new THREE.Mesh(
      createArcRibbonGeometry(0.95, 2.02, Math.PI * 1.55, 44),
      this.spinOuterMat,
    );
    this.spinOuterMesh.position.y = 0.94;

    this.spinInnerMesh = new THREE.Mesh(
      createArcRibbonGeometry(0.65, 1.65, Math.PI * 1.35, 40),
      this.spinInnerMat,
    );
    this.spinInnerMesh.position.y = 1.04;
    this.spinInnerMesh.rotation.y = Math.PI;

    this.spinGroundRing = new THREE.Mesh(
      new THREE.RingGeometry(1.82, 1.98, 48),
      this.spinGroundMat,
    );
    this.spinGroundRing.rotation.x = -Math.PI / 2;
    this.spinGroundRing.position.y = 0.04;

    this.spinGroup.add(this.spinOuterMesh, this.spinInnerMesh, this.spinGroundRing);
    this.spinGroup.visible = false;
    this.group.add(this.spinGroup);

    // 3. Investida Real — Cone perfurante + anel sonico
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

    const coneGeo = new THREE.ConeGeometry(0.38, 2.55, 16, 1, true);
    coneGeo.rotateX(Math.PI / 2);
    this.thrustCone = new THREE.Mesh(coneGeo, this.thrustMat);
    this.thrustCone.position.set(0, 1.02, 1.55);

    this.thrustRing = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.65, 24),
      this.thrustRingMat,
    );
    this.thrustRing.position.set(0, 1.02, 0.62);

    this.thrustGroup.add(this.thrustCone, this.thrustRing);
    this.thrustGroup.visible = false;
    this.group.add(this.thrustGroup);

    // 4. Ultimate — Salto com aura + onda de choque dourada + pilar da Alvorada
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
      new THREE.RingGeometry(0.55, 1.05, 48),
      this.ultShockwaveMat,
    );
    this.ultShockwave.rotation.x = -Math.PI / 2;
    this.ultShockwave.position.set(0, 0.05, 0.72);

    this.ultRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.98, 48),
      this.ultRingMat,
    );
    this.ultRing.rotation.x = -Math.PI / 2;
    this.ultRing.position.set(0, 0.07, 0.72);

    this.ultPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.9, 4.4, 24, 1, true),
      this.ultPillarMat,
    );
    this.ultPillar.position.set(0, 2.2, 0.72);

    this.ultGroup.add(
      this.ultAura,
      this.ultShockwave,
      this.ultRing,
      this.ultPillar,
    );
    this.ultGroup.visible = false;
    this.group.add(this.ultGroup);
  }

  public trigger(skill: SwordSkillType, comboStep: 1 | 2 | 3 = 1): void {
    if (skill === 'slash') {
      this.slashComboStep = comboStep;
      this.slashDuration = comboStep === 3 ? 0.44 : 0.34;
      this.slashTimer = this.slashDuration;
      this.slashPivot.visible = true;

      if (comboStep === 1) {
        this.slashMat.map = this.slashCyanTex;
        this.slashPivot.position.set(0, 1.0, 0.14);
        this.slashPivot.rotation.set(0, -0.5, -0.22);
        this.slashMesh.scale.set(1, 1, 1);
      } else if (comboStep === 2) {
        this.slashMat.map = this.slashCyanTex;
        this.slashPivot.position.set(0, 1.02, 0.14);
        this.slashPivot.rotation.set(0, 0.5, 0.24);
        this.slashMesh.scale.set(-1, 1, 1);
      } else {
        // Finisher vertical-diagonal dourado
        this.slashMat.map = this.slashGoldTex;
        this.slashPivot.position.set(0.08, 1.08, 0.24);
        this.slashPivot.rotation.set(0, 0.15, -1.25);
        this.slashMesh.scale.set(1.22, 1, 1.22);
        this.slashImpactRing.visible = false;
      }
      this.slashMat.needsUpdate = true;
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
    // Corte Simples (Combo 1/2/3)
    if (this.slashTimer > 0) {
      this.slashTimer = Math.max(0, this.slashTimer - dt);
      const p = 1 - this.slashTimer / this.slashDuration;

      if (this.slashComboStep === 1) {
        this.slashMesh.rotation.y = -1.25 + p * 2.75;
        this.slashMat.opacity = Math.sin(Math.min(1, p * 1.15) * Math.PI) * 0.95;
      } else if (this.slashComboStep === 2) {
        this.slashMesh.rotation.y = 1.25 - p * 2.75;
        this.slashMat.opacity = Math.sin(Math.min(1, p * 1.15) * Math.PI) * 0.95;
      } else {
        // Hit 3 desce de cima pra baixo (rotation.y no plano inclinado)
        this.slashMesh.rotation.y = -1.35 + p * 2.55;
        this.slashMat.opacity = Math.sin(Math.min(1, p * 1.1) * Math.PI) * 1.0;

        if (p > 0.36) {
          this.slashImpactRing.visible = true;
          const imp = (p - 0.36) / 0.64;
          this.slashImpactRing.scale.setScalar(0.55 + imp * 1.9);
          this.slashImpactMat.opacity = 0.85 * (1 - imp);
        }
      }

      if (this.slashTimer <= 0) {
        this.slashPivot.visible = false;
        this.slashImpactRing.visible = false;
      }
    }

    // Spin 360°
    if (this.spinTimer > 0) {
      this.spinTimer = Math.max(0, this.spinTimer - dt);
      const p = 1 - this.spinTimer / this.spinDuration;
      this.spinOuterMesh.rotation.y = -p * Math.PI * 5.2;
      this.spinInnerMesh.rotation.y = Math.PI - p * Math.PI * 6.4;
      const fade = p < 0.14 ? p / 0.14 : p > 0.82 ? (1 - p) / 0.18 : 1;
      this.spinOuterMat.opacity = 0.92 * fade;
      this.spinInnerMat.opacity = 0.82 * fade;
      this.spinGroundMat.opacity = 0.45 * fade;
      if (this.spinTimer <= 0) this.spinGroup.visible = false;
    }

    // Thrust
    if (this.thrustTimer > 0) {
      this.thrustTimer = Math.max(0, this.thrustTimer - dt);
      const p = 1 - this.thrustTimer / this.thrustDuration;
      const fade = Math.sin(p * Math.PI);
      this.thrustCone.scale.set(1 - p * 0.35, 1 - p * 0.35, 0.72 + p * 0.82);
      this.thrustMat.opacity = 0.78 * fade;
      this.thrustRing.scale.setScalar(0.75 + p * 1.2);
      this.thrustRingMat.opacity = 0.82 * (1 - p);
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
        this.ultAura.scale.setScalar(0.75 + upP * 0.65);
        this.ultAuraMat.opacity = 0.58 * Math.sin(upP * Math.PI);
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

        this.ultShockwave.scale.setScalar(0.6 + impP * 3.15);
        this.ultShockwaveMat.opacity = 0.92 * (1 - impP);

        this.ultRing.scale.setScalar(0.45 + impP * 3.55);
        this.ultRingMat.opacity = 0.88 * (1 - impP);

        this.ultPillar.scale.set(1 - impP * 0.45, 1, 1 - impP * 0.45);
        this.ultPillarMat.opacity = 0.68 * Math.pow(1 - impP, 1.3);
      }

      if (this.ultTimer <= 0) this.ultGroup.visible = false;
    }
  }
}

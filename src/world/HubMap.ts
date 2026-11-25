import * as THREE from 'three';
import type { BoxCollider, CircleCollider } from './Collision';
import { createProceduralTextures } from './ProceduralTextures';

interface BrazierEntry {
  light: THREE.PointLight;
  flameCore: THREE.Mesh;
  flameOuter: THREE.Mesh;
  baseIntensity: number;
  phase: number;
}

export class HubMap {
  public readonly group = new THREE.Group();
  public readonly circleColliders: CircleCollider[] = [];
  public readonly boxColliders: BoxCollider[] = [];
  public readonly boundsLimit = 17.2;

  public readonly dungeonEntrancePos = new THREE.Vector3(-10.5, 0, -10.5);
  public readonly dungeonPromptRadius = 4.4;

  private readonly braziers: BrazierEntry[] = [];
  private readonly dirLight: THREE.DirectionalLight;
  private portalLight!: THREE.PointLight;
  private portalSwirl!: THREE.Mesh;
  private emberPoints!: THREE.Points;
  private emberPositions!: Float32Array;
  private emberSeeds!: Float32Array;
  private readonly emberCount = 180;

  constructor(maxAnisotropy: number) {
    const textures = createProceduralTextures(maxAnisotropy);

    // Luz ambiente noturna fria
    const hemi = new THREE.HemisphereLight('#5c7399', '#141118', 0.65);
    this.group.add(hemi);

    // Luar direcional com sombras
    this.dirLight = new THREE.DirectionalLight('#93b4e8', 1.15);
    this.dirLight.position.set(16, 26, 12);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 70;
    const d = 24;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.group.add(this.dirLight);
    this.group.add(this.dirLight.target);

    const stoneMat = new THREE.MeshStandardMaterial({
      map: textures.wallStoneMap,
      roughness: 0.88,
      metalness: 0.08,
      color: '#8f96a6',
    });

    const darkStoneMat = new THREE.MeshStandardMaterial({
      map: textures.wallStoneMap,
      roughness: 0.92,
      metalness: 0.06,
      color: '#5a606e',
    });

    const ironMat = new THREE.MeshStandardMaterial({
      color: '#2c3038',
      roughness: 0.45,
      metalness: 0.8,
    });

    const woodMat = new THREE.MeshStandardMaterial({
      color: '#4a3324',
      roughness: 0.86,
      metalness: 0.05,
    });

    // Chão principal do pátio
    const floorGeo = new THREE.PlaneGeometry(38, 38);
    const floorMat = new THREE.MeshStandardMaterial({
      map: textures.stoneFloorMap,
      bumpMap: textures.stoneFloorBump,
      bumpScale: 0.06,
      roughness: 0.88,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Chão externo escuro estendido para fundir com a neblina
    const outerFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      new THREE.MeshStandardMaterial({ color: '#08090f', roughness: 1 }),
    );
    outerFloor.rotation.x = -Math.PI / 2;
    outerFloor.position.y = -0.04;
    this.group.add(outerFloor);

    // Círculo rúnico na praça central
    const runeGeo = new THREE.PlaneGeometry(7.2, 7.2);
    const runeMat = new THREE.MeshBasicMaterial({
      map: textures.runeDecalMap,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const runeDecal = new THREE.Mesh(runeGeo, runeMat);
    runeDecal.rotation.x = -Math.PI / 2;
    runeDecal.position.y = 0.015;
    this.group.add(runeDecal);

    // Muros de contorno baixos com aberturas nos cantos
    this.buildPerimeterWalls(stoneMat, darkStoneMat);

    // Pilares góticos formando pátio interno
    const pillarPositions: Array<[number, number, boolean]> = [
      [-5.8, 5.8, false],
      [5.8, -5.8, false],
      [6.2, 6.2, true],
      [-7.2, 0.5, false],
      [0.5, -7.2, true],
      [8.5, -1.5, false],
      [-1.5, 8.5, false],
      [-12.5, 5.5, true],
      [5.5, -12.5, false],
    ];
    for (const [px, pz, broken] of pillarPositions) {
      this.addPillar(px, pz, broken, stoneMat, darkStoneMat);
    }

    // Muretas internas baixas para testar desvio e deslizamento (wall-sliding)
    this.addLowWall(-4.2, -2.5, 3.2, 0.9, 1.35, stoneMat, darkStoneMat);
    this.addLowWall(4.8, 2.2, 0.9, 3.4, 1.35, stoneMat, darkStoneMat);
    this.addLowWall(1.2, 10.2, 4.2, 0.9, 1.25, stoneMat, darkStoneMat);

    // Braseiros com fogo animado e luz dinâmica
    const brazierCoords: Array<[number, number]> = [
      [-4.6, 4.6],
      [4.6, -4.6],
      [4.8, 4.8],
      [-7.5, -8.5],
      [-8.5, -7.5],
      [-9.5, 3.5],
      [3.5, -9.5],
    ];
    brazierCoords.forEach(([bx, bz], idx) => {
      this.addBrazier(bx, bz, ironMat, idx * 1.37);
    });

    // Entrada das Catacumbas (ao Norte / topo da tela em -10.5, -10.5)
    this.buildDungeonEntrance(stoneMat, darkStoneMat);

    // Altar/Obelisco lateral e suprimentos (barris/caixas) para dar vida ao hub
    this.addAltar(8.2, 8.2, stoneMat, darkStoneMat);
    this.addCrateCluster(6.5, -1.8, woodMat, ironMat);
    this.addCrateCluster(-2.5, 11.2, woodMat, ironMat);

    // Partículas atmosféricas (brasas + poeira)
    this.buildParticles();
  }

  private buildPerimeterWalls(
    stoneMat: THREE.Material,
    darkStoneMat: THREE.Material,
  ): void {
    const limit = 18.2;
    const segments: Array<[number, number, number, number]> = [
      // Norte-Oeste / Nordeste / Sul-Oeste / Sudeste (bordas do quadrado 36x36)
      [0, -limit, 36.8, 1.4],
      [0, limit, 36.8, 1.4],
      [-limit, 0, 1.4, 36.8],
      [limit, 0, 1.4, 36.8],
    ];

    for (const [x, z, w, d] of segments) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), stoneMat);
      wall.position.set(x, 1.1, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.group.add(wall);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.25, 0.28, d + 0.25),
        darkStoneMat,
      );
      cap.position.set(x, 2.28, z);
      cap.castShadow = true;
      cap.receiveShadow = true;
      this.group.add(cap);
    }

    // Torres baixas nos 4 cantos
    const corners: Array<[number, number]> = [
      [-limit, -limit],
      [limit, -limit],
      [-limit, limit],
      [limit, limit],
    ];
    for (const [cx, cz] of corners) {
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 3.8, 2.6),
        darkStoneMat,
      );
      tower.position.set(cx, 1.9, cz);
      tower.castShadow = true;
      tower.receiveShadow = true;
      this.group.add(tower);
    }
  }

  private addPillar(
    x: number,
    z: number,
    broken: boolean,
    stoneMat: THREE.Material,
    darkStoneMat: THREE.Material,
  ): void {
    const pillar = new THREE.Group();
    pillar.position.set(x, 0, z);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.45, 1.35),
      darkStoneMat,
    );
    base.position.y = 0.225;
    base.castShadow = true;
    base.receiveShadow = true;
    pillar.add(base);

    const height = broken ? 1.85 : 3.6;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.52, height, 8),
      stoneMat,
    );
    shaft.position.y = 0.45 + height / 2;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    pillar.add(shaft);

    if (!broken) {
      const capital = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.38, 1.25),
        darkStoneMat,
      );
      capital.position.y = 0.45 + height + 0.19;
      capital.castShadow = true;
      capital.receiveShadow = true;
      pillar.add(capital);
    } else {
      // Topo inclinado quebrado
      const shard = new THREE.Mesh(
        new THREE.ConeGeometry(0.44, 0.65, 6),
        stoneMat,
      );
      shard.position.set(0.06, 0.45 + height + 0.2, -0.05);
      shard.rotation.set(0.25, 0.4, 0.15);
      shard.castShadow = true;
      pillar.add(shard);
    }

    this.group.add(pillar);
    this.circleColliders.push({ x, z, radius: 0.72 });
  }

  private addLowWall(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    stoneMat: THREE.Material,
    darkStoneMat: THREE.Material,
  ): void {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
    wall.position.set(x, h / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.group.add(wall);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.16, 0.22, d + 0.16),
      darkStoneMat,
    );
    cap.position.set(x, h + 0.11, z);
    cap.castShadow = true;
    cap.receiveShadow = true;
    this.group.add(cap);

    this.boxColliders.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    });
  }

  private addBrazier(
    x: number,
    z: number,
    ironMat: THREE.Material,
    phase: number,
  ): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.44, 0.85, 8),
      ironMat,
    );
    pedestal.position.y = 0.425;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    g.add(pedestal);

    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.54, 0.3, 0.34, 8),
      ironMat,
    );
    bowl.position.y = 0.96;
    bowl.castShadow = true;
    g.add(bowl);

    const embers = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.08, 8),
      new THREE.MeshBasicMaterial({ color: '#ff5511' }),
    );
    embers.position.y = 1.1;
    g.add(embers);

    const flameOuter = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.72, 7),
      new THREE.MeshBasicMaterial({
        color: '#ff7b1c',
        transparent: true,
        opacity: 0.82,
      }),
    );
    flameOuter.position.y = 1.44;
    g.add(flameOuter);

    const flameCore = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.45, 6),
      new THREE.MeshBasicMaterial({ color: '#ffd875' }),
    );
    flameCore.position.y = 1.36;
    g.add(flameCore);

    const light = new THREE.PointLight('#ff7e2e', 7.5, 13, 1.7);
    light.position.set(0, 1.65, 0);
    g.add(light);

    this.group.add(g);
    this.circleColliders.push({ x, z, radius: 0.56 });
    this.braziers.push({
      light,
      flameCore,
      flameOuter,
      baseIntensity: 7.5,
      phase,
    });
  }

  private buildDungeonEntrance(
    stoneMat: THREE.Material,
    darkStoneMat: THREE.Material,
  ): void {
    const portalGroup = new THREE.Group();
    portalGroup.position.copy(this.dungeonEntrancePos);
    // Rotaciona 45° para olhar de frente para o centro do pátio (+X, +Z)
    portalGroup.rotation.y = Math.PI / 4;

    // Plataforma e degraus de entrada
    const step1 = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.22, 3.2),
      darkStoneMat,
    );
    step1.position.set(0, 0.11, 0.6);
    step1.receiveShadow = true;
    portalGroup.add(step1);

    const step2 = new THREE.Mesh(
      new THREE.BoxGeometry(4.0, 0.22, 2.2),
      stoneMat,
    );
    step2.position.set(0, 0.33, 0.1);
    step2.receiveShadow = true;
    portalGroup.add(step2);

    // Colunas laterais do arco gótico
    const leftCol = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 4.0, 1.15),
      stoneMat,
    );
    leftCol.position.set(-1.75, 2.0, -0.5);
    leftCol.castShadow = true;
    leftCol.receiveShadow = true;
    portalGroup.add(leftCol);

    const rightCol = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 4.0, 1.15),
      stoneMat,
    );
    rightCol.position.set(1.75, 2.0, -0.5);
    rightCol.castShadow = true;
    rightCol.receiveShadow = true;
    portalGroup.add(rightCol);

    // Verga superior (arco)
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.95, 1.35),
      darkStoneMat,
    );
    lintel.position.set(0, 4.25, -0.5);
    lintel.castShadow = true;
    portalGroup.add(lintel);

    const crest = new THREE.Mesh(
      new THREE.ConeGeometry(0.85, 1.2, 4),
      darkStoneMat,
    );
    crest.position.set(0, 5.25, -0.5);
    crest.rotation.y = Math.PI / 4;
    crest.castShadow = true;
    portalGroup.add(crest);

    // Fundo escuro + véu arcano brilhante indicando a descida
    const voidBack = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 3.4),
      new THREE.MeshBasicMaterial({ color: '#050711' }),
    );
    voidBack.position.set(0, 2.05, -0.75);
    portalGroup.add(voidBack);

    this.portalSwirl = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 3.2),
      new THREE.MeshBasicMaterial({
        color: '#5d92ff',
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
      }),
    );
    this.portalSwirl.position.set(0, 2.05, -0.62);
    portalGroup.add(this.portalSwirl);

    this.portalLight = new THREE.PointLight('#6498ff', 6.5, 11, 1.6);
    this.portalLight.position.set(0, 2.2, 0.6);
    portalGroup.add(this.portalLight);

    this.group.add(portalGroup);

    // Colisores das duas colunas do arco (aproximação em círculo no mundo)
    const cos = Math.cos(Math.PI / 4);
    const sin = Math.sin(Math.PI / 4);
    const localCols: Array<[number, number]> = [
      [-1.75, -0.5],
      [1.75, -0.5],
      [0, -1.25],
    ];
    for (const [lx, lz] of localCols) {
      const wx = this.dungeonEntrancePos.x + lx * cos + lz * sin;
      const wz = this.dungeonEntrancePos.z - lx * sin + lz * cos;
      this.circleColliders.push({ x: wx, z: wz, radius: 0.85 });
    }
  }

  private addAltar(
    x: number,
    z: number,
    stoneMat: THREE.Material,
    darkStoneMat: THREE.Material,
  ): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.45, 2.2),
      darkStoneMat,
    );
    base.position.y = 0.225;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.75, 1.1),
      stoneMat,
    );
    body.position.y = 1.3;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.36, 0),
      new THREE.MeshStandardMaterial({
        color: '#88b4ff',
        emissive: '#3566cc',
        emissiveIntensity: 1.2,
        roughness: 0.25,
        metalness: 0.2,
      }),
    );
    crystal.position.y = 2.65;
    crystal.castShadow = true;
    g.add(crystal);

    this.group.add(g);
    this.circleColliders.push({ x, z, radius: 1.1 });
  }

  private addCrateCluster(
    x: number,
    z: number,
    woodMat: THREE.Material,
    ironMat: THREE.Material,
  ): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.95, 0.95),
      woodMat,
    );
    crate.position.set(0, 0.475, 0);
    crate.rotation.y = 0.3;
    crate.castShadow = true;
    crate.receiveShadow = true;
    g.add(crate);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.36, 0.92, 10),
      woodMat,
    );
    barrel.position.set(0.85, 0.46, 0.25);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    g.add(barrel);

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.39, 0.39, 0.1, 10),
      ironMat,
    );
    band.position.set(0.85, 0.68, 0.25);
    g.add(band);

    this.group.add(g);
    this.circleColliders.push({ x, z, radius: 0.65 });
    this.circleColliders.push({ x: x + 0.85, z: z + 0.25, radius: 0.48 });
  }

  private buildParticles(): void {
    const geo = new THREE.BufferGeometry();
    this.emberPositions = new Float32Array(this.emberCount * 3);
    this.emberSeeds = new Float32Array(this.emberCount);

    for (let i = 0; i < this.emberCount; i++) {
      this.emberPositions[i * 3 + 0] = (Math.random() - 0.5) * 32;
      this.emberPositions[i * 3 + 1] = 0.2 + Math.random() * 4.5;
      this.emberPositions[i * 3 + 2] = (Math.random() - 0.5) * 32;
      this.emberSeeds[i] = Math.random() * Math.PI * 2;
    }

    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.emberPositions, 3),
    );

    const mat = new THREE.PointsMaterial({
      color: '#ffaa55',
      size: 0.08,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.emberPoints = new THREE.Points(geo, mat);
    this.group.add(this.emberPoints);
  }

  public isNearDungeonEntrance(pos: THREE.Vector3): boolean {
    const dx = pos.x - this.dungeonEntrancePos.x;
    const dz = pos.z - this.dungeonEntrancePos.z;
    return dx * dx + dz * dz <= this.dungeonPromptRadius * this.dungeonPromptRadius;
  }

  public update(dt: number, elapsed: number, playerPos: THREE.Vector3): void {
    // Mantém a sombra do luar centrada perto do jogador para máxima nitidez
    this.dirLight.position.set(playerPos.x + 16, 26, playerPos.z + 12);
    this.dirLight.target.position.copy(playerPos);

    // Oscilação orgânica das chamas e luzes dos braseiros
    for (let i = 0; i < this.braziers.length; i++) {
      const b = this.braziers[i];
      const wave =
        Math.sin(elapsed * 7.2 + b.phase) * 0.5 +
        Math.sin(elapsed * 13.7 + b.phase * 1.9) * 0.35 +
        Math.cos(elapsed * 21.3 + b.phase * 0.7) * 0.15;

      b.light.intensity = b.baseIntensity + wave * 1.45;
      const scaleY = 1 + wave * 0.16;
      const scaleXZ = 1 - wave * 0.08;
      b.flameOuter.scale.set(scaleXZ, scaleY, scaleXZ);
      b.flameCore.scale.set(scaleXZ, scaleY * 1.05, scaleXZ);
    }

    // Pulso suave do portal da masmorra
    const portalPulse = Math.sin(elapsed * 2.4) * 0.5 + 0.5;
    this.portalLight.intensity = 5.4 + portalPulse * 2.2;
    const swirlMat = this.portalSwirl.material as THREE.MeshBasicMaterial;
    swirlMat.opacity = 0.28 + portalPulse * 0.14;

    // Movimento das partículas de brasas
    const posAttr = this.emberPoints.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    for (let i = 0; i < this.emberCount; i++) {
      const idx = i * 3;
      const seed = this.emberSeeds[i];
      this.emberPositions[idx + 1] += dt * (0.45 + (i % 5) * 0.08);
      this.emberPositions[idx + 0] += Math.sin(elapsed * 1.4 + seed) * dt * 0.22;
      this.emberPositions[idx + 2] += Math.cos(elapsed * 1.2 + seed) * dt * 0.22;

      if (this.emberPositions[idx + 1] > 4.8) {
        this.emberPositions[idx + 1] = 0.15;
        this.emberPositions[idx + 0] = (Math.random() - 0.5) * 32;
        this.emberPositions[idx + 2] = (Math.random() - 0.5) * 32;
      }
    }
    posAttr.needsUpdate = true;
  }
}

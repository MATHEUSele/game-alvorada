import * as THREE from 'three';
import {
  findNearbyInteraction,
  type BoxCollider,
  type CircleCollider,
  type InteractionPrompt,
  type InteractionZone,
} from './Collision';
import { createHallTextures } from './ProceduralTextures';

interface BannerEntry {
  mesh: THREE.Mesh;
  phase: number;
}

const DEG2RAD = Math.PI / 180;

/**
 * Converte ângulo polar da rotunda (0 = topo central da tela, >0 = direita, <0 = esquerda)
 * para coordenadas no plano XZ alinhadas à câmera isométrica.
 */
function hallPolar(
  alpha: number,
  radius: number,
): { x: number; z: number; inwardYaw: number } {
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  const x = radius * (-c * Math.SQRT1_2 + s * Math.SQRT1_2);
  const z = radius * (-c * Math.SQRT1_2 - s * Math.SQRT1_2);
  const inwardYaw = Math.atan2(-x, -z);
  return { x, z, inwardYaw };
}

export class HubMap {
  public readonly group = new THREE.Group();
  public readonly circleColliders: CircleCollider[] = [];
  public readonly boxColliders: BoxCollider[] = [];
  public readonly boundsRadius = 16.35;

  private readonly wallRadius = 17.4;
  private readonly floorRadius = 17.8;

  private readonly sunLight: THREE.DirectionalLight;
  private readonly interactionZones: InteractionZone[] = [];
  private readonly banners: BannerEntry[] = [];
  private portalSealRing!: THREE.Mesh;
  private portalLight!: THREE.PointLight;
  private altarCrystal!: THREE.Mesh;

  private dustPoints!: THREE.Points;
  private dustPositions!: Float32Array;
  private dustSeeds!: Float32Array;
  private readonly dustCount = 220;

  private petalPoints!: THREE.Points;
  private petalPositions!: Float32Array;
  private petalSeeds!: Float32Array;
  private readonly petalCount = 130;

  constructor(maxAnisotropy: number) {
    const doorAngles = [0, -66 * DEG2RAD, 66 * DEG2RAD];
    const textures = createHallTextures(
      this.floorRadius,
      doorAngles,
      maxAnisotropy,
    );

    // Iluminação clara e envolvente estilo Salão do Rei Mago (Black Clover)
    const hemi = new THREE.HemisphereLight('#f2f7ff', '#ddd2be', 1.32);
    this.group.add(hemi);

    // Luz solar diagonal vinda da lateral direita/nordeste atravessando os janelões
    this.sunLight = new THREE.DirectionalLight('#fff0cc', 2.15);
    this.sunLight.position.set(22, 18, -15);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 75;
    const d = 24;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0004;
    this.group.add(this.sunLight);
    this.group.add(this.sunLight.target);

    // Materiais arquitetônicos reais
    const marbleMat = new THREE.MeshStandardMaterial({
      map: textures.marbleWallMap,
      color: '#f5f1e8',
      roughness: 0.45,
      metalness: 0.06,
    });

    const creamTrimMat = new THREE.MeshStandardMaterial({
      color: '#e6dfd0',
      roughness: 0.5,
      metalness: 0.08,
    });

    const goldMat = new THREE.MeshStandardMaterial({
      color: '#d4a64a',
      roughness: 0.28,
      metalness: 0.86,
    });

    const royalBlueMat = new THREE.MeshStandardMaterial({
      color: '#1f4488',
      roughness: 0.65,
      metalness: 0.14,
    });

    const bronzeMat = new THREE.MeshStandardMaterial({
      color: '#7a5a38',
      roughness: 0.38,
      metalness: 0.78,
    });

    const woodRoyalMat = new THREE.MeshStandardMaterial({
      color: '#4f3524',
      roughness: 0.65,
      metalness: 0.12,
    });

    // Piso circular de cerâmica branca desenhada
    const floorGeo = new THREE.CircleGeometry(this.floorRadius, 96);
    const floorMat = new THREE.MeshStandardMaterial({
      map: textures.ceramicFloorMap,
      bumpMap: textures.ceramicFloorBump,
      bumpScale: 0.02,
      roughness: 0.28,
      metalness: 0.06,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Base escalonada externa em mármore e ouro sob a borda do salão
    const plinthRing = new THREE.Mesh(
      new THREE.CylinderGeometry(
        this.floorRadius + 0.6,
        this.floorRadius + 1.2,
        1.4,
        72,
      ),
      creamTrimMat,
    );
    plinthRing.position.y = -0.71;
    plinthRing.receiveShadow = true;
    this.group.add(plinthRing);

    // Jardim Real externo ao redor do Salão (visível além da balaustrada e pelos janelões)
    this.buildExteriorRoyalGarden(
      textures.gardenGrassMap,
      marbleMat,
      creamTrimMat,
      goldMat,
    );

    // Paredes curvas traseiras/laterais com vãos abertos para os 4 janelões de vidro
    const windowAngles = [
      -96 * DEG2RAD,
      -33 * DEG2RAD,
      33 * DEG2RAD,
      96 * DEG2RAD,
    ];
    this.buildCurvedHallWalls(
      windowAngles,
      marbleMat,
      creamTrimMat,
      royalBlueMat,
      goldMat,
    );

    // Balaustrada frontal aberta (+116° até +244°) para nunca bloquear a câmera
    this.buildFrontBalustrade(marbleMat, goldMat);

    // Colunas caneladas com capitéis dourados ao longo do salão
    this.buildPerimeterColumns(marbleMat, goldMat);

    // Janelões altos de vidro + feixes de luz solar lateral (Dead Cells)
    this.buildStainedGlassWindows(
      windowAngles,
      marbleMat,
      goldMat,
      textures.stainedGlassMap,
      textures.sunbeamGradientMap,
    );

    // 3 Portas monumentais super estilizadas
    this.buildDungeonPortalDoor(
      0,
      marbleMat,
      goldMat,
      royalBlueMat,
      woodRoyalMat,
    );
    this.buildForgeDoor(
      -66 * DEG2RAD,
      marbleMat,
      goldMat,
      bronzeMat,
      royalBlueMat,
      woodRoyalMat,
    );
    this.buildShopDoor(
      66 * DEG2RAD,
      marbleMat,
      goldMat,
      royalBlueMat,
      woodRoyalMat,
    );

    // Espaços funcionais preparados na Home (Forja, Expositor, Baú Real, Bancada)
    this.buildHubStations(marbleMat, goldMat, royalBlueMat, woodRoyalMat, bronzeMat);

    // Poeira dourada fina flutuando na luz do sol
    this.buildSunlitDust();
  }

  private buildCurvedHallWalls(
    windowAngles: readonly number[],
    marbleMat: THREE.Material,
    creamTrimMat: THREE.Material,
    royalBlueMat: THREE.Material,
    goldMat: THREE.Material,
  ): void {
    const startDeg = -116;
    const endDeg = 116;
    const stepDeg = 4;
    const winHalfDeg = 7.5;
    const r = this.wallRadius;

    for (let deg = startDeg; deg < endDeg; deg += stepDeg) {
      const midDeg = deg + stepDeg * 0.5;
      const midRad = midDeg * DEG2RAD;
      const arcWidth = r * (stepDeg * DEG2RAD) + 0.14;

      const isWindowSpan = windowAngles.some(
        (wRad) => Math.abs(midRad - wRad) < winHalfDeg * DEG2RAD,
      );

      const pos = hallPolar(midRad, r);

      if (!isWindowSpan) {
        // Parede cheia
        const wallSeg = new THREE.Mesh(
          new THREE.BoxGeometry(arcWidth, 8.2, 0.9),
          marbleMat,
        );
        wallSeg.position.set(pos.x, 4.1, pos.z);
        wallSeg.rotation.y = pos.inwardYaw;
        wallSeg.castShadow = true;
        wallSeg.receiveShadow = true;
        this.group.add(wallSeg);
      } else {
        // Peitoril baixo sob a janela (0..1.45m) e verga superior (6.85..8.2m)
        const sill = new THREE.Mesh(
          new THREE.BoxGeometry(arcWidth, 1.45, 0.9),
          marbleMat,
        );
        sill.position.set(pos.x, 0.725, pos.z);
        sill.rotation.y = pos.inwardYaw;
        sill.castShadow = true;
        sill.receiveShadow = true;
        this.group.add(sill);

        const header = new THREE.Mesh(
          new THREE.BoxGeometry(arcWidth, 1.35, 0.9),
          marbleMat,
        );
        header.position.set(pos.x, 7.525, pos.z);
        header.rotation.y = pos.inwardYaw;
        header.castShadow = true;
        this.group.add(header);
      }

      // Rodapé inferior em toda a curva
      const baseboard = new THREE.Mesh(
        new THREE.BoxGeometry(arcWidth, 0.45, 1.12),
        creamTrimMat,
      );
      baseboard.position.set(pos.x, 0.225, pos.z);
      baseboard.rotation.y = pos.inwardYaw;
      baseboard.receiveShadow = true;
      this.group.add(baseboard);

      // Friso azul-real e cornija dourada no topo da parede
      const frieze = new THREE.Mesh(
        new THREE.BoxGeometry(arcWidth, 0.42, 1.08),
        royalBlueMat,
      );
      frieze.position.set(pos.x, 7.82, pos.z);
      frieze.rotation.y = pos.inwardYaw;
      this.group.add(frieze);

      const cornice = new THREE.Mesh(
        new THREE.BoxGeometry(arcWidth, 0.24, 1.24),
        goldMat,
      );
      cornice.position.set(pos.x, 8.28, pos.z);
      cornice.rotation.y = pos.inwardYaw;
      this.group.add(cornice);
    }
  }

  private buildFrontBalustrade(
    marbleMat: THREE.Material,
    goldMat: THREE.Material,
  ): void {
    const startDeg = 116;
    const endDeg = 244;
    const stepDeg = 6;
    const r = this.wallRadius - 0.15;

    for (let deg = startDeg; deg <= endDeg; deg += stepDeg) {
      const rad = deg * DEG2RAD;
      const pos = hallPolar(rad, r);

      // Balaústre torneado
      const baluster = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.14, 0.72, 10),
        marbleMat,
      );
      baluster.position.set(pos.x, 0.5, pos.z);
      baluster.castShadow = true;
      baluster.receiveShadow = true;
      this.group.add(baluster);

      if (deg < endDeg) {
        const midPos = hallPolar((deg + stepDeg * 0.5) * DEG2RAD, r);
        const segLen = r * (stepDeg * DEG2RAD) + 0.08;

        const lowBase = new THREE.Mesh(
          new THREE.BoxGeometry(segLen, 0.24, 0.46),
          marbleMat,
        );
        lowBase.position.set(midPos.x, 0.12, midPos.z);
        lowBase.rotation.y = midPos.inwardYaw;
        lowBase.receiveShadow = true;
        this.group.add(lowBase);

        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(segLen, 0.16, 0.5),
          marbleMat,
        );
        rail.position.set(midPos.x, 0.94, midPos.z);
        rail.rotation.y = midPos.inwardYaw;
        rail.castShadow = true;
        this.group.add(rail);

        const goldTrim = new THREE.Mesh(
          new THREE.BoxGeometry(segLen, 0.05, 0.54),
          goldMat,
        );
        goldTrim.position.set(midPos.x, 1.03, midPos.z);
        goldTrim.rotation.y = midPos.inwardYaw;
        this.group.add(goldTrim);
      }

      // Pilaretes com esfera dourada espaçados
      if ((deg - startDeg) % 32 === 0) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.58, 1.18, 0.58),
          marbleMat,
        );
        post.position.set(pos.x, 0.59, pos.z);
        post.rotation.y = pos.inwardYaw;
        post.castShadow = true;
        this.group.add(post);

        const finial = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 12, 10),
          goldMat,
        );
        finial.position.set(pos.x, 1.32, pos.z);
        this.group.add(finial);
      }
    }
  }

  private buildPerimeterColumns(
    marbleMat: THREE.Material,
    goldMat: THREE.Material,
  ): void {
    const columnAnglesDeg = [-114, -82, -50, -18, 18, 50, 82, 114];
    const r = this.wallRadius - 1.15;

    for (const deg of columnAnglesDeg) {
      const { x, z, inwardYaw } = hallPolar(deg * DEG2RAD, r);
      const colGroup = new THREE.Group();
      colGroup.position.set(x, 0, z);
      colGroup.rotation.y = inwardYaw;

      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(1.18, 0.55, 1.18),
        marbleMat,
      );
      plinth.position.y = 0.275;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      colGroup.add(plinth);

      const goldBaseRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.46, 0.5, 0.14, 16),
        goldMat,
      );
      goldBaseRing.position.y = 0.62;
      colGroup.add(goldBaseRing);

      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.43, 6.45, 16),
        marbleMat,
      );
      shaft.position.y = 3.9;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      colGroup.add(shaft);

      const goldCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.46, 0.4, 0.18, 16),
        goldMat,
      );
      goldCollar.position.y = 7.18;
      colGroup.add(goldCollar);

      const capital = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.45, 1.2),
        marbleMat,
      );
      capital.position.y = 7.5;
      capital.castShadow = true;
      colGroup.add(capital);

      this.group.add(colGroup);
      this.circleColliders.push({ x, z, radius: 0.64 });
    }
  }

  private buildStainedGlassWindows(
    windowAngles: readonly number[],
    marbleMat: THREE.Material,
    goldMat: THREE.Material,
    stainedGlassMap: THREE.CanvasTexture,
    sunbeamGradientMap: THREE.CanvasTexture,
  ): void {
    // Direção normalizada do sol vindo de (+22, +18, -15) para o chão
    const sunRayDir = new THREE.Vector3(-22, -18, 15).normalize();
    const downAxis = new THREE.Vector3(0, -1, 0);

    for (const alpha of windowAngles) {
      const pos = hallPolar(alpha, this.wallRadius - 0.05);
      const winGroup = new THREE.Group();
      winGroup.position.set(pos.x, 0, pos.z);
      winGroup.rotation.y = pos.inwardYaw;

      // Painel de vitral claro luminoso
      const glassMat = new THREE.MeshStandardMaterial({
        map: stainedGlassMap,
        emissive: '#fff4d4',
        emissiveMap: stainedGlassMap,
        emissiveIntensity: 0.62,
        roughness: 0.15,
        metalness: 0.05,
        transparent: true,
        opacity: 0.84,
      });
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 5.2), glassMat);
      pane.position.set(0, 4.15, 0.05);
      winGroup.add(pane);

      // Moldura lateral e central dourada/mármore (tracery gótico)
      const leftJamb = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 5.45, 0.72),
        marbleMat,
      );
      leftJamb.position.set(-2.02, 4.15, 0.25);
      leftJamb.castShadow = true;
      winGroup.add(leftJamb);

      const rightJamb = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 5.45, 0.72),
        marbleMat,
      );
      rightJamb.position.set(2.02, 4.15, 0.25);
      rightJamb.castShadow = true;
      winGroup.add(rightJamb);

      const mullion = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 5.2, 0.28),
        goldMat,
      );
      mullion.position.set(0, 4.15, 0.18);
      mullion.castShadow = true;
      winGroup.add(mullion);

      const transom = new THREE.Mesh(
        new THREE.BoxGeometry(3.9, 0.12, 0.28),
        goldMat,
      );
      transom.position.set(0, 5.05, 0.18);
      transom.castShadow = true;
      winGroup.add(transom);

      const sillLedge = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 0.22, 0.85),
        goldMat,
      );
      sillLedge.position.set(0, 1.48, 0.26);
      winGroup.add(sillLedge);

      this.group.add(winGroup);

      // Feixes volumétricos de sol entrando pelas janelas iluminadas pela lateral direita (+33° e +96°)
      if (alpha > 0) {
        const beamOrigin = hallPolar(alpha, this.wallRadius - 0.8);
        const beamGroup = new THREE.Group();
        beamGroup.position.set(beamOrigin.x, 4.85, beamOrigin.z);
        beamGroup.quaternion.setFromUnitVectors(downAxis, sunRayDir);

        const beamMat = new THREE.MeshBasicMaterial({
          map: sunbeamGradientMap,
          color: '#fff1c9',
          transparent: true,
          opacity: alpha > 1.0 ? 0.24 : 0.2,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });

        const planeA = new THREE.Mesh(
          new THREE.PlaneGeometry(3.6, 16.5),
          beamMat,
        );
        planeA.position.y = -8.25;
        beamGroup.add(planeA);

        const planeB = new THREE.Mesh(
          new THREE.PlaneGeometry(3.6, 16.5),
          beamMat,
        );
        planeB.position.y = -8.25;
        planeB.rotation.y = Math.PI / 2;
        beamGroup.add(planeB);

        this.group.add(beamGroup);

        // Reflexo suave de luz solar onde o feixe toca o piso de cerâmica
        const floorT = -4.85 / sunRayDir.y;
        const hitX = beamOrigin.x + sunRayDir.x * floorT;
        const hitZ = beamOrigin.z + sunRayDir.z * floorT;
        const floorPatch = new THREE.Mesh(
          new THREE.CircleGeometry(2.6, 24),
          new THREE.MeshBasicMaterial({
            color: '#fff6db',
            transparent: true,
            opacity: 0.16,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        floorPatch.rotation.x = -Math.PI / 2;
        floorPatch.position.set(hitX, 0.015, hitZ);
        this.group.add(floorPatch);
      }
    }
  }

  private buildDungeonPortalDoor(
    alpha: number,
    marbleMat: THREE.Material,
    goldMat: THREE.Material,
    royalBlueMat: THREE.Material,
    woodRoyalMat: THREE.Material,
  ): void {
    const pos = hallPolar(alpha, this.wallRadius - 0.75);
    const door = new THREE.Group();
    door.position.set(pos.x, 0, pos.z);
    door.rotation.y = pos.inwardYaw;

    // Pódio de mármore com degraus reais
    const step1 = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 0.18, 2.5),
      marbleMat,
    );
    step1.position.set(0, 0.09, 0.8);
    step1.receiveShadow = true;
    door.add(step1);

    const step2 = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 0.18, 1.75),
      marbleMat,
    );
    step2.position.set(0, 0.27, 0.45);
    step2.receiveShadow = true;
    door.add(step2);

    // Colunas monumentais do portal
    for (const side of [-1, 1]) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.48, 5.6, 12),
        marbleMat,
      );
      col.position.set(side * 2.35, 3.0, 0.15);
      col.castShadow = true;
      door.add(col);

      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.52, 0.52, 0.22, 12),
        goldMat,
      );
      ring.position.set(side * 2.35, 5.65, 0.15);
      door.add(ring);

      // Estandartes azul-real com barra dourada
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(1.15, 0.09, 0.09),
        goldMat,
      );
      pole.position.set(side * 3.35, 5.15, 0.45);
      door.add(pole);

      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 2.8),
        new THREE.MeshStandardMaterial({
          color: '#1d448f',
          roughness: 0.75,
          side: THREE.DoubleSide,
        }),
      );
      banner.position.set(side * 3.35, 3.7, 0.46);
      banner.castShadow = true;
      door.add(banner);
      this.banners.push({ mesh: banner, phase: side * 1.1 });

      const bannerGoldStripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 2.65),
        goldMat,
      );
      bannerGoldStripe.position.set(0, 0, 0.015);
      banner.add(bannerGoldStripe);
    }

    // Grande Arco Real + Brasão Dourado
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(5.8, 1.05, 1.2),
      marbleMat,
    );
    lintel.position.set(0, 6.2, 0.15);
    lintel.castShadow = true;
    door.add(lintel);

    const archTrim = new THREE.Mesh(
      new THREE.TorusGeometry(1.9, 0.16, 10, 24, Math.PI),
      goldMat,
    );
    archTrim.position.set(0, 4.95, 0.62);
    door.add(archTrim);

    const crownCrest = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      goldMat,
    );
    crownCrest.position.set(0, 7.25, 0.45);
    crownCrest.castShadow = true;
    door.add(crownCrest);

    // Folhas da porta dupla ornamentada
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(1.78, 4.85, 0.24),
        woodRoyalMat,
      );
      leaf.position.set(side * 0.92, 2.68, -0.05);
      leaf.castShadow = true;
      door.add(leaf);

      const inlay = new THREE.Mesh(
        new THREE.BoxGeometry(1.38, 4.25, 0.28),
        royalBlueMat,
      );
      inlay.position.set(side * 0.92, 2.68, -0.02);
      door.add(inlay);

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(1.48, 0.14, 0.32),
        goldMat,
      );
      trim.position.set(side * 0.92, 3.6, 0.0);
      door.add(trim);
    }

    // Selo arcano brilhante central (Portal das Masmorras)
    this.portalSealRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.06, 10, 32),
      new THREE.MeshBasicMaterial({
        color: '#6fb4ff',
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.portalSealRing.position.set(0, 2.85, 0.22);
    door.add(this.portalSealRing);

    const sealCore = new THREE.Mesh(
      new THREE.CircleGeometry(0.76, 24),
      new THREE.MeshBasicMaterial({
        color: '#88c6ff',
        transparent: true,
        opacity: 0.32,
      }),
    );
    sealCore.position.set(0, 2.85, 0.2);
    door.add(sealCore);

    this.portalLight = new THREE.PointLight('#6db3ff', 3.4, 9.5, 1.5);
    this.portalLight.position.set(0, 3.0, 1.5);
    door.add(this.portalLight);

    this.group.add(door);

    const promptPos = hallPolar(alpha, 13.8);
    this.interactionZones.push({
      x: promptPos.x,
      z: promptPos.z,
      radiusSq: 3.5 * 3.5,
      label: 'Portal das Masmorras — Catacumbas Instáveis',
      action: 'enter-dungeon',
      actionLabel: 'Entrar na Masmorra',
    });
  }

  private buildForgeDoor(
    alpha: number,
    marbleMat: THREE.Material,
    goldMat: THREE.Material,
    bronzeMat: THREE.Material,
    royalBlueMat: THREE.Material,
    woodRoyalMat: THREE.Material,
  ): void {
    const pos = hallPolar(alpha, this.wallRadius - 0.7);
    const door = new THREE.Group();
    door.position.set(pos.x, 0, pos.z);
    door.rotation.y = pos.inwardYaw;

    const step = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.16, 1.8),
      marbleMat,
    );
    step.position.set(0, 0.08, 0.55);
    step.receiveShadow = true;
    door.add(step);

    for (const side of [-1, 1]) {
      const pilaster = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 4.9, 0.85),
        marbleMat,
      );
      pilaster.position.set(side * 1.85, 2.45, 0.12);
      pilaster.castShadow = true;
      door.add(pilaster);

      const sconce = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.2, 0),
        new THREE.MeshStandardMaterial({
          color: '#ffbe6b',
          emissive: '#ff9633',
          emissiveIntensity: 1.4,
        }),
      );
      sconce.position.set(side * 1.85, 3.2, 0.68);
      door.add(sconce);
    }

    const header = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 0.82, 0.96),
      marbleMat,
    );
    header.position.set(0, 5.2, 0.15);
    header.castShadow = true;
    door.add(header);

    const crestShield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.42, 0.16, 6),
      goldMat,
    );
    crestShield.rotation.x = Math.PI / 2;
    crestShield.position.set(0, 5.2, 0.65);
    door.add(crestShield);

    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(1.42, 4.3, 0.22),
        woodRoyalMat,
      );
      leaf.position.set(side * 0.74, 2.3, -0.04);
      leaf.castShadow = true;
      door.add(leaf);

      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 1.35, 0.27),
        bronzeMat,
      );
      plate.position.set(side * 0.74, 2.4, -0.01);
      door.add(plate);

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(1.12, 0.12, 0.3),
        goldMat,
      );
      trim.position.set(side * 0.74, 3.55, 0);
      door.add(trim);
    }

    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 2.0),
      royalBlueMat,
    );
    banner.position.set(-2.55, 3.4, 0.45);
    door.add(banner);
    this.banners.push({ mesh: banner, phase: 2.3 });

    const forgeLight = new THREE.PointLight('#ffaa4f', 2.4, 7.5, 1.6);
    forgeLight.position.set(0, 2.8, 1.3);
    door.add(forgeLight);

    this.group.add(door);

    const promptPos = hallPolar(alpha, 13.8);
    this.interactionZones.push({
      x: promptPos.x,
      z: promptPos.z,
      radiusSq: 2.9 * 2.9,
      label: 'Ala da Forja — Modificação de Armaduras e Armas em breve',
    });
  }

  private buildShopDoor(
    alpha: number,
    marbleMat: THREE.Material,
    goldMat: THREE.Material,
    royalBlueMat: THREE.Material,
    woodRoyalMat: THREE.Material,
  ): void {
    const pos = hallPolar(alpha, this.wallRadius - 0.7);
    const door = new THREE.Group();
    door.position.set(pos.x, 0, pos.z);
    door.rotation.y = pos.inwardYaw;

    const step = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.16, 1.8),
      marbleMat,
    );
    step.position.set(0, 0.08, 0.55);
    step.receiveShadow = true;
    door.add(step);

    for (const side of [-1, 1]) {
      const pilaster = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 4.9, 0.85),
        marbleMat,
      );
      pilaster.position.set(side * 1.85, 2.45, 0.12);
      pilaster.castShadow = true;
      door.add(pilaster);

      const goldBand = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, 0.2, 0.92),
        goldMat,
      );
      goldBand.position.set(side * 1.85, 4.7, 0.12);
      door.add(goldBand);
    }

    const header = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 0.82, 0.96),
      marbleMat,
    );
    header.position.set(0, 5.2, 0.15);
    header.castShadow = true;
    door.add(header);

    // Medalhão azul e dourado da Loja Real
    const crestDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.16, 16),
      royalBlueMat,
    );
    crestDisc.rotation.x = Math.PI / 2;
    crestDisc.position.set(0, 5.2, 0.64);
    door.add(crestDisc);

    const crestRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.07, 8, 24),
      goldMat,
    );
    crestRim.position.set(0, 5.2, 0.72);
    door.add(crestRim);

    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(1.42, 4.3, 0.22),
        woodRoyalMat,
      );
      leaf.position.set(side * 0.74, 2.3, -0.04);
      leaf.castShadow = true;
      door.add(leaf);

      const inlay = new THREE.Mesh(
        new THREE.BoxGeometry(1.06, 3.55, 0.26),
        royalBlueMat,
      );
      inlay.position.set(side * 0.74, 2.35, -0.01);
      door.add(inlay);

      const ringHandle = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.03, 8, 16),
        goldMat,
      );
      ringHandle.position.set(side * 0.28, 2.15, 0.14);
      door.add(ringHandle);
    }

    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 2.0),
      royalBlueMat,
    );
    banner.position.set(2.55, 3.4, 0.45);
    door.add(banner);
    this.banners.push({ mesh: banner, phase: 0.7 });

    this.group.add(door);

    const promptPos = hallPolar(alpha, 13.8);
    this.interactionZones.push({
      x: promptPos.x,
      z: promptPos.z,
      radiusSq: 2.9 * 2.9,
      label: 'Loja Real — Compra e Venda de Equipamentos em breve',
    });
  }

  private buildHubStations(
    marbleMat: THREE.Material,
    goldMat: THREE.Material,
    royalBlueMat: THREE.Material,
    woodRoyalMat: THREE.Material,
    bronzeMat: THREE.Material,
  ): void {
    // 1. Espaço futuro da Forja / Armaduras (próximo à porta esquerda)
    const forgePos = hallPolar(-82 * DEG2RAD, 11.4);
    const forgeGroup = new THREE.Group();
    forgeGroup.position.set(forgePos.x, 0, forgePos.z);
    forgeGroup.rotation.y = forgePos.inwardYaw;

    const forgeBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.38, 0.18, 16),
      marbleMat,
    );
    forgeBase.position.y = 0.09;
    forgeBase.receiveShadow = true;
    forgeGroup.add(forgeBase);

    const anvilStand = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.56, 0.52),
      woodRoyalMat,
    );
    anvilStand.position.y = 0.46;
    anvilStand.castShadow = true;
    forgeGroup.add(anvilStand);

    const anvilBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.28, 0.44),
      bronzeMat,
    );
    anvilBody.position.y = 0.88;
    anvilBody.castShadow = true;
    forgeGroup.add(anvilBody);

    this.group.add(forgeGroup);
    this.circleColliders.push({ x: forgePos.x, z: forgePos.z, radius: 0.95 });
    this.interactionZones.push({
      x: forgePos.x,
      z: forgePos.z,
      radiusSq: 2.35 * 2.35,
      label: 'Bigorna do Ferreiro — Aprimoramento de Armaduras em breve',
    });

    // 2. Espaço futuro do Baú Real de Armazenamento (próximo à porta direita)
    const chestPos = hallPolar(82 * DEG2RAD, 11.4);
    const chestGroup = new THREE.Group();
    chestGroup.position.set(chestPos.x, 0, chestPos.z);
    chestGroup.rotation.y = chestPos.inwardYaw;

    const rug = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.04, 1.6),
      royalBlueMat,
    );
    rug.position.y = 0.02;
    rug.receiveShadow = true;
    chestGroup.add(rug);

    const chestBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.18, 0.58, 0.72),
      woodRoyalMat,
    );
    chestBox.position.y = 0.33;
    chestBox.castShadow = true;
    chestGroup.add(chestBox);

    const chestLid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 1.18, 12, 1, false, 0, Math.PI),
      royalBlueMat,
    );
    chestLid.rotation.z = Math.PI / 2;
    chestLid.rotation.y = Math.PI / 2;
    chestLid.position.y = 0.62;
    chestLid.castShadow = true;
    chestGroup.add(chestLid);

    const chestLock = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.22, 0.08),
      goldMat,
    );
    chestLock.position.set(0, 0.58, 0.37);
    chestGroup.add(chestLock);

    this.group.add(chestGroup);
    this.circleColliders.push({ x: chestPos.x, z: chestPos.z, radius: 0.9 });
    this.interactionZones.push({
      x: chestPos.x,
      z: chestPos.z,
      radiusSq: 2.3 * 2.3,
      label: 'Baú Real — Armazenamento de Loot em breve',
    });

    // 3. Pedestal / Orbe de Relíquia lateral decorativo (não bloqueia o centro)
    const altarPos = hallPolar(-122 * DEG2RAD, 11.8);
    const altarGroup = new THREE.Group();
    altarGroup.position.set(altarPos.x, 0, altarPos.z);

    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.68, 1.25, 12),
      marbleMat,
    );
    ped.position.y = 0.625;
    ped.castShadow = true;
    ped.receiveShadow = true;
    altarGroup.add(ped);

    const ringTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 0.1, 12),
      goldMat,
    );
    ringTop.position.y = 1.28;
    altarGroup.add(ringTop);

    this.altarCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3, 0),
      new THREE.MeshStandardMaterial({
        color: '#82baff',
        emissive: '#3e7ef0',
        emissiveIntensity: 0.85,
        roughness: 0.2,
        metalness: 0.25,
      }),
    );
    this.altarCrystal.position.y = 1.95;
    this.altarCrystal.castShadow = true;
    altarGroup.add(this.altarCrystal);

    this.group.add(altarGroup);
    this.circleColliders.push({ x: altarPos.x, z: altarPos.z, radius: 0.78 });
  }

  private buildSunlitDust(): void {
    const geo = new THREE.BufferGeometry();
    this.dustPositions = new Float32Array(this.dustCount * 3);
    this.dustSeeds = new Float32Array(this.dustCount);

    for (let i = 0; i < this.dustCount; i++) {
      const r = Math.sqrt(Math.random()) * 14.8;
      const theta = Math.random() * Math.PI * 2;
      this.dustPositions[i * 3 + 0] = Math.cos(theta) * r;
      this.dustPositions[i * 3 + 1] = 0.4 + Math.random() * 5.8;
      this.dustPositions[i * 3 + 2] = Math.sin(theta) * r;
      this.dustSeeds[i] = Math.random() * Math.PI * 2;
    }

    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.dustPositions, 3),
    );

    const mat = new THREE.PointsMaterial({
      color: '#ffe9a8',
      size: 0.085,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.dustPoints = new THREE.Points(geo, mat);
    this.group.add(this.dustPoints);
  }

  private buildExteriorRoyalGarden(
    gardenGrassMap: THREE.CanvasTexture,
    marbleMat: THREE.Material,
    creamTrimMat: THREE.Material,
    goldMat: THREE.Material,
  ): void {
    const gardenY = -1.65;
    const gardenGroup = new THREE.Group();

    // Gramado circular amplo ao redor da cidadela
    const grass = new THREE.Mesh(
      new THREE.CircleGeometry(98, 72),
      new THREE.MeshStandardMaterial({
        map: gardenGrassMap,
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = gardenY;
    grass.receiveShadow = true;
    gardenGroup.add(grass);

    // Espelho d'água cristalino contornando a base do Salão
    const moatWater = new THREE.Mesh(
      new THREE.RingGeometry(18.6, 22.9, 72),
      new THREE.MeshStandardMaterial({
        color: '#5ec0ee',
        roughness: 0.14,
        metalness: 0.24,
        transparent: true,
        opacity: 0.88,
      }),
    );
    moatWater.rotation.x = -Math.PI / 2;
    moatWater.position.y = gardenY + 0.06;
    moatWater.receiveShadow = true;
    gardenGroup.add(moatWater);

    // Mureta externa de mármore do espelho d'água
    const moatRim = new THREE.Mesh(
      new THREE.RingGeometry(22.8, 23.6, 72),
      creamTrimMat,
    );
    moatRim.rotation.x = -Math.PI / 2;
    moatRim.position.y = gardenY + 0.09;
    moatRim.receiveShadow = true;
    gardenGroup.add(moatRim);

    // Duas pontes ornamentais laterais sobre o espelho d'água
    for (const bridgeDeg of [135, 225]) {
      const bPos = hallPolar(bridgeDeg * DEG2RAD, 20.8);
      const bridge = new THREE.Group();
      bridge.position.set(bPos.x, gardenY + 0.24, bPos.z);
      bridge.rotation.y = bPos.inwardYaw;

      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.28, 4.9),
        marbleMat,
      );
      deck.castShadow = true;
      deck.receiveShadow = true;
      bridge.add(deck);

      for (const side of [-1.18, 1.18]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.45, 4.8),
          creamTrimMat,
        );
        rail.position.set(side, 0.32, 0);
        bridge.add(rail);
      }
      gardenGroup.add(bridge);
    }

    // Materiais orgânicos do jardim (cores vivas e claras)
    const trunkMat = new THREE.MeshStandardMaterial({
      color: '#6b4c35',
      roughness: 0.9,
    });
    const leafGreenMat = new THREE.MeshStandardMaterial({
      color: '#4e9b44',
      roughness: 0.78,
    });
    const leafBrightMat = new THREE.MeshStandardMaterial({
      color: '#6ec056',
      roughness: 0.76,
    });
    const blossomPinkMat = new THREE.MeshStandardMaterial({
      color: '#f8dce6',
      roughness: 0.72,
    });
    const blossomGoldMat = new THREE.MeshStandardMaterial({
      color: '#ffe69e',
      roughness: 0.7,
    });
    const hedgeMat = new THREE.MeshStandardMaterial({
      color: '#3c8036',
      roughness: 0.85,
    });
    const flowerPalette = ['#fff8e6', '#ffbfd4', '#8cc8ff', '#ffe07d'];

    const addTree = (
      alphaDeg: number,
      radius: number,
      scale: number,
      variant: 'green' | 'pink' | 'gold',
    ): void => {
      const p = hallPolar(alphaDeg * DEG2RAD, radius);
      const tree = new THREE.Group();
      tree.position.set(p.x, gardenY, p.z);
      tree.scale.setScalar(scale);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.4, 2.7, 8),
        trunkMat,
      );
      trunk.position.y = 1.35;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      tree.add(trunk);

      const canopyMat =
        variant === 'pink'
          ? blossomPinkMat
          : variant === 'gold'
            ? blossomGoldMat
            : leafGreenMat;
      const topMat = variant === 'green' ? leafBrightMat : canopyMat;

      const lobes: Array<[number, number, number, number, THREE.Material]> = [
        [0, 3.4, 0, 1.55, canopyMat],
        [-0.95, 2.9, 0.45, 1.15, canopyMat],
        [0.95, 3.0, -0.4, 1.2, topMat],
        [0.15, 4.25, 0.15, 1.15, topMat],
      ];
      for (const [lx, ly, lz, lr, mat] of lobes) {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(lr, 1), mat);
        crown.position.set(lx, ly, lz);
        crown.castShadow = true;
        crown.receiveShadow = true;
        tree.add(crown);
      }

      gardenGroup.add(tree);
    };

    const addFlowerBed = (alphaDeg: number, radius: number, rotY = 0): void => {
      const p = hallPolar(alphaDeg * DEG2RAD, radius);
      const bed = new THREE.Group();
      bed.position.set(p.x, gardenY, p.z);
      bed.rotation.y = rotY;

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(1.45, 1.55, 0.34, 14),
        creamTrimMat,
      );
      rim.position.y = 0.17;
      rim.receiveShadow = true;
      bed.add(rim);

      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(1.18, 12, 8),
        hedgeMat,
      );
      bush.scale.set(1.1, 0.46, 1.1);
      bush.position.y = 0.35;
      bush.castShadow = true;
      bush.receiveShadow = true;
      bed.add(bush);

      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const flower = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 8, 6),
          new THREE.MeshStandardMaterial({
            color: flowerPalette[i % flowerPalette.length],
            roughness: 0.65,
          }),
        );
        flower.position.set(
          Math.cos(ang) * 0.72,
          0.62 + (i % 2) * 0.08,
          Math.sin(ang) * 0.72,
        );
        bed.add(flower);
      }

      gardenGroup.add(bed);
    };

    // 1) Faixa frontal visível além da balaustrada: apenas canteiros e fontes baixas
    //    (altura <= 1.7m para nunca bloquear a câmera isométrica!)
    for (const deg of [148, 164, 180, 196, 212]) {
      addFlowerBed(deg, 25.4);
    }
    for (const deg of [156, 172, 188, 204]) {
      addFlowerBed(deg, 32.0);
    }

    // Duas fontes baixas elegantes nos lados da vista frontal
    for (const fDeg of [152, 208]) {
      const fp = hallPolar(fDeg * DEG2RAD, 28.6);
      const fountain = new THREE.Group();
      fountain.position.set(fp.x, gardenY, fp.z);

      const basin = new THREE.Mesh(
        new THREE.CylinderGeometry(1.75, 1.95, 0.46, 18),
        marbleMat,
      );
      basin.position.y = 0.23;
      basin.receiveShadow = true;
      fountain.add(basin);

      const waterPool = new THREE.Mesh(
        new THREE.CircleGeometry(1.52, 18),
        new THREE.MeshStandardMaterial({
          color: '#6ecbf2',
          roughness: 0.15,
          metalness: 0.2,
        }),
      );
      waterPool.rotation.x = -Math.PI / 2;
      waterPool.position.y = 0.47;
      fountain.add(waterPool);

      const spout = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.34, 1.05, 10),
        goldMat,
      );
      spout.position.y = 0.72;
      fountain.add(spout);

      gardenGroup.add(fountain);
    }

    // 2) Árvores visíveis atrás dos 4 janelões altos (-112°..+112°) e laterais da balaustrada
    const treeSpecs: Array<[number, number, number, 'green' | 'pink' | 'gold']> = [
      // Atrás dos janelões principais
      [-104, 25.5, 1.45, 'pink'],
      [-88, 29.0, 1.65, 'green'],
      [-40, 26.2, 1.55, 'green'],
      [-26, 28.5, 1.5, 'gold'],
      [26, 26.2, 1.6, 'pink'],
      [42, 29.2, 1.7, 'green'],
      [88, 25.8, 1.5, 'green'],
      [104, 28.5, 1.6, 'gold'],
      // Emoldurando esquerda e direita da balaustrada frontal (fora do corredor central 148°..212°)
      [122, 25.6, 1.4, 'pink'],
      [136, 28.8, 1.55, 'green'],
      [142, 34.5, 1.7, 'gold'],
      [238, 25.6, 1.4, 'green'],
      [224, 28.8, 1.55, 'pink'],
      [218, 34.5, 1.7, 'green'],
      // Anel mais distante de bosque
      [-120, 39, 1.9, 'green'],
      [-65, 38, 1.85, 'pink'],
      [-10, 41, 2.0, 'green'],
      [55, 39, 1.9, 'gold'],
      [115, 40, 1.95, 'green'],
      [165, 44, 1.6, 'pink'],
      [195, 44, 1.6, 'green'],
    ];
    for (const [deg, rad, sc, variant] of treeSpecs) {
      addTree(deg, rad, sc, variant);
    }

    // 3) Colinas suaves e torres distantes da capital ao longe
    const hillMat = new THREE.MeshStandardMaterial({
      color: '#7ab96a',
      roughness: 0.95,
    });
    for (let i = 0; i < 12; i++) {
      const deg = -165 + i * 30;
      const hp = hallPolar(deg * DEG2RAD, 74 + (i % 3) * 8);
      const hill = new THREE.Mesh(
        new THREE.SphereGeometry(16 + (i % 4) * 4, 16, 10),
        hillMat,
      );
      hill.scale.set(1.5, 0.35, 1.2);
      hill.position.set(hp.x, gardenY - 0.8, hp.z);
      gardenGroup.add(hill);
    }

    for (const [tDeg, tRad, tH] of [
      [-48, 66, 22],
      [18, 70, 26],
      [108, 66, 20],
    ]) {
      const tp = hallPolar(tDeg * DEG2RAD, tRad);
      const tower = new THREE.Group();
      tower.position.set(tp.x, gardenY, tp.z);

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(2.3, 2.9, tH, 12),
        marbleMat,
      );
      body.position.y = tH / 2;
      tower.add(body);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.7, 6.2, 12),
        new THREE.MeshStandardMaterial({ color: '#2b55a3', roughness: 0.55 }),
      );
      roof.position.y = tH + 3.1;
      tower.add(roof);

      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.2, 8), goldMat);
      spire.position.y = tH + 6.9;
      tower.add(spire);

      gardenGroup.add(tower);
    }

    // 4) Pétalas suaves flutuando na brisa ao redor do jardim e balaustrada
    const pGeo = new THREE.BufferGeometry();
    this.petalPositions = new Float32Array(this.petalCount * 3);
    this.petalSeeds = new Float32Array(this.petalCount);

    for (let i = 0; i < this.petalCount; i++) {
      const r = 19.5 + Math.random() * 19;
      const theta = Math.random() * Math.PI * 2;
      this.petalPositions[i * 3 + 0] = Math.cos(theta) * r;
      this.petalPositions[i * 3 + 1] = gardenY + 0.6 + Math.random() * 6.5;
      this.petalPositions[i * 3 + 2] = Math.sin(theta) * r;
      this.petalSeeds[i] = Math.random() * Math.PI * 2;
    }

    pGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.petalPositions, 3),
    );
    this.petalPoints = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: '#fff1f5',
        size: 0.14,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
    );
    gardenGroup.add(this.petalPoints);

    this.group.add(gardenGroup);
  }

  public getDungeonReturnSpawn(): { x: number; z: number; yaw: number } {
    const p = hallPolar(0, 10.0);
    return { x: p.x, z: p.z, yaw: p.inwardYaw };
  }

  public getNearbyInteractionPrompt(pos: THREE.Vector3): InteractionPrompt | null {
    return findNearbyInteraction(this.interactionZones, pos);
  }

  public update(dt: number, elapsed: number, playerPos: THREE.Vector3): void {
    // Mantém as sombras solares acompanhando o jogador com máxima nitidez
    this.sunLight.position.set(playerPos.x + 22, 18, playerPos.z - 15);
    this.sunLight.target.position.copy(playerPos);

    // Pulso elegante no selo arcano do Grande Portal
    const pulse = Math.sin(elapsed * 2.2) * 0.5 + 0.5;
    this.portalSealRing.rotation.z = elapsed * 0.35;
    this.portalLight.intensity = 2.9 + pulse * 1.1;

    // Flutuação suave do cristal do pedestal
    this.altarCrystal.rotation.y = elapsed * 0.9;
    this.altarCrystal.position.y = 1.95 + Math.sin(elapsed * 2.1) * 0.08;

    // Movimento leve nos estandartes reais
    for (let i = 0; i < this.banners.length; i++) {
      const b = this.banners[i];
      b.mesh.rotation.x = Math.sin(elapsed * 1.7 + b.phase) * 0.035;
    }

    // Poeira dourada subindo suavemente nos feixes de luz
    const posAttr = this.dustPoints.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    for (let i = 0; i < this.dustCount; i++) {
      const idx = i * 3;
      const seed = this.dustSeeds[i];
      this.dustPositions[idx + 1] += dt * (0.16 + (i % 4) * 0.04);
      this.dustPositions[idx + 0] += Math.sin(elapsed * 0.8 + seed) * dt * 0.14;
      this.dustPositions[idx + 2] += Math.cos(elapsed * 0.7 + seed) * dt * 0.14;

      if (this.dustPositions[idx + 1] > 6.3) {
        this.dustPositions[idx + 1] = 0.35;
      }
    }
    posAttr.needsUpdate = true;

    // Pétalas suaves flutuando na brisa do jardim externo
    const petalAttr = this.petalPoints.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    for (let i = 0; i < this.petalCount; i++) {
      const idx = i * 3;
      const seed = this.petalSeeds[i];
      this.petalPositions[idx + 1] -= dt * (0.24 + (i % 3) * 0.05);
      this.petalPositions[idx + 0] += Math.sin(elapsed * 0.9 + seed) * dt * 0.32;
      this.petalPositions[idx + 2] += Math.cos(elapsed * 0.75 + seed) * dt * 0.28;

      if (this.petalPositions[idx + 1] < -1.1) {
        this.petalPositions[idx + 1] = 5.4;
      }
    }
    petalAttr.needsUpdate = true;
  }
}

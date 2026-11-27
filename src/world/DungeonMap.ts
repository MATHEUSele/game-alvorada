/// <reference types="vite/client" />
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  findNearbyInteraction,
  type BoxCollider,
  type CircleCollider,
  type InteractionPrompt,
  type InteractionZone,
} from './Collision';
import type { DungeonTextureSet } from './ProceduralTextures';

export type DungeonRoomKind = 'entrance' | 'chamber' | 'treasure' | 'sanctum';

export interface DungeonRoom {
  id: number;
  gx: number;
  gz: number;
  w: number;
  h: number;
  centerX: number;
  centerZ: number;
  connections: number[];
  kind: DungeonRoomKind;
}

export interface DungeonCorridor {
  gx: number;
  gz: number;
  w: number;
  h: number;
  fromRoomId: number;
  toRoomId: number;
}

export interface MergedWallRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  lowCutaway: boolean;
}

export interface DungeonLayout {
  seed: number;
  seedCode: string;
  gridSize: number;
  cellSize: number;
  originGx: number;
  originGz: number;
  rooms: DungeonRoom[];
  corridors: DungeonCorridor[];
  walls: MergedWallRect[];
  spawnYaw: number;
}

const GRID_SIZE = 48;
const CELL_SIZE = 2.4;

const CELL_EMPTY = 0;
const CELL_ROOM = 1;
const CELL_CORRIDOR = 2;
const CELL_WALL_LOW = 3;
const CELL_WALL_HIGH = 4;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function canPlaceRoom(
  gx: number,
  gz: number,
  w: number,
  h: number,
  rooms: readonly DungeonRoom[],
): boolean {
  if (gx < 2 || gz < 2 || gx + w > GRID_SIZE - 2 || gz + h > GRID_SIZE - 2) {
    return false;
  }

  const margin = 2;
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    const separated =
      gx + w + margin <= r.gx ||
      r.gx + r.w + margin <= gx ||
      gz + h + margin <= r.gz ||
      r.gz + r.h + margin <= gz;
    if (!separated) return false;
  }
  return true;
}

function isRectEmpty(
  grid: Uint8Array,
  gx: number,
  gz: number,
  w: number,
  h: number,
): boolean {
  for (let z = gz; z < gz + h; z++) {
    for (let x = gx; x < gx + w; x++) {
      if (grid[z * GRID_SIZE + x] !== CELL_EMPTY) return false;
    }
  }
  return true;
}

function carveRect(
  grid: Uint8Array,
  gx: number,
  gz: number,
  w: number,
  h: number,
  cellType: number,
): void {
  for (let z = gz; z < gz + h; z++) {
    for (let x = gx; x < gx + w; x++) {
      grid[z * GRID_SIZE + x] = cellType;
    }
  }
}

function gridToWorldX(gx: number, originGx: number): number {
  return (gx - originGx) * CELL_SIZE;
}

function gridToWorldZ(gz: number, originGz: number): number {
  return (gz - originGz) * CELL_SIZE;
}

/**
 * Gera um layout randômico conectado em grade 48x48 com salas, corredores de 2 células
 * e paredes fundidas (greedy 2D) com recorte cutaway para câmera isométrica.
 */
export function generateDungeonLayout(
  rawSeed: number = (Math.random() * 0xffffffff) >>> 0,
): DungeonLayout {
  const baseSeed = (rawSeed >>> 0) || 1;

  for (let attempt = 0; attempt < 16; attempt++) {
    const seed = (baseSeed + attempt * 0x9e3779b9) >>> 0;
    const layout = tryGenerateLayout(seed);
    if (layout && layout.rooms.length >= 6) {
      return layout;
    }
  }

  return tryGenerateLayout(baseSeed, true)!;
}

function tryGenerateLayout(
  seed: number,
  forceFallback = false,
): DungeonLayout | null {
  const rng = mulberry32(seed);
  const grid = new Uint8Array(GRID_SIZE * GRID_SIZE);

  const startW = 5;
  const startH = 5;
  const startGx = 21;
  const startGz = 21;
  const originGx = startGx + startW * 0.5;
  const originGz = startGz + startH * 0.5;

  const rooms: DungeonRoom[] = [
    {
      id: 0,
      gx: startGx,
      gz: startGz,
      w: startW,
      h: startH,
      centerX: 0,
      centerZ: 0,
      connections: [],
      kind: 'entrance',
    },
  ];
  carveRect(grid, startGx, startGz, startW, startH, CELL_ROOM);

  const corridors: DungeonCorridor[] = [];
  const targetRooms = 6 + Math.floor(rng() * 3); // 6 a 8 salas
  const dirs: ReadonlyArray<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const tryExpandFromRoom = (
    parent: DungeonRoom,
    deterministic: boolean,
  ): boolean => {
    const dirList = deterministic ? dirs : shuffled(dirs, rng);
    const gapCandidates = deterministic
      ? [2, 3, 4]
      : [2 + Math.floor(rng() * 3), 2, 3, 4];
    const sizePairs: Array<[number, number]> = deterministic
      ? [
          [5, 5],
          [4, 4],
        ]
      : [
          [4 + Math.floor(rng() * 3), 4 + Math.floor(rng() * 3)],
          [5, 4],
          [4, 5],
          [4, 4],
        ];
    const offsetCandidates = deterministic
      ? [0]
      : shuffled([-1, 0, 1], rng);

    for (const [dx, dz] of dirList) {
      for (const gap of gapCandidates) {
        for (const [cw, ch] of sizePairs) {
          for (const latOffset of offsetCandidates) {
            let cgx = 0;
            let cgz = 0;
            let corGx = 0;
            let corGz = 0;
            let corW = 0;
            let corH = 0;

            if (dx !== 0) {
              cgx = dx > 0 ? parent.gx + parent.w + gap : parent.gx - gap - cw;
              const idealZ =
                parent.gz + Math.floor((parent.h - ch) / 2) + latOffset;
              cgz = idealZ;

              const overlapMin = Math.max(parent.gz, cgz);
              const overlapMax = Math.min(parent.gz + parent.h, cgz + ch);
              if (overlapMax - overlapMin < 2) continue;

              const corStartZ =
                overlapMin + Math.floor((overlapMax - overlapMin - 2) / 2);
              corGx = dx > 0 ? parent.gx + parent.w : cgx + cw;
              corGz = corStartZ;
              corW = gap;
              corH = 2;
            } else {
              cgz = dz > 0 ? parent.gz + parent.h + gap : parent.gz - gap - ch;
              const idealX =
                parent.gx + Math.floor((parent.w - cw) / 2) + latOffset;
              cgx = idealX;

              const overlapMin = Math.max(parent.gx, cgx);
              const overlapMax = Math.min(parent.gx + parent.w, cgx + cw);
              if (overlapMax - overlapMin < 2) continue;

              const corStartX =
                overlapMin + Math.floor((overlapMax - overlapMin - 2) / 2);
              corGx = corStartX;
              corGz = dz > 0 ? parent.gz + parent.h : cgz + ch;
              corW = 2;
              corH = gap;
            }

            if (!canPlaceRoom(cgx, cgz, cw, ch, rooms)) continue;
            if (!isRectEmpty(grid, corGx, corGz, corW, corH)) continue;

            const newId = rooms.length;
            const child: DungeonRoom = {
              id: newId,
              gx: cgx,
              gz: cgz,
              w: cw,
              h: ch,
              centerX: gridToWorldX(cgx + cw * 0.5, originGx),
              centerZ: gridToWorldZ(cgz + ch * 0.5, originGz),
              connections: [parent.id],
              kind: 'chamber',
            };
            parent.connections.push(newId);
            rooms.push(child);

            carveRect(grid, cgx, cgz, cw, ch, CELL_ROOM);
            carveRect(grid, corGx, corGz, corW, corH, CELL_CORRIDOR);
            corridors.push({
              gx: corGx,
              gz: corGz,
              w: corW,
              h: corH,
              fromRoomId: parent.id,
              toRoomId: newId,
            });
            return true;
          }
        }
      }
    }
    return false;
  };

  for (let step = 0; step < 32 && rooms.length < targetRooms; step++) {
    let added = false;

    if (step < 4) {
      // Espinha dorsal principal nos primeiros passos
      for (let idx = rooms.length - 1; idx >= 0 && !added; idx--) {
        added = tryExpandFromRoom(rooms[idx], false);
      }
    } else {
      // Ramificações orgânicas a partir de salas intermediárias
      const candidates = shuffled(
        rooms.map((r) => r.id),
        rng,
      );
      for (const roomId of candidates) {
        if (tryExpandFromRoom(rooms[roomId], false)) {
          added = true;
          break;
        }
      }
    }

    if (!added) {
      for (let idx = rooms.length - 1; idx >= 0; idx--) {
        if (tryExpandFromRoom(rooms[idx], true)) {
          added = true;
          break;
        }
      }
    }

    if (!added) break;
  }

  if (rooms.length < 6 && !forceFallback) {
    return null;
  }

  // Classificação por distância BFS a partir da entrada (Room 0)
  const dist = new Array<number>(rooms.length).fill(-1);
  dist[0] = 0;
  const queue: number[] = [0];
  let qHead = 0;
  while (qHead < queue.length) {
    const cur = queue[qHead++];
    for (const nxt of rooms[cur].connections) {
      if (dist[nxt] === -1) {
        dist[nxt] = dist[cur] + 1;
        queue.push(nxt);
      }
    }
  }

  let sanctumId = rooms.length - 1;
  let maxDist = -1;
  for (let i = 1; i < rooms.length; i++) {
    if (dist[i] > maxDist) {
      maxDist = dist[i];
      sanctumId = i;
    }
  }
  rooms[sanctumId].kind = 'sanctum';

  let treasureAssigned = false;
  for (let i = 1; i < rooms.length; i++) {
    if (i === sanctumId) continue;
    if (rooms[i].connections.length === 1) {
      rooms[i].kind = 'treasure';
      treasureAssigned = true;
    }
  }
  if (!treasureAssigned && rooms.length >= 3) {
    const midIdx = Math.max(1, Math.floor(rooms.length / 2));
    if (midIdx !== sanctumId) {
      rooms[midIdx].kind = 'treasure';
    }
  }

  const isWalkable = (gx: number, gz: number): boolean => {
    if (gx < 0 || gz < 0 || gx >= GRID_SIZE || gz >= GRID_SIZE) return false;
    const c = grid[gz * GRID_SIZE + gx];
    return c === CELL_ROOM || c === CELL_CORRIDOR;
  };

  // Marca paredes em torno de todo piso caminhável (vizinhança 8-direcional garante fechamento hermético)
  for (let gz = 1; gz < GRID_SIZE - 1; gz++) {
    for (let gx = 1; gx < GRID_SIZE - 1; gx++) {
      if (grid[gz * GRID_SIZE + gx] !== CELL_EMPTY) continue;

      let touchesWalkable = false;
      for (let dz = -1; dz <= 1 && !touchesWalkable; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          if (isWalkable(gx + dx, gz + dz)) {
            touchesWalkable = true;
            break;
          }
        }
      }
      if (!touchesWalkable) continue;

      // Recorte cutaway: paredes à frente (+X/+Z) do piso ocultariam o herói na câmera isométrica
      const blocksIsoView =
        isWalkable(gx - 1, gz) ||
        isWalkable(gx, gz - 1) ||
        isWalkable(gx - 1, gz - 1) ||
        isWalkable(gx - 2, gz - 2);

      grid[gz * GRID_SIZE + gx] = blocksIsoView ? CELL_WALL_LOW : CELL_WALL_HIGH;
    }
  }

  // Greedy 2D rectangle merging para reduzir draw calls e BoxColliders
  const walls: MergedWallRect[] = [];
  const visited = new Uint8Array(GRID_SIZE * GRID_SIZE);

  for (const wallType of [CELL_WALL_HIGH, CELL_WALL_LOW]) {
    const lowCutaway = wallType === CELL_WALL_LOW;

    for (let gz = 0; gz < GRID_SIZE; gz++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const idx = gz * GRID_SIZE + gx;
        if (visited[idx] || grid[idx] !== wallType) continue;

        let rw = 1;
        while (
          gx + rw < GRID_SIZE &&
          !visited[gz * GRID_SIZE + (gx + rw)] &&
          grid[gz * GRID_SIZE + (gx + rw)] === wallType
        ) {
          rw++;
        }

        let rh = 1;
        outer: while (gz + rh < GRID_SIZE) {
          for (let dx = 0; dx < rw; dx++) {
            const cIdx = (gz + rh) * GRID_SIZE + (gx + dx);
            if (visited[cIdx] || grid[cIdx] !== wallType) {
              break outer;
            }
          }
          rh++;
        }

        for (let dz = 0; dz < rh; dz++) {
          for (let dx = 0; dx < rw; dx++) {
            visited[(gz + dz) * GRID_SIZE + (gx + dx)] = 1;
          }
        }

        walls.push({
          minX: gridToWorldX(gx, originGx),
          maxX: gridToWorldX(gx + rw, originGx),
          minZ: gridToWorldZ(gz, originGz),
          maxZ: gridToWorldZ(gz + rh, originGz),
          lowCutaway,
        });
      }
    }
  }

  const firstRoom = rooms[1] ?? rooms[0];
  const spawnYaw =
    firstRoom.id !== 0
      ? Math.atan2(firstRoom.centerX, firstRoom.centerZ)
      : Math.PI * 0.25;

  return {
    seed,
    seedCode: (seed & 0xffff).toString(16).toUpperCase().padStart(4, '0'),
    gridSize: GRID_SIZE,
    cellSize: CELL_SIZE,
    originGx,
    originGz,
    rooms,
    corridors,
    walls,
    spawnYaw,
  };
}

interface AnimatedFlame {
  mesh: THREE.Mesh;
  baseScaleY: number;
  phase: number;
  light?: THREE.PointLight;
  baseIntensity: number;
}

export class DungeonMap {
  public readonly group = new THREE.Group();
  public readonly circleColliders: CircleCollider[] = [];
  public readonly boxColliders: BoxCollider[] = [];
  public readonly boundsRadius = 500;

  public readonly floorNumber: number;
  public readonly seed: number;
  public readonly seedCode: string;
  public readonly roomCount: number;
  public readonly spawnPosition = new THREE.Vector3(0, 0, 0);
  public readonly spawnYaw: number;

  private readonly layout: DungeonLayout;
  private readonly interactionZones: InteractionZone[] = [];
  private readonly dirLight: THREE.DirectionalLight;
  private readonly portalRings: THREE.Mesh[] = [];
  private readonly rotatingCrystals: THREE.Mesh[] = [];
  private readonly flames: AnimatedFlame[] = [];

  private readonly emberCount = 140;
  private emberPoints!: THREE.Points;
  private emberPositions!: Float32Array;
  private emberSeeds!: Float32Array;

  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private disposed = false;

  private boundsMinX = -20;
  private boundsMaxX = 20;
  private boundsMinZ = -20;
  private boundsMaxZ = 20;

  constructor(
    textures: DungeonTextureSet,
    floorNumber = 1,
    seed?: number,
  ) {
    this.floorNumber = floorNumber;
    this.layout = generateDungeonLayout(seed);
    this.seed = this.layout.seed;
    this.seedCode = this.layout.seedCode;
    this.roomCount = this.layout.rooms.length;
    this.spawnYaw = this.layout.spawnYaw;

    this.computeWorldBounds();
    this.dirLight = this.buildLighting();
    this.buildArchitecture(textures);
    this.buildFeaturesAndProps();
    this.buildEmberParticles();
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.ownedGeometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.ownedMaterials.push(mat);
    return mat;
  }

  private computeWorldBounds(): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const r of this.layout.rooms) {
      const rx0 = gridToWorldX(r.gx, this.layout.originGx);
      const rx1 = gridToWorldX(r.gx + r.w, this.layout.originGx);
      const rz0 = gridToWorldZ(r.gz, this.layout.originGz);
      const rz1 = gridToWorldZ(r.gz + r.h, this.layout.originGz);
      minX = Math.min(minX, rx0);
      maxX = Math.max(maxX, rx1);
      minZ = Math.min(minZ, rz0);
      maxZ = Math.max(maxZ, rz1);
    }

    this.boundsMinX = minX - CELL_SIZE * 1.5;
    this.boundsMaxX = maxX + CELL_SIZE * 1.5;
    this.boundsMinZ = minZ - CELL_SIZE * 1.5;
    this.boundsMaxZ = maxZ + CELL_SIZE * 1.5;
  }

  private buildLighting(): THREE.DirectionalLight {
    const hemi = new THREE.HemisphereLight('#6b8fd0', '#181424', 0.94);
    this.group.add(hemi);

    const dirLight = new THREE.DirectionalLight('#9abfff', 1.45);
    dirLight.position.set(16, 20, -12);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 2;
    dirLight.shadow.camera.far = 75;
    const d = 24;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0004;
    this.group.add(dirLight);
    this.group.add(dirLight.target);

    return dirLight;
  }

  private buildArchitecture(textures: DungeonTextureSet): void {
    const stoneWallMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.stoneWallMap,
        color: '#8898b8',
        roughness: 0.72,
        metalness: 0.12,
      }),
    );

    const lowWallTrimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#2d374c',
        roughness: 0.55,
        metalness: 0.25,
      }),
    );

    const darkGoldMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#a37b36',
        roughness: 0.35,
        metalness: 0.78,
      }),
    );

    // Chão de cada sala com textura própria ajustada em repeat proporcional ao tamanho
    for (const room of this.layout.rooms) {
      const worldW = room.w * CELL_SIZE;
      const worldH = room.h * CELL_SIZE;
      const floorGeo = this.trackGeo(new THREE.PlaneGeometry(worldW, worldH));

      const floorMap = textures.stoneFloorMap.clone();
      floorMap.needsUpdate = true;
      floorMap.repeat.set(room.w * 0.5, room.h * 0.5);

      const floorBump = textures.stoneFloorBump.clone();
      floorBump.needsUpdate = true;
      floorBump.repeat.set(room.w * 0.5, room.h * 0.5);

      const roomMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          map: floorMap,
          bumpMap: floorBump,
          bumpScale: 0.035,
          roughness: 0.62,
          metalness: 0.1,
        }),
      );

      const floorMesh = new THREE.Mesh(floorGeo, roomMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set(room.centerX, 0, room.centerZ);
      floorMesh.receiveShadow = true;
      this.group.add(floorMesh);

      // Moldura sutil no contorno da sala
      const trimGeo = this.trackGeo(
        new THREE.RingGeometry(
          Math.min(worldW, worldH) * 0.42,
          Math.min(worldW, worldH) * 0.44,
          room.kind === 'sanctum' ? 8 : 4,
        ),
      );
      const trimMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color:
            room.kind === 'sanctum'
              ? '#9b5de5'
              : room.kind === 'treasure'
                ? '#c7973c'
                : '#3f5f94',
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        }),
      );
      const ringDecal = new THREE.Mesh(trimGeo, trimMat);
      ringDecal.rotation.x = -Math.PI / 2;
      ringDecal.rotation.z = Math.PI / 4;
      ringDecal.position.set(room.centerX, 0.012, room.centerZ);
      this.group.add(ringDecal);
    }

    // Pisos de corredor sem sobreposição com as salas
    for (const cor of this.layout.corridors) {
      const worldW = cor.w * CELL_SIZE;
      const worldH = cor.h * CELL_SIZE;
      const corGeo = this.trackGeo(new THREE.PlaneGeometry(worldW, worldH));
      const corMap = textures.corridorFloorMap.clone();
      corMap.needsUpdate = true;
      corMap.repeat.set(cor.w * 0.5, cor.h * 0.5);

      const corMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          map: corMap,
          roughness: 0.68,
          metalness: 0.14,
        }),
      );

      const cx = gridToWorldX(cor.gx + cor.w * 0.5, this.layout.originGx);
      const cz = gridToWorldZ(cor.gz + cor.h * 0.5, this.layout.originGz);
      const mesh = new THREE.Mesh(corGeo, corMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(cx, 0, cz);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    // Paredes fundidas com recorte cutaway frontal (nunca oculta o jogador)
    for (const wRect of this.layout.walls) {
      const width = wRect.maxX - wRect.minX;
      const depth = wRect.maxZ - wRect.minZ;
      const height = wRect.lowCutaway ? 1.08 : 3.6;
      const cx = (wRect.minX + wRect.maxX) * 0.5;
      const cz = (wRect.minZ + wRect.maxZ) * 0.5;

      const wallGeo = this.trackGeo(new THREE.BoxGeometry(width, height, depth));
      const wallMesh = new THREE.Mesh(
        wallGeo,
        wRect.lowCutaway ? lowWallTrimMat : stoneWallMat,
      );
      wallMesh.position.set(cx, height * 0.5, cz);
      wallMesh.castShadow = !wRect.lowCutaway;
      wallMesh.receiveShadow = true;
      this.group.add(wallMesh);

      if (wRect.lowCutaway) {
        const capGeo = this.trackGeo(
          new THREE.BoxGeometry(width + 0.04, 0.12, depth + 0.04),
        );
        const cap = new THREE.Mesh(capGeo, darkGoldMat);
        cap.position.set(cx, height + 0.04, cz);
        this.group.add(cap);
      }

      this.boxColliders.push({
        minX: wRect.minX,
        maxX: wRect.maxX,
        minZ: wRect.minZ,
        maxZ: wRect.maxZ,
      });
    }
  }

  private buildFeaturesAndProps(): void {
    const stoneDarkMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#2e384d',
        roughness: 0.65,
        metalness: 0.18,
      }),
    );
    const goldMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#c99b42',
        roughness: 0.3,
        metalness: 0.85,
      }),
    );
    const steelMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#5c6b86',
        roughness: 0.42,
        metalness: 0.72,
      }),
    );

    let remainingBrazierLights = 4; // Teto máximo de 6 PointLights na masmorra (1 retorno + 1 fenda + 4 braseiros)

    for (let i = 0; i < this.layout.rooms.length; i++) {
      const room = this.layout.rooms[i];
      const halfW = room.w * CELL_SIZE * 0.5;
      const halfH = room.h * CELL_SIZE * 0.5;

      if (room.kind === 'entrance') {
        this.buildEntranceRoom(room, stoneDarkMat, goldMat);
      } else if (room.kind === 'sanctum') {
        this.buildSanctumRoom(room, stoneDarkMat, goldMat);
      } else if (room.kind === 'treasure') {
        this.buildTreasurePedestal(room, stoneDarkMat, goldMat);
      }

      // Colunas nos cantos de salas medianas/grandes intermediárias (nunca na entrada/sanctum para manter leitura clara)
      if (room.kind === 'chamber' && room.w >= 5 && room.h >= 5) {
        const pxOff = halfW - 1.9;
        const pzOff = halfH - 1.9;
        const corners: Array<[number, number]> = [
          [room.centerX - pxOff, room.centerZ - pzOff],
          [room.centerX + pxOff, room.centerZ - pzOff],
          [room.centerX - pxOff, room.centerZ + pzOff],
          [room.centerX + pxOff, room.centerZ + pzOff],
        ];
        // Coloca no máximo 2 colunas em diagonal para deixar circulação ampla
        for (const [cx, cz] of [corners[0], corners[3]]) {
          this.addPillar(cx, cz, stoneDarkMat, goldMat);
        }
      }

      // Braseiro aceso distribuído nas salas para contraste quente vs pedra fria
      const brazierOffsetX = room.kind === 'entrance' ? -halfW + 1.6 : halfW - 1.8;
      const brazierOffsetZ = room.kind === 'entrance' ? -halfH + 1.6 : -halfH + 1.8;
      const bx = room.centerX + brazierOffsetX;
      const bz = room.centerZ + brazierOffsetZ;
      const withLight =
        remainingBrazierLights > 0 && room.kind !== 'entrance' && room.kind !== 'sanctum';
      if (withLight) remainingBrazierLights--;
      this.addBrazier(bx, bz, steelMat, withLight, i * 1.37);
    }
  }

  private buildEntranceRoom(
    room: DungeonRoom,
    stoneMat: THREE.Material,
    goldMat: THREE.Material,
  ): void {
    // Runa circular no ponto de chegada (0, 0)
    const arrivalRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(1.15, 1.4, 32)),
      this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#6fb4ff',
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    arrivalRing.rotation.x = -Math.PI / 2;
    arrivalRing.position.set(room.centerX, 0.02, room.centerZ);
    this.group.add(arrivalRing);

    // Portal de Retorno atrás da direção inicial do corredor
    const nextRoom =
      this.layout.rooms[room.connections[0]] ?? this.layout.rooms[1] ?? room;
    let dirX = nextRoom.centerX - room.centerX;
    let dirZ = nextRoom.centerZ - room.centerZ;
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len;
    dirZ /= len;

    const px = room.centerX - dirX * 3.6;
    const pz = room.centerZ - dirZ * 3.6;
    const facingYaw = Math.atan2(dirX, dirZ);

    const portal = this.createArcanePortalMesh(
      '#58a8ff',
      '#7fd0ff',
      stoneMat,
      goldMat,
      true,
    );
    portal.position.set(px, 0, pz);
    portal.rotation.y = facingYaw;
    this.group.add(portal);

    this.interactionZones.push({
      x: px,
      z: pz,
      radiusSq: 2.2 * 2.2,
      label: 'Portal da Alvorada — Retornar ao Salão Real',
      action: 'exit-dungeon',
      actionLabel: 'Voltar ao Salão',
    });
  }

  private buildSanctumRoom(
    room: DungeonRoom,
    stoneMat: THREE.Material,
    goldMat: THREE.Material,
  ): void {
    const parentId = room.connections[0] ?? 0;
    const parent = this.layout.rooms[parentId] ?? this.layout.rooms[0];

    const dx = room.centerX - parent.centerX;
    const dz = room.centerZ - parent.centerZ;
    // Separa os dois marcos perpendicularmente ao corredor de entrada (>= 4.6m de distância)
    const sepAlongX = Math.abs(dz) >= Math.abs(dx);
    const halfSpan = sepAlongX
      ? Math.min(2.6, room.w * CELL_SIZE * 0.5 - 1.6)
      : Math.min(2.6, room.h * CELL_SIZE * 0.5 - 1.6);

    const riftX = room.centerX + (sepAlongX ? -halfSpan : 0);
    const riftZ = room.centerZ + (sepAlongX ? 0 : -halfSpan);

    const sealX = room.centerX + (sepAlongX ? halfSpan : 0);
    const sealZ = room.centerZ + (sepAlongX ? 0 : halfSpan);

    // 1. Fenda Abissal para próximo andar randômico
    const rift = this.createArcanePortalMesh(
      '#b366ff',
      '#e2b6ff',
      stoneMat,
      goldMat,
      true,
    );
    rift.position.set(riftX, 0, riftZ);
    rift.rotation.y = Math.atan2(parent.centerX - riftX, parent.centerZ - riftZ);
    this.group.add(rift);

    this.interactionZones.push({
      x: riftX,
      z: riftZ,
      radiusSq: 2.1 * 2.1,
      label: 'Fenda Abissal — Profundezas Instáveis',
      action: 'next-dungeon-floor',
      actionLabel: `Descer ao Andar ${this.floorNumber + 1}`,
    });

    // 2. Selo Real de Extração (Voltar ao Salão)
    const sealGroup = new THREE.Group();
    sealGroup.position.set(sealX, 0, sealZ);

    const dais = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(1.15, 1.32, 0.24, 16)),
      stoneMat,
    );
    dais.position.y = 0.12;
    dais.receiveShadow = true;
    sealGroup.add(dais);

    const pedestal = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.45, 0.58, 0.95, 8)),
      goldMat,
    );
    pedestal.position.y = 0.72;
    pedestal.castShadow = true;
    sealGroup.add(pedestal);

    const crystal = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.42, 0)),
      this.trackMat(
        new THREE.MeshStandardMaterial({
          color: '#7cc5ff',
          emissive: '#38bdf8',
          emissiveIntensity: 1.35,
          roughness: 0.15,
          metalness: 0.2,
        }),
      ),
    );
    crystal.position.y = 1.65;
    sealGroup.add(crystal);
    this.rotatingCrystals.push(crystal);

    this.group.add(sealGroup);
    this.circleColliders.push({ x: sealX, z: sealZ, radius: 0.65 });

    this.interactionZones.push({
      x: sealX,
      z: sealZ,
      radiusSq: 2.1 * 2.1,
      label: 'Selo da Alvorada — Retornar à Home',
      action: 'exit-dungeon',
      actionLabel: 'Voltar ao Salão',
    });
  }

  private buildTreasurePedestal(
    room: DungeonRoom,
    stoneMat: THREE.Material,
    goldMat: THREE.Material,
  ): void {
    const pedGroup = new THREE.Group();
    pedGroup.position.set(room.centerX, 0, room.centerZ);

    const base = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(1.1, 1.3, 0.22, 12)),
      stoneMat,
    );
    base.position.y = 0.11;
    base.receiveShadow = true;
    pedGroup.add(base);

    const trim = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(1.08, 0.04, 8, 24)),
      goldMat,
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.22;
    pedGroup.add(trim);

    this.group.add(pedGroup);
    this.circleColliders.push({ x: room.centerX, z: room.centerZ, radius: 0.74 });

    // Carrega baú CC0 real (public/models/items/chest_closed.glb) normalizado em cima do pódio
    const loader = new GLTFLoader();
    const chestUrl = `${import.meta.env.BASE_URL}models/items/chest_closed.glb`;

    loader.load(
      chestUrl,
      (gltf) => {
        if (this.disposed) return;
        const model = gltf.scene;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          const scale = 1.15 / maxDim;
          model.scale.setScalar(scale);
          model.updateMatrixWorld(true);
        }

        const scaledBox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        scaledBox.getCenter(center);

        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y += 0.22 - scaledBox.min.y;

        model.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        pedGroup.add(model);
      },
      undefined,
      () => {
        if (this.disposed) return;
        const fallbackChest = new THREE.Mesh(
          this.trackGeo(new THREE.BoxGeometry(0.95, 0.65, 0.65)),
          goldMat,
        );
        fallbackChest.position.y = 0.55;
        fallbackChest.castShadow = true;
        pedGroup.add(fallbackChest);
      },
    );
  }

  private createArcanePortalMesh(
    lightColor: string,
    ringColor: string,
    stoneMat: THREE.Material,
    goldMat: THREE.Material,
    withLight: boolean,
  ): THREE.Group {
    const g = new THREE.Group();

    const plinth = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(1.38, 1.56, 0.2, 16)),
      stoneMat,
    );
    plinth.position.y = 0.1;
    plinth.receiveShadow = true;
    g.add(plinth);

    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.36, 2.75, 0.36)),
        stoneMat,
      );
      pillar.position.set(side * 0.96, 1.48, 0);
      pillar.castShadow = true;
      g.add(pillar);

      const cap = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.46, 0.16, 0.46)),
        goldMat,
      );
      cap.position.set(side * 0.96, 2.9, 0);
      g.add(cap);
    }

    const lintel = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(2.45, 0.36, 0.48)),
      stoneMat,
    );
    lintel.position.set(0, 3.12, 0);
    lintel.castShadow = true;
    g.add(lintel);

    const vortexRing = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.76, 0.065, 10, 28)),
      this.trackMat(
        new THREE.MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: 0.9,
        }),
      ),
    );
    vortexRing.position.set(0, 1.58, 0);
    g.add(vortexRing);
    this.portalRings.push(vortexRing);

    const core = new THREE.Mesh(
      this.trackGeo(new THREE.CircleGeometry(0.66, 24)),
      this.trackMat(
        new THREE.MeshBasicMaterial({
          color: lightColor,
          transparent: true,
          opacity: 0.36,
          side: THREE.DoubleSide,
        }),
      ),
    );
    core.position.set(0, 1.58, 0);
    g.add(core);

    if (withLight) {
      const light = new THREE.PointLight(lightColor, 3.0, 10.5, 1.5);
      light.position.set(0, 1.9, 0.8);
      g.add(light);
    }

    return g;
  }

  private addPillar(
    x: number,
    z: number,
    stoneMat: THREE.Material,
    goldMat: THREE.Material,
  ): void {
    const pillarGroup = new THREE.Group();
    pillarGroup.position.set(x, 0, z);

    const base = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.95, 0.35, 0.95)),
      stoneMat,
    );
    base.position.y = 0.175;
    base.castShadow = true;
    base.receiveShadow = true;
    pillarGroup.add(base);

    const shaft = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.32, 0.38, 2.8, 10)),
      stoneMat,
    );
    shaft.position.y = 1.75;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    pillarGroup.add(shaft);

    const band = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 10)),
      goldMat,
    );
    band.position.y = 2.95;
    pillarGroup.add(band);

    this.group.add(pillarGroup);
    this.circleColliders.push({ x, z, radius: 0.54 });
  }

  private addBrazier(
    x: number,
    z: number,
    metalMat: THREE.Material,
    withLight: boolean,
    phase: number,
  ): void {
    const bGroup = new THREE.Group();
    bGroup.position.set(x, 0, z);

    const bowl = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.34, 0.2, 0.55, 8)),
      metalMat,
    );
    bowl.position.y = 0.275;
    bowl.castShadow = true;
    bGroup.add(bowl);

    const flame = new THREE.Mesh(
      this.trackGeo(new THREE.ConeGeometry(0.22, 0.58, 6)),
      this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#ff9c42',
          transparent: true,
          opacity: 0.9,
        }),
      ),
    );
    flame.position.y = 0.82;
    bGroup.add(flame);

    let light: THREE.PointLight | undefined;
    if (withLight) {
      light = new THREE.PointLight('#ff9242', 2.4, 11.0, 1.55);
      light.position.set(0, 1.15, 0);
      bGroup.add(light);
    }

    this.flames.push({
      mesh: flame,
      baseScaleY: 1,
      phase,
      light,
      baseIntensity: 2.4,
    });

    this.group.add(bGroup);
    this.circleColliders.push({ x, z, radius: 0.38 });
  }

  private buildEmberParticles(): void {
    const geo = this.trackGeo(new THREE.BufferGeometry());
    this.emberPositions = new Float32Array(this.emberCount * 3);
    this.emberSeeds = new Float32Array(this.emberCount);

    const spanX = this.boundsMaxX - this.boundsMinX;
    const spanZ = this.boundsMaxZ - this.boundsMinZ;

    for (let i = 0; i < this.emberCount; i++) {
      this.emberPositions[i * 3 + 0] = this.boundsMinX + Math.random() * spanX;
      this.emberPositions[i * 3 + 1] = 0.35 + Math.random() * 3.8;
      this.emberPositions[i * 3 + 2] = this.boundsMinZ + Math.random() * spanZ;
      this.emberSeeds[i] = Math.random() * Math.PI * 2;
    }

    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.emberPositions, 3),
    );

    const mat = this.trackMat(
      new THREE.PointsMaterial({
        color: '#88bfff',
        size: 0.095,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );

    this.emberPoints = new THREE.Points(geo, mat);
    this.group.add(this.emberPoints);
  }

  public getNearbyInteractionPrompt(
    pos: THREE.Vector3,
  ): InteractionPrompt | null {
    return findNearbyInteraction(this.interactionZones, pos);
  }

  public update(dt: number, elapsed: number, playerPos: THREE.Vector3): void {
    this.dirLight.position.set(playerPos.x + 16, 20, playerPos.z - 12);
    this.dirLight.target.position.copy(playerPos);

    for (let i = 0; i < this.portalRings.length; i++) {
      this.portalRings[i].rotation.z = elapsed * (i % 2 === 0 ? 0.55 : -0.62);
    }

    for (let i = 0; i < this.rotatingCrystals.length; i++) {
      const crystal = this.rotatingCrystals[i];
      crystal.rotation.y = elapsed * 1.1;
      crystal.position.y = 1.65 + Math.sin(elapsed * 2.4 + i) * 0.1;
    }

    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const flicker = Math.sin(elapsed * 8.5 + f.phase) * 0.12 +
        Math.sin(elapsed * 14.2 + f.phase * 1.7) * 0.06;
      f.mesh.scale.y = f.baseScaleY + flicker;
      if (f.light) {
        f.light.intensity = f.baseIntensity + flicker * 2.2;
      }
    }

    const posAttr = this.emberPoints.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    for (let i = 0; i < this.emberCount; i++) {
      const idx = i * 3;
      const seed = this.emberSeeds[i];
      this.emberPositions[idx + 1] += dt * (0.22 + (i % 3) * 0.06);
      this.emberPositions[idx + 0] += Math.sin(elapsed * 0.9 + seed) * dt * 0.18;
      this.emberPositions[idx + 2] += Math.cos(elapsed * 0.8 + seed) * dt * 0.18;

      if (this.emberPositions[idx + 1] > 4.2) {
        this.emberPositions[idx + 1] = 0.25;
      }
    }
    posAttr.needsUpdate = true;
  }

  public renderMinimap(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    playerPos: THREE.Vector3,
    playerYaw: number,
  ): void {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(10, 16, 30, 0.88)';
    ctx.fillRect(0, 0, width, height);

    const pad = 14;
    const minWorldX = this.boundsMinX;
    const maxWorldX = this.boundsMaxX;
    const minWorldZ = this.boundsMinZ;
    const maxWorldZ = this.boundsMaxZ;
    const midWorldX = (minWorldX + maxWorldX) * 0.5;
    const midWorldZ = (minWorldZ + maxWorldZ) * 0.5;
    const spanX = Math.max(1, maxWorldX - minWorldX);
    const spanZ = Math.max(1, maxWorldZ - minWorldZ);

    // Rotação +45° alinha o minimapa exatamente à câmera isométrica (W = cima, D = direita)
    const diagSpan = (spanX + spanZ) * Math.SQRT1_2;
    const scale = Math.min(width - pad * 2, height - pad * 2) / Math.max(1, diagSpan);

    const toCanvas = (wx: number, wz: number): { x: number; y: number } => {
      const dx = wx - midWorldX;
      const dz = wz - midWorldZ;
      const rx = (dx - dz) * Math.SQRT1_2;
      const ry = (dx + dz) * Math.SQRT1_2;
      return {
        x: width * 0.5 + rx * scale,
        y: height * 0.5 + ry * scale,
      };
    };

    const drawIsoRect = (
      wx0: number,
      wz0: number,
      ww: number,
      wh: number,
      fillStyle: string,
      strokeStyle?: string,
    ): void => {
      const p1 = toCanvas(wx0, wz0);
      const p2 = toCanvas(wx0 + ww, wz0);
      const p3 = toCanvas(wx0 + ww, wz0 + wh);
      const p4 = toCanvas(wx0, wz0 + wh);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
      if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    // Corredores
    for (const cor of this.layout.corridors) {
      const wx0 = gridToWorldX(cor.gx, this.layout.originGx);
      const wz0 = gridToWorldZ(cor.gz, this.layout.originGz);
      drawIsoRect(wx0, wz0, cor.w * CELL_SIZE, cor.h * CELL_SIZE, '#334668');
    }

    // Salas
    for (const room of this.layout.rooms) {
      const wx0 = gridToWorldX(room.gx, this.layout.originGx);
      const wz0 = gridToWorldZ(room.gz, this.layout.originGz);
      const rw = room.w * CELL_SIZE;
      const rh = room.h * CELL_SIZE;

      const fill =
        room.kind === 'sanctum'
          ? 'rgba(147, 82, 232, 0.58)'
          : room.kind === 'treasure'
            ? 'rgba(202, 148, 52, 0.55)'
            : room.kind === 'entrance'
              ? 'rgba(56, 134, 232, 0.48)'
              : '#44597e';

      drawIsoRect(wx0, wz0, rw, rh, fill, 'rgba(182, 206, 245, 0.36)');

      if (room.kind === 'treasure' || room.kind === 'sanctum' || room.kind === 'entrance') {
        const c = toCanvas(room.centerX, room.centerZ);
        ctx.fillStyle =
          room.kind === 'sanctum'
            ? '#d8b4fe'
            : room.kind === 'treasure'
              ? '#fde047'
              : '#7dd3fc';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Indicador direcional do jogador alinhado à projeção +45° do minimapa
    const pCanvas = toCanvas(playerPos.x, playerPos.z);
    const fwdX = Math.sin(playerYaw);
    const fwdZ = Math.cos(playerYaw);
    const screenDirX = (fwdX - fwdZ) * Math.SQRT1_2;
    const screenDirY = (fwdX + fwdZ) * Math.SQRT1_2;
    const arrowAngle = Math.atan2(screenDirX, -screenDirY);

    ctx.save();
    ctx.translate(pCanvas.x, pCanvas.y);
    ctx.rotate(arrowAngle);

    ctx.fillStyle = '#fbbf24';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -5.5);
    ctx.lineTo(4, 4.5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  public dispose(): void {
    this.disposed = true;
    for (const geo of this.ownedGeometries) {
      geo.dispose();
    }
    for (const mat of this.ownedMaterials) {
      mat.dispose();
    }
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
  }
}

/// <reference types="vite/client" />
import * as THREE from 'three';
import {
  findNearbyInteraction,
  type BoxCollider,
  type CircleCollider,
  type InteractionPrompt,
  type InteractionZone,
} from './Collision';
import { dungeonAssetLibrary } from './DungeonAssets';
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
  grid: Uint8Array;
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
      for (let idx = rooms.length - 1; idx >= 0 && !added; idx--) {
        added = tryExpandFromRoom(rooms[idx], false);
      }
    } else {
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

      const blocksIsoView =
        isWalkable(gx - 1, gz) ||
        isWalkable(gx, gz - 1) ||
        isWalkable(gx - 1, gz - 1) ||
        isWalkable(gx - 2, gz - 2);

      grid[gz * GRID_SIZE + gx] = blocksIsoView ? CELL_WALL_LOW : CELL_WALL_HIGH;
    }
  }

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
    grid,
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
}

interface FireSource {
  x: number;
  y: number;
  z: number;
  phase: number;
  baseIntensity: number;
}

interface MistLayer {
  mesh: THREE.Mesh;
  baseX: number;
  baseZ: number;
  speedX: number;
  speedZ: number;
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
  private readonly keyLight: THREE.DirectionalLight;
  private readonly portalRings: THREE.Mesh[] = [];
  private readonly rotatingCrystals: THREE.Mesh[] = [];
  private readonly flames: AnimatedFlame[] = [];
  private readonly fireSources: FireSource[] = [];
  private readonly torchLightPool: THREE.PointLight[] = [];
  private readonly mistLayers: MistLayer[] = [];

  private readonly emberCount = 180;
  private emberPoints!: THREE.Points;
  private emberPositions!: Float32Array;
  private emberSeeds!: Float32Array;

  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedClonedTextures: THREE.Texture[] = [];
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

    dungeonAssetLibrary.preload([
      'pillar_decorated',
      'torch_mounted',
      'candle_triple',
      'barrel_decorated',
      'crates_stacked',
      'rubble_large',
      'banner_royal',
      'chest_gold',
      'coin_stack',
      'wall_arched',
      'column_broken',
      'candelabrum_tall',
      'cave_wall_rocks',
      'boulder_large',
      'mountain_group_1',
      'mountain_group_2',
    ]);

    this.computeWorldBounds();
    this.keyLight = this.buildLighting();
    this.buildArchitecture(textures);
    this.buildSubterraneanFoundations();
    this.buildMountainCavernBackdrop(textures);
    this.buildFeaturesAndProps();
    this.buildSubterraneanLightShafts(textures);
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

  private trackTex<T extends THREE.Texture>(tex: T): T {
    this.ownedClonedTextures.push(tex);
    return tex;
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
    // Luz ambiente equilibrada: céu frio cavernoso + rebatimento quente-ameixa
    const hemi = new THREE.HemisphereLight('#5e82c8', '#261b30', 0.8);
    this.group.add(hemi);

    // Key light fria com sombras nítidas seguindo o jogador
    const keyLight = new THREE.DirectionalLight('#9ac0ff', 1.32);
    keyLight.position.set(16, 20, -12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 75;
    const d = 24;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0004;
    this.group.add(keyLight);
    this.group.add(keyLight.target);

    // Rim light subterrânea vinda do abismo para recortar penhascos e fundações
    const rimLight = new THREE.DirectionalLight('#4c3a78', 0.45);
    rimLight.position.set(-18, -8, 18);
    this.group.add(rimLight);

    // Pool dinâmico de 5 PointLights de fogo seguindo as tochas/braseiros mais próximos
    for (let i = 0; i < 5; i++) {
      const torchLight = new THREE.PointLight('#ff9642', 0, 14.0, 1.55);
      torchLight.position.set(0, -50, 0);
      this.group.add(torchLight);
      this.torchLightPool.push(torchLight);
    }

    return keyLight;
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
        color: '#2b3449',
        roughness: 0.56,
        metalness: 0.22,
      }),
    );

    const darkGoldMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#a37b36',
        roughness: 0.35,
        metalness: 0.78,
      }),
    );

    for (const room of this.layout.rooms) {
      const worldW = room.w * CELL_SIZE;
      const worldH = room.h * CELL_SIZE;
      const floorGeo = this.trackGeo(new THREE.PlaneGeometry(worldW, worldH));

      const floorMap = this.trackTex(textures.stoneFloorMap.clone());
      floorMap.needsUpdate = true;
      floorMap.repeat.set(room.w * 0.5, room.h * 0.5);

      const floorBump = this.trackTex(textures.stoneFloorBump.clone());
      floorBump.needsUpdate = true;
      floorBump.repeat.set(room.w * 0.5, room.h * 0.5);

      const roomMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          map: floorMap,
          bumpMap: floorBump,
          bumpScale: 0.045,
          roughness: 0.62,
          metalness: 0.1,
        }),
      );

      const floorMesh = new THREE.Mesh(floorGeo, roomMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.set(room.centerX, 0, room.centerZ);
      floorMesh.receiveShadow = true;
      this.group.add(floorMesh);

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
          opacity: 0.24,
          depthWrite: false,
        }),
      );
      const ringDecal = new THREE.Mesh(trimGeo, trimMat);
      ringDecal.rotation.x = -Math.PI / 2;
      ringDecal.rotation.z = Math.PI / 4;
      ringDecal.position.set(room.centerX, 0.012, room.centerZ);
      this.group.add(ringDecal);
    }

    for (const cor of this.layout.corridors) {
      const worldW = cor.w * CELL_SIZE;
      const worldH = cor.h * CELL_SIZE;
      const corGeo = this.trackGeo(new THREE.PlaneGeometry(worldW, worldH));
      const corMap = this.trackTex(textures.corridorFloorMap.clone());
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
      } else {
        const topRimGeo = this.trackGeo(
          new THREE.BoxGeometry(width + 0.08, 0.22, depth + 0.08),
        );
        const topRim = new THREE.Mesh(topRimGeo, lowWallTrimMat);
        topRim.position.set(cx, height - 0.06, cz);
        this.group.add(topRim);
      }

      this.boxColliders.push({
        minX: wRect.minX,
        maxX: wRect.maxX,
        minZ: wRect.minZ,
        maxZ: wRect.maxZ,
      });
    }
  }

  private buildSubterraneanFoundations(): void {
    const foundationDepth = 13.5;
    const baseMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#192133',
        roughness: 0.88,
        metalness: 0.08,
      }),
    );
    const ledgeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#28334b',
        roughness: 0.72,
        metalness: 0.16,
      }),
    );

    const addFoundationSlab = (cx: number, cz: number, w: number, h: number) => {
      const ledgeGeo = this.trackGeo(
        new THREE.BoxGeometry(w + 0.72, 0.44, h + 0.72),
      );
      const ledge = new THREE.Mesh(ledgeGeo, ledgeMat);
      ledge.position.set(cx, -0.24, cz);
      ledge.receiveShadow = true;
      this.group.add(ledge);

      const pillarGeo = this.trackGeo(
        new THREE.BoxGeometry(w + 0.42, foundationDepth, h + 0.42),
      );
      const slab = new THREE.Mesh(pillarGeo, baseMat);
      slab.position.set(cx, -foundationDepth * 0.5 - 0.04, cz);
      slab.receiveShadow = true;
      this.group.add(slab);
    };

    for (const room of this.layout.rooms) {
      addFoundationSlab(
        room.centerX,
        room.centerZ,
        room.w * CELL_SIZE,
        room.h * CELL_SIZE,
      );
    }

    for (const cor of this.layout.corridors) {
      const cx = gridToWorldX(cor.gx + cor.w * 0.5, this.layout.originGx);
      const cz = gridToWorldZ(cor.gz + cor.h * 0.5, this.layout.originGz);
      addFoundationSlab(cx, cz, cor.w * CELL_SIZE, cor.h * CELL_SIZE);
    }
  }

  private buildMountainCavernBackdrop(textures: DungeonTextureSet): void {
    const midX = (this.boundsMinX + this.boundsMaxX) * 0.5;
    const midZ = (this.boundsMinZ + this.boundsMaxZ) * 0.5;
    const spanX = this.boundsMaxX - this.boundsMinX;
    const spanZ = this.boundsMaxZ - this.boundsMinZ;
    const outerRadius = Math.max(spanX, spanZ) * 0.62;
    const abyssY = -13.5;

    const rockMap = this.trackTex(textures.cavernRockMap.clone());
    rockMap.needsUpdate = true;
    rockMap.repeat.set(26, 26);

    // 1. Leito profundo da caverna sob toda a masmorra
    const cavernBed = new THREE.Mesh(
      this.trackGeo(new THREE.CircleGeometry(145, 48)),
      this.trackMat(
        new THREE.MeshStandardMaterial({
          map: rockMap,
          color: '#6b7d9c',
          roughness: 0.94,
          metalness: 0.04,
        }),
      ),
    );
    cavernBed.rotation.x = -Math.PI / 2;
    cavernBed.position.set(midX, abyssY, midZ);
    cavernBed.receiveShadow = true;
    this.group.add(cavernBed);

    // Fissuras arcanas/geotérmicas tênues no fundo do abismo
    const rng = mulberry32(this.seed ^ 0x5f3759df);
    const fissureColors = ['#2462a6', '#7a3f9e', '#a85124'];
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + rng() * 0.5;
      const dist = 10 + rng() * (outerRadius + 16);
      const fx = midX + Math.cos(ang) * dist;
      const fz = midZ + Math.sin(ang) * dist;

      const fissure = new THREE.Mesh(
        this.trackGeo(new THREE.RingGeometry(1.4, 2.5 + rng() * 1.8, 12)),
        this.trackMat(
          new THREE.MeshBasicMaterial({
            color: fissureColors[i % fissureColors.length],
            transparent: true,
            opacity: 0.24,
            depthWrite: false,
          }),
        ),
      );
      fissure.rotation.x = -Math.PI / 2;
      fissure.position.set(fx, abyssY + 0.06, fz);
      this.group.add(fissure);
    }

    // 2. Duas camadas de névoa translúcida no abismo criando paralaxe vertical
    const mistSpecs: Array<[number, number, string, number, number, number]> = [
      [-9.2, 85, '#13203b', 0.2, 0.24, 0.16],
      [-5.2, 72, '#1a2b4d', 0.13, -0.18, 0.22],
    ];
    for (const [my, rad, color, opacity, sx, sz] of mistSpecs) {
      const mist = new THREE.Mesh(
        this.trackGeo(new THREE.CircleGeometry(rad, 36)),
        this.trackMat(
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthWrite: false,
          }),
        ),
      );
      mist.rotation.x = -Math.PI / 2;
      mist.position.set(midX, my, midZ);
      this.group.add(mist);
      this.mistLayers.push({
        mesh: mist,
        baseX: midX,
        baseZ: midZ,
        speedX: sx,
        speedZ: sz,
      });
    }

    // 3. Anfiteatro de paredões montanhosos atrás e nas laterais do mapa (arco visível -X / -Z e flancos)
    const cliffRockMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#171f2e',
        roughness: 0.92,
        metalness: 0.06,
      }),
    );

    const isNearPlayable = (wx: number, wz: number, minRoomPad: number): boolean => {
      for (const r of this.layout.rooms) {
        const rx0 = gridToWorldX(r.gx, this.layout.originGx) - minRoomPad;
        const rx1 = gridToWorldX(r.gx + r.w, this.layout.originGx) + minRoomPad;
        const rz0 = gridToWorldZ(r.gz, this.layout.originGz) - minRoomPad;
        const rz1 = gridToWorldZ(r.gz + r.h, this.layout.originGz) + minRoomPad;
        if (wx >= rx0 && wx <= rx1 && wz >= rz0 && wz <= rz1) return true;
      }
      for (const c of this.layout.corridors) {
        const cx0 = gridToWorldX(c.gx, this.layout.originGx) - minRoomPad;
        const cx1 = gridToWorldX(c.gx + c.w, this.layout.originGx) + minRoomPad;
        const cz0 = gridToWorldZ(c.gz, this.layout.originGz) - minRoomPad;
        const cz1 = gridToWorldZ(c.gz + c.h, this.layout.originGz) + minRoomPad;
        if (wx >= cx0 && wx <= cx1 && wz >= cz0 && wz <= cz1) return true;
      }
      return false;
    };

    // Arco de 260° cobrindo esquerda, fundo norte/oeste e direita (+105°..+365° / -15°)
    // deixando a frente (+15°..+95° em direção à câmera) aberta para nunca tapar a tela
    const peakCount = 18;
    for (let i = 0; i < peakCount; i++) {
      const t = i / (peakCount - 1);
      const deg = 105 + t * 245;
      const rad = (deg * Math.PI) / 180;
      const ringRadius = outerRadius + 14 + (i % 3) * 7 + rng() * 6;
      const mx = midX + Math.cos(rad) * ringRadius;
      const mz = midZ + Math.sin(rad) * ringRadius;
      if (isNearPlayable(mx, mz, 9)) continue;

      const peakH = 19 + rng() * 14;
      const rotY = rng() * Math.PI * 2;
      const key = i % 2 === 0 ? 'mountain_group_1' : 'mountain_group_2';

      // Base rochosa estilizada imediata + modelo CC0 detalhado sobreposto
      const baseRock = new THREE.Mesh(
        this.trackGeo(new THREE.ConeGeometry(8.5 + rng() * 3.5, peakH * 0.72, 6)),
        cliffRockMat,
      );
      baseRock.position.set(mx, abyssY + peakH * 0.36, mz);
      baseRock.rotation.y = rotY;
      this.group.add(baseRock);

      dungeonAssetLibrary.spawnProp(key, this.group, {
        x: mx,
        y: abyssY,
        z: mz,
        rotY,
        targetHeight: peakH,
        scaleXZ: 1.3,
        castShadow: false,
        receiveShadow: true,
        isDisposed: () => this.disposed,
      });
    }

    // 4. Platôs rochosos, escarpas, ruínas e cristais arcanos espalhados pelo abismo e entre salas
    const crystalCyanMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#5ec8ff',
        emissive: '#228be6',
        emissiveIntensity: 1.05,
        roughness: 0.2,
        metalness: 0.25,
      }),
    );
    const crystalVioletMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#c78cff',
        emissive: '#8b46d9',
        emissiveIntensity: 1.05,
        roughness: 0.2,
        metalness: 0.25,
      }),
    );

    const isWalkableCell = (gx: number, gz: number): boolean => {
      if (gx < 0 || gz < 0 || gx >= GRID_SIZE || gz >= GRID_SIZE) return false;
      const cell = this.layout.grid[gz * GRID_SIZE + gx];
      return cell === CELL_ROOM || cell === CELL_CORRIDOR;
    };

    const blocksCameraBehind = (wx: number, wz: number): boolean => {
      const gx = Math.round(wx / CELL_SIZE + this.layout.originGx);
      const gz = Math.round(wz / CELL_SIZE + this.layout.originGz);
      for (let dz = -5; dz <= 1; dz++) {
        for (let dx = -5; dx <= 1; dx++) {
          if (isWalkableCell(gx + dx, gz + dz)) return true;
        }
      }
      return false;
    };

    let placedProps = 0;
    for (let attempt = 0; attempt < 95 && placedProps < 34; attempt++) {
      const wx =
        this.boundsMinX - 14 + rng() * (spanX + 28);
      const wz =
        this.boundsMinZ - 14 + rng() * (spanZ + 28);

      if (isNearPlayable(wx, wz, 5.2)) continue;

      const onCamForeground = blocksCameraBehind(wx, wz);
      const maxTopY = onCamForeground ? -1.15 : 4.2;
      const plateauH = 6.5 + rng() * 5.2;
      const topY = Math.min(maxTopY, abyssY + plateauH + 1.8);

      // Platô rochoso emergindo do leito da caverna
      const spireRadius = 1.6 + rng() * 1.9;
      const spireH = topY - abyssY;
      const spire = new THREE.Mesh(
        this.trackGeo(
          new THREE.CylinderGeometry(spireRadius * 0.72, spireRadius * 1.2, spireH, 7),
        ),
        cliffRockMat,
      );
      spire.position.set(wx, abyssY + spireH * 0.5, wz);
      spire.rotation.y = rng() * Math.PI * 2;
      spire.receiveShadow = true;
      this.group.add(spire);

      // Asset CC0 ou cristal arcano no topo do platô
      const roll = rng();
      if (roll < 0.42) {
        dungeonAssetLibrary.spawnProp('boulder_large', this.group, {
          x: wx,
          y: topY - 0.3,
          z: wz,
          rotY: rng() * Math.PI * 2,
          targetHeight: onCamForeground ? 1.1 : 2.6 + rng() * 1.8,
          castShadow: false,
          receiveShadow: true,
          isDisposed: () => this.disposed,
        });
      } else if (roll < 0.68 && !onCamForeground) {
        dungeonAssetLibrary.spawnProp('cave_wall_rocks', this.group, {
          x: wx,
          y: topY - 0.2,
          z: wz,
          rotY: rng() * Math.PI * 2,
          targetHeight: 3.4 + rng() * 2.2,
          castShadow: false,
          receiveShadow: true,
          isDisposed: () => this.disposed,
        });
      } else if (roll < 0.84 && !onCamForeground) {
        dungeonAssetLibrary.spawnProp('column_broken', this.group, {
          x: wx,
          y: topY - 0.1,
          z: wz,
          rotY: rng() * Math.PI * 2,
          targetHeight: 2.3 + rng() * 1.2,
          castShadow: false,
          receiveShadow: true,
          isDisposed: () => this.disposed,
        });
      } else {
        const cH = onCamForeground ? 1.0 : 1.7 + rng() * 1.3;
        const crystal = new THREE.Mesh(
          this.trackGeo(new THREE.OctahedronGeometry(cH * 0.38, 0)),
          placedProps % 2 === 0 ? crystalCyanMat : crystalVioletMat,
        );
        crystal.scale.set(0.75, 1.65, 0.75);
        crystal.position.set(wx, topY + cH * 0.48, wz);
        crystal.rotation.y = rng() * Math.PI;
        this.group.add(crystal);
      }

      placedProps++;
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

    const rng = mulberry32(this.seed ^ 0xa511e9b3);

    // 1. Tochas de parede e estandartes reais montados nas paredes altas traseiras (-X / -Z)
    this.mountHighWallDecorations(rng);

    // 2. Recursos específicos de cada sala + pilares decorados + braseiros + cantos
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

      if (room.kind === 'chamber' && room.w >= 5 && room.h >= 5) {
        const pxOff = halfW - 1.9;
        const pzOff = halfH - 1.9;
        const corners: Array<[number, number]> = [
          [room.centerX - pxOff, room.centerZ - pzOff],
          [room.centerX + pxOff, room.centerZ + pzOff],
        ];
        for (const [cx, cz] of corners) {
          this.addDecoratedPillar(cx, cz, stoneDarkMat, goldMat);
        }
      }

      // Braseiro aceso por sala (iluminado pelo pool dinâmico conforme proximidade!)
      const brazierOffsetX = room.kind === 'entrance' ? -halfW + 1.5 : halfW - 1.7;
      const brazierOffsetZ = room.kind === 'entrance' ? -halfH + 1.5 : -halfH + 1.7;
      const bx = room.centerX + brazierOffsetX;
      const bz = room.centerZ + brazierOffsetZ;
      this.addBrazier(bx, bz, steelMat, i * 1.37);

      // Clutter temático nos cantos seguros das câmaras e entrada (barris, caixas, escombros)
      if (room.kind === 'chamber' || room.kind === 'entrance') {
        this.populateRoomCorners(room, rng);
      }
    }
  }

  private mountHighWallDecorations(rng: () => number): void {
    const wallMountSpots: Array<{
      x: number;
      z: number;
      rotY: number;
    }> = [];

    for (let gz = 1; gz < GRID_SIZE - 1; gz++) {
      for (let gx = 1; gx < GRID_SIZE - 1; gx++) {
        if (this.layout.grid[gz * GRID_SIZE + gx] !== CELL_WALL_HIGH) continue;

        const roomEast = this.layout.grid[gz * GRID_SIZE + (gx + 1)] === CELL_ROOM;
        const roomSouth = this.layout.grid[(gz + 1) * GRID_SIZE + gx] === CELL_ROOM;

        if (roomSouth && !roomEast) {
          wallMountSpots.push({
            x: gridToWorldX(gx + 0.5, this.layout.originGx),
            z: gridToWorldZ(gz + 1, this.layout.originGz) + 0.08,
            rotY: 0,
          });
        } else if (roomEast && !roomSouth) {
          wallMountSpots.push({
            x: gridToWorldX(gx + 1, this.layout.originGx) + 0.08,
            z: gridToWorldZ(gz + 0.5, this.layout.originGz),
            rotY: Math.PI * 0.5,
          });
        }
      }
    }

    const placed: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < wallMountSpots.length; i++) {
      const spot = wallMountSpots[i];
      let tooClose = false;
      for (const p of placed) {
        if (Math.hypot(spot.x - p.x, spot.z - p.z) < 4.5) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      placed.push({ x: spot.x, z: spot.z });

      if (placed.length % 2 === 1) {
        dungeonAssetLibrary.spawnProp('torch_mounted', this.group, {
          x: spot.x,
          y: 1.78,
          z: spot.z,
          rotY: spot.rotY,
          targetHeight: 0.92,
          castShadow: false,
          receiveShadow: true,
          isDisposed: () => this.disposed,
        });

        // Chama animada + fonte registrada no pool dinâmico de luz
        const fwdX = Math.sin(spot.rotY) * 0.24;
        const fwdZ = Math.cos(spot.rotY) * 0.24;
        const flame = this.createFlameMesh(0.12, 0.32, i * 0.9);
        flame.position.set(spot.x + fwdX, 2.55, spot.z + fwdZ);
        this.group.add(flame);

        this.fireSources.push({
          x: spot.x + fwdX,
          y: 2.55,
          z: spot.z + fwdZ,
          phase: i * 1.1,
          baseIntensity: 2.45,
        });
      } else {
        dungeonAssetLibrary.spawnProp('banner_royal', this.group, {
          x: spot.x,
          y: 0.95 + rng() * 0.15,
          z: spot.z,
          rotY: spot.rotY,
          targetHeight: 1.85,
          castShadow: false,
          receiveShadow: true,
          isDisposed: () => this.disposed,
        });
      }
    }
  }

  private populateRoomCorners(room: DungeonRoom, rng: () => number): void {
    const halfW = room.w * CELL_SIZE * 0.5;
    const halfH = room.h * CELL_SIZE * 0.5;
    const cornerCandidates: Array<[number, number, number]> = [
      [room.centerX - halfW + 1.05, room.centerZ + halfH - 1.05, Math.PI * 0.25],
      [room.centerX + halfW - 1.05, room.centerZ + halfH - 1.05, -Math.PI * 0.25],
      [room.centerX - halfW + 1.05, room.centerZ - halfH + 1.05, Math.PI * 0.75],
    ];

    const keys = [
      'barrel_decorated',
      'crates_stacked',
      'rubble_large',
      'column_broken',
    ] as const;

    let count = 0;
    for (const [px, pz, rotY] of cornerCandidates) {
      if (count >= 2) break;
      if (rng() > 0.65) continue;

      // Evita bloquear qualquer abertura de corredor ligado à sala
      let nearCorridor = false;
      for (const cor of this.layout.corridors) {
        if (cor.fromRoomId !== room.id && cor.toRoomId !== room.id) continue;
        const cx = gridToWorldX(cor.gx + cor.w * 0.5, this.layout.originGx);
        const cz = gridToWorldZ(cor.gz + cor.h * 0.5, this.layout.originGz);
        if (Math.hypot(px - cx, pz - cz) < 4.2) {
          nearCorridor = true;
          break;
        }
      }
      if (nearCorridor) continue;

      // Evita encostar nos braseiros ou zonas de interação
      let overlapsFeature = false;
      for (const z of this.interactionZones) {
        if (Math.hypot(px - z.x, pz - z.z) < 2.2) overlapsFeature = true;
      }
      for (const c of this.circleColliders) {
        if (Math.hypot(px - c.x, pz - c.z) < 1.6) overlapsFeature = true;
      }
      if (overlapsFeature) continue;

      const chosen = keys[Math.floor(rng() * keys.length)];
      const isRubble = chosen === 'rubble_large';
      dungeonAssetLibrary.spawnProp(chosen, this.group, {
        x: px,
        y: 0,
        z: pz,
        rotY: rotY + (rng() - 0.5) * 0.4,
        targetHeight: isRubble ? 0.62 : chosen === 'crates_stacked' ? 1.35 : 1.15,
        castShadow: true,
        receiveShadow: true,
        isDisposed: () => this.disposed,
      });

      if (!isRubble) {
        this.circleColliders.push({ x: px, z: pz, radius: 0.52 });
      }
      count++;
    }
  }

  private buildEntranceRoom(
    room: DungeonRoom,
    stoneMat: THREE.Material,
    goldMat: THREE.Material,
  ): void {
    const arrivalRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(1.15, 1.4, 32)),
      this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#6fb4ff',
          transparent: true,
          opacity: 0.48,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    arrivalRing.rotation.x = -Math.PI / 2;
    arrivalRing.position.set(room.centerX, 0.02, room.centerZ);
    this.group.add(arrivalRing);

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

    // Flanqueia o portal de retorno com candelabros altos
    const perpX = Math.cos(facingYaw) * 1.65;
    const perpZ = -Math.sin(facingYaw) * 1.65;
    for (const side of [-1, 1]) {
      const cx = px + perpX * side;
      const cz = pz + perpZ * side;
      dungeonAssetLibrary.spawnProp('candelabrum_tall', this.group, {
        x: cx,
        y: 0,
        z: cz,
        rotY: facingYaw,
        targetHeight: 1.9,
        castShadow: true,
        receiveShadow: true,
        isDisposed: () => this.disposed,
      });
      this.fireSources.push({
        x: cx,
        y: 1.95,
        z: cz,
        phase: side * 0.8,
        baseIntensity: 2.0,
      });
    }

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
    const sepAlongX = Math.abs(dz) >= Math.abs(dx);
    const halfSpan = sepAlongX
      ? Math.min(2.6, room.w * CELL_SIZE * 0.5 - 1.6)
      : Math.min(2.6, room.h * CELL_SIZE * 0.5 - 1.6);

    const riftX = room.centerX + (sepAlongX ? -halfSpan : 0);
    const riftZ = room.centerZ + (sepAlongX ? 0 : -halfSpan);

    const sealX = room.centerX + (sepAlongX ? halfSpan : 0);
    const sealZ = room.centerZ + (sepAlongX ? 0 : halfSpan);

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

    // Arco gótico decorativo atrás da Fenda quando não está no eixo da câmera frontal
    dungeonAssetLibrary.spawnProp('candle_triple', this.group, {
      x: riftX + (sepAlongX ? -1.35 : 0),
      y: 0,
      z: riftZ + (sepAlongX ? 0 : -1.35),
      rotY: 0,
      targetHeight: 0.55,
      castShadow: false,
      receiveShadow: true,
      isDisposed: () => this.disposed,
    });

    this.interactionZones.push({
      x: riftX,
      z: riftZ,
      radiusSq: 2.1 * 2.1,
      label: 'Fenda Abissal — Profundezas Instáveis',
      action: 'next-dungeon-floor',
      actionLabel: `Descer ao Andar ${this.floorNumber + 1}`,
    });

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
      this.trackGeo(new THREE.CylinderGeometry(1.2, 1.42, 0.24, 14)),
      stoneMat,
    );
    base.position.y = 0.12;
    base.receiveShadow = true;
    pedGroup.add(base);

    const trim = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(1.18, 0.045, 8, 24)),
      goldMat,
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.24;
    pedGroup.add(trim);

    this.group.add(pedGroup);
    this.circleColliders.push({ x: room.centerX, z: room.centerZ, radius: 0.8 });

    // Baú dourado KayKit + pilha de moedas + velas triplas CC0
    dungeonAssetLibrary.spawnProp('chest_gold', pedGroup, {
      x: 0,
      y: 0.24,
      z: 0,
      rotY: Math.PI * 0.25,
      targetHeight: 0.92,
      castShadow: true,
      receiveShadow: true,
      isDisposed: () => this.disposed,
      onMissingFallback: () => {
        const fb = new THREE.Mesh(
          this.trackGeo(new THREE.BoxGeometry(0.95, 0.65, 0.65)),
          goldMat,
        );
        fb.position.y = 0.56;
        fb.castShadow = true;
        return fb;
      },
    });

    dungeonAssetLibrary.spawnProp('coin_stack', pedGroup, {
      x: -0.78,
      y: 0.24,
      z: 0.55,
      rotY: 0.5,
      targetHeight: 0.44,
      castShadow: true,
      receiveShadow: true,
      isDisposed: () => this.disposed,
    });

    dungeonAssetLibrary.spawnProp('candle_triple', pedGroup, {
      x: 0.78,
      y: 0.24,
      z: -0.5,
      rotY: -0.4,
      targetHeight: 0.48,
      castShadow: false,
      receiveShadow: true,
      isDisposed: () => this.disposed,
    });

    this.fireSources.push({
      x: room.centerX + 0.78,
      y: 0.8,
      z: room.centerZ - 0.5,
      phase: 2.1,
      baseIntensity: 2.3,
    });
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
          opacity: 0.38,
          side: THREE.DoubleSide,
        }),
      ),
    );
    core.position.set(0, 1.58, 0);
    g.add(core);

    if (withLight) {
      const light = new THREE.PointLight(lightColor, 3.2, 11.5, 1.5);
      light.position.set(0, 1.9, 0.8);
      g.add(light);
    }

    return g;
  }

  private addDecoratedPillar(
    x: number,
    z: number,
    stoneMat: THREE.Material,
    goldMat: THREE.Material,
  ): void {
    dungeonAssetLibrary.spawnProp('pillar_decorated', this.group, {
      x,
      y: 0,
      z,
      rotY: 0,
      targetHeight: 3.35,
      castShadow: true,
      receiveShadow: true,
      isDisposed: () => this.disposed,
      onMissingFallback: () => {
        const g = new THREE.Group();
        const shaft = new THREE.Mesh(
          this.trackGeo(new THREE.CylinderGeometry(0.32, 0.38, 2.8, 10)),
          stoneMat,
        );
        shaft.position.y = 1.4;
        shaft.castShadow = true;
        g.add(shaft);
        const cap = new THREE.Mesh(
          this.trackGeo(new THREE.BoxGeometry(0.9, 0.2, 0.9)),
          goldMat,
        );
        cap.position.y = 2.85;
        g.add(cap);
        return g;
      },
    });
    this.circleColliders.push({ x, z, radius: 0.54 });
  }

  private createFlameMesh(radius: number, height: number, phase: number): THREE.Mesh {
    const flame = new THREE.Mesh(
      this.trackGeo(new THREE.ConeGeometry(radius, height, 6)),
      this.trackMat(
        new THREE.MeshBasicMaterial({
          color: '#ffa54c',
          transparent: true,
          opacity: 0.92,
        }),
      ),
    );
    this.flames.push({
      mesh: flame,
      baseScaleY: 1,
      phase,
    });
    return flame;
  }

  private addBrazier(
    x: number,
    z: number,
    metalMat: THREE.Material,
    phase: number,
  ): void {
    const bGroup = new THREE.Group();
    bGroup.position.set(x, 0, z);

    const bowl = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.36, 0.22, 0.56, 8)),
      metalMat,
    );
    bowl.position.y = 0.28;
    bowl.castShadow = true;
    bGroup.add(bowl);

    const flame = this.createFlameMesh(0.22, 0.62, phase);
    flame.position.y = 0.84;
    bGroup.add(flame);

    this.fireSources.push({
      x,
      y: 1.25,
      z,
      phase,
      baseIntensity: 2.75,
    });

    this.group.add(bGroup);
    this.circleColliders.push({ x, z, radius: 0.38 });
  }

  private buildSubterraneanLightShafts(textures: DungeonTextureSet): void {
    const shaftDir = new THREE.Vector3(-16, -20, 12).normalize();
    const downAxis = new THREE.Vector3(0, -1, 0);

    const shaftTargets = this.layout.rooms.filter(
      (r) => r.kind === 'entrance' || r.kind === 'treasure' || r.kind === 'sanctum',
    );

    const shaftMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: textures.lightShaftMap,
        color: '#88bcff',
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );

    const floorGlowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: '#90c4ff',
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    for (const room of shaftTargets) {
      const originX = room.centerX - shaftDir.x * 8.5;
      const originY = -shaftDir.y * 8.5;
      const originZ = room.centerZ - shaftDir.z * 8.5;

      const beamGroup = new THREE.Group();
      beamGroup.position.set(originX, originY, originZ);
      beamGroup.quaternion.setFromUnitVectors(downAxis, shaftDir);

      const p1 = new THREE.Mesh(
        this.trackGeo(new THREE.PlaneGeometry(3.2, 12.5)),
        shaftMat,
      );
      p1.position.y = -6.25;
      beamGroup.add(p1);

      const p2 = new THREE.Mesh(
        this.trackGeo(new THREE.PlaneGeometry(3.2, 12.5)),
        shaftMat,
      );
      p2.position.y = -6.25;
      p2.rotation.y = Math.PI * 0.5;
      beamGroup.add(p2);

      this.group.add(beamGroup);

      const floorPatch = new THREE.Mesh(
        this.trackGeo(new THREE.CircleGeometry(2.1, 20)),
        floorGlowMat,
      );
      floorPatch.rotation.x = -Math.PI / 2;
      floorPatch.position.set(room.centerX, 0.014, room.centerZ);
      this.group.add(floorPatch);
    }
  }

  private buildEmberParticles(): void {
    const geo = this.trackGeo(new THREE.BufferGeometry());
    this.emberPositions = new Float32Array(this.emberCount * 3);
    this.emberSeeds = new Float32Array(this.emberCount);

    const spanX = this.boundsMaxX - this.boundsMinX + 22;
    const spanZ = this.boundsMaxZ - this.boundsMinZ + 22;

    for (let i = 0; i < this.emberCount; i++) {
      this.emberPositions[i * 3 + 0] = this.boundsMinX - 11 + Math.random() * spanX;
      this.emberPositions[i * 3 + 1] = -4.5 + Math.random() * 9.5;
      this.emberPositions[i * 3 + 2] = this.boundsMinZ - 11 + Math.random() * spanZ;
      this.emberSeeds[i] = Math.random() * Math.PI * 2;
    }

    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.emberPositions, 3),
    );

    const mat = this.trackMat(
      new THREE.PointsMaterial({
        color: '#9ecbff',
        size: 0.1,
        transparent: true,
        opacity: 0.55,
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
    this.keyLight.position.set(playerPos.x + 16, 20, playerPos.z - 12);
    this.keyLight.target.position.copy(playerPos);

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
      const flicker =
        Math.sin(elapsed * 8.5 + f.phase) * 0.14 +
        Math.sin(elapsed * 14.2 + f.phase * 1.7) * 0.07;
      f.mesh.scale.y = f.baseScaleY + flicker;
    }

    // Deriva sutil das camadas de névoa no abismo
    for (let i = 0; i < this.mistLayers.length; i++) {
      const m = this.mistLayers[i];
      m.mesh.position.x = m.baseX + Math.sin(elapsed * 0.22 + i) * 2.5 * m.speedX;
      m.mesh.position.z = m.baseZ + Math.cos(elapsed * 0.18 + i) * 2.5 * m.speedZ;
    }

    // Atualiza o pool de 5 PointLights de fogo posicionando nas 5 fontes mais próximas do jogador
    const poolSize = this.torchLightPool.length;
    if (poolSize > 0 && this.fireSources.length > 0) {
      const bestIdx: number[] = [];
      const bestDistSq: number[] = [];

      for (let i = 0; i < this.fireSources.length; i++) {
        const fs = this.fireSources[i];
        const dx = fs.x - playerPos.x;
        const dz = fs.z - playerPos.z;
        const dSq = dx * dx + dz * dz;

        if (bestIdx.length < poolSize) {
          bestIdx.push(i);
          bestDistSq.push(dSq);
        } else {
          let worstPos = 0;
          for (let k = 1; k < poolSize; k++) {
            if (bestDistSq[k] > bestDistSq[worstPos]) worstPos = k;
          }
          if (dSq < bestDistSq[worstPos]) {
            bestIdx[worstPos] = i;
            bestDistSq[worstPos] = dSq;
          }
        }
      }

      for (let slot = 0; slot < poolSize; slot++) {
        const light = this.torchLightPool[slot];
        if (slot < bestIdx.length) {
          const fs = this.fireSources[bestIdx[slot]];
          const flicker =
            Math.sin(elapsed * 9.0 + fs.phase) * 0.28 +
            Math.sin(elapsed * 15.1 + fs.phase * 1.3) * 0.14;
          light.position.set(fs.x, fs.y, fs.z);
          light.intensity = fs.baseIntensity + flicker;
        } else {
          light.intensity = 0;
        }
      }
    }

    const posAttr = this.emberPoints.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    for (let i = 0; i < this.emberCount; i++) {
      const idx = i * 3;
      const seed = this.emberSeeds[i];
      this.emberPositions[idx + 1] += dt * (0.24 + (i % 3) * 0.06);
      this.emberPositions[idx + 0] += Math.sin(elapsed * 0.9 + seed) * dt * 0.18;
      this.emberPositions[idx + 2] += Math.cos(elapsed * 0.8 + seed) * dt * 0.18;

      if (this.emberPositions[idx + 1] > 5.2) {
        this.emberPositions[idx + 1] = -4.2;
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

    for (const cor of this.layout.corridors) {
      const wx0 = gridToWorldX(cor.gx, this.layout.originGx);
      const wz0 = gridToWorldZ(cor.gz, this.layout.originGz);
      drawIsoRect(wx0, wz0, cor.w * CELL_SIZE, cor.h * CELL_SIZE, '#334668');
    }

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
    for (const tex of this.ownedClonedTextures) {
      tex.dispose();
    }
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
    this.ownedClonedTextures.length = 0;
  }
}

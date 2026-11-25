import * as THREE from 'three';

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

export interface ProceduralTextureSet {
  stoneFloorMap: THREE.CanvasTexture;
  stoneFloorBump: THREE.CanvasTexture;
  wallStoneMap: THREE.CanvasTexture;
  runeDecalMap: THREE.CanvasTexture;
}

export function createProceduralTextures(maxAnisotropy = 4): ProceduralTextureSet {
  const { colorMap: stoneFloorMap, bumpMap: stoneFloorBump } =
    createStoneFloorTextures(maxAnisotropy);
  const wallStoneMap = createWallStoneTexture(maxAnisotropy);
  const runeDecalMap = createRuneDecalTexture(maxAnisotropy);

  return {
    stoneFloorMap,
    stoneFloorBump,
    wallStoneMap,
    runeDecalMap,
  };
}

function createStoneFloorTextures(maxAnisotropy: number): {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;

  const rng = mulberry32(4201);

  // Fundo das juntas escuras
  ctx.fillStyle = '#0e1015';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#181818';
  bctx.fillRect(0, 0, size, size);

  const rows = 6;
  const rowH = size / rows;

  for (let r = 0; r < rows; r++) {
    const cols = r % 2 === 0 ? 4 : 5;
    const baseW = size / cols;
    const offset = r % 2 === 0 ? 0 : -baseW * 0.35;

    for (let c = -1; c <= cols; c++) {
      const x = c * baseW + offset + 3;
      const y = r * rowH + 3;
      const w = baseW - 6;
      const h = rowH - 6;

      const shade = 30 + Math.floor(rng() * 18);
      const blueShift = 4 + Math.floor(rng() * 8);
      ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + blueShift})`;
      ctx.fillRect(x, y, w, h);

      const bumpShade = 128 + Math.floor(rng() * 56);
      bctx.fillStyle = `rgb(${bumpShade}, ${bumpShade}, ${bumpShade})`;
      bctx.fillRect(x, y, w, h);

      // Borda superior levemente iluminada (chanfro sutil)
      ctx.fillStyle = 'rgba(130, 142, 166, 0.08)';
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(x, y + h - 3, w, 3);

      // Rachaduras sutis em algumas lajes
      if (rng() > 0.45) {
        ctx.strokeStyle = 'rgba(8, 10, 14, 0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        let cx = x + w * (0.2 + rng() * 0.6);
        let cy = y + h * (0.15 + rng() * 0.3);
        ctx.moveTo(cx, cy);
        const segs = 2 + Math.floor(rng() * 3);
        for (let s = 0; s < segs; s++) {
          cx += (rng() - 0.5) * 28;
          cy += 8 + rng() * 18;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }

      // Manchas de musgo sombrio nas frestas
      if (rng() > 0.58) {
        const mx = x + rng() * w;
        const my = y + (rng() > 0.5 ? 2 : h - 4);
        const grad = ctx.createRadialGradient(mx, my, 2, mx, my, 18 + rng() * 16);
        grad.addColorStop(0, 'rgba(34, 48, 34, 0.36)');
        grad.addColorStop(1, 'rgba(34, 48, 34, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(mx - 36, my - 36, 72, 72);
      }
    }
  }

  // Ruído fino de grão de pedra
  for (let i = 0; i < 4500; i++) {
    const px = rng() * size;
    const py = rng() * size;
    const bright = rng() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
    ctx.fillStyle = bright;
    ctx.fillRect(px, py, 2, 2);
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(9, 9);
  colorMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(9, 9);
  bumpMap.anisotropy = maxAnisotropy;

  return { colorMap, bumpMap };
}

function createWallStoneTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = mulberry32(9113);

  ctx.fillStyle = '#13161d';
  ctx.fillRect(0, 0, size, size);

  const rows = 5;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 3;
    const blockW = size / cols;
    const shift = (r % 2) * (blockW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * blockW + shift + 2;
      const y = r * rowH + 2;
      const shade = 38 + Math.floor(rng() * 18);
      ctx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 9})`;
      ctx.fillRect(x, y, blockW - 4, rowH - 4);
      ctx.fillStyle = 'rgba(200, 210, 230, 0.06)';
      ctx.fillRect(x, y, blockW - 4, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createRuneDecalTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Halo suave central
  const glow = ctx.createRadialGradient(cx, cy, 40, cx, cy, 240);
  glow.addColorStop(0, 'rgba(214, 156, 78, 0.16)');
  glow.addColorStop(0.6, 'rgba(214, 156, 78, 0.08)');
  glow.addColorStop(1, 'rgba(214, 156, 78, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(214, 173, 102, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 210, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(214, 173, 102, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 182, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 118, 0, Math.PI * 2);
  ctx.stroke();

  // Marcas geométricas rúnicas ao redor do anel
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 12; i++) {
    ctx.rotate((Math.PI * 2) / 12);
    ctx.strokeStyle = 'rgba(232, 188, 115, 0.52)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -188);
    ctx.lineTo(0, -204);
    ctx.moveTo(-8, -196);
    ctx.lineTo(8, -196);
    ctx.stroke();
  }

  // Estrela de 4 pontas no centro
  ctx.strokeStyle = 'rgba(232, 188, 115, 0.42)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -110);
    ctx.lineTo(14, -14);
    ctx.lineTo(0, 0);
    ctx.stroke();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

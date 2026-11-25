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

export interface HallTextureSet {
  ceramicFloorMap: THREE.CanvasTexture;
  ceramicFloorBump: THREE.CanvasTexture;
  marbleWallMap: THREE.CanvasTexture;
  stainedGlassMap: THREE.CanvasTexture;
  sunbeamGradientMap: THREE.CanvasTexture;
  gardenGrassMap: THREE.CanvasTexture;
}

export function createHallTextures(
  hallRadius: number,
  doorAnglesRad: readonly number[],
  maxAnisotropy = 4,
): HallTextureSet {
  const { colorMap: ceramicFloorMap, bumpMap: ceramicFloorBump } =
    createCeramicFloorTextures(hallRadius, doorAnglesRad, maxAnisotropy);
  const marbleWallMap = createMarbleWallTexture(maxAnisotropy);
  const stainedGlassMap = createStainedGlassTexture(maxAnisotropy);
  const sunbeamGradientMap = createSunbeamGradientTexture();
  const gardenGrassMap = createGardenGrassTexture(maxAnisotropy);

  return {
    ceramicFloorMap,
    ceramicFloorBump,
    marbleWallMap,
    stainedGlassMap,
    sunbeamGradientMap,
    gardenGrassMap,
  };
}

function hallPolarToCanvas(
  alpha: number,
  worldR: number,
  hallRadius: number,
  cx: number,
  cy: number,
  halfSize: number,
): { x: number; y: number } {
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  const wx = worldR * (-c * Math.SQRT1_2 + s * Math.SQRT1_2);
  const wz = worldR * (-c * Math.SQRT1_2 - s * Math.SQRT1_2);
  return {
    x: cx + (wx / hallRadius) * halfSize,
    y: cy + (wz / hallRadius) * halfSize,
  };
}

function createCeramicFloorTextures(
  hallRadius: number,
  doorAnglesRad: readonly number[],
  maxAnisotropy: number,
): {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 2048;
  const half = size / 2;
  const cx = half;
  const cy = half;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpSize = 1024;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = bumpSize;
  bumpCanvas.height = bumpSize;
  const bctx = bumpCanvas.getContext('2d')!;

  const rng = mulberry32(7721);

  // Base em cerâmica branco-marfim polida
  ctx.fillStyle = '#ece6da';
  ctx.fillRect(0, 0, size, size);

  bctx.fillStyle = '#dcdcdc';
  bctx.fillRect(0, 0, bumpSize, bumpSize);

  // Grade polida de ladrilhos quadrados de cerâmica clara
  const tilesPerSide = 24;
  const tilePx = size / tilesPerSide;
  const bumpTilePx = bumpSize / tilesPerSide;

  for (let row = 0; row < tilesPerSide; row++) {
    for (let col = 0; col < tilesPerSide; col++) {
      const x = col * tilePx;
      const y = row * tilePx;
      const tone = Math.floor(rng() * 10);
      const r = 234 + tone - 3;
      const g = 229 + tone - 3;
      const b = 219 + tone - 2;
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x + 2, y + 2, tilePx - 4, tilePx - 4);

      // Brilho chanfrado sutil em cada peça cerâmica
      ctx.fillStyle = 'rgba(255, 253, 248, 0.45)';
      ctx.fillRect(x + 2, y + 2, tilePx - 4, 2);
      ctx.fillRect(x + 2, y + 2, 2, tilePx - 4);

      // Rejunte suave entre peças
      ctx.strokeStyle = 'rgba(182, 172, 152, 0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, tilePx - 2, tilePx - 2);

      // Veios sutis de mármore em alguns ladrilhos
      if (rng() > 0.55) {
        ctx.strokeStyle = 'rgba(195, 188, 174, 0.28)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const vx = x + rng() * tilePx;
        const vy = y + rng() * tilePx * 0.4;
        ctx.moveTo(vx, vy);
        ctx.quadraticCurveTo(
          x + tilePx * (0.3 + rng() * 0.4),
          y + tilePx * 0.5,
          x + rng() * tilePx,
          y + tilePx * (0.65 + rng() * 0.35),
        );
        ctx.stroke();
      }

      // Bump correspondente aos rejuntes
      const bx = col * bumpTilePx;
      const by = row * bumpTilePx;
      bctx.strokeStyle = '#929292';
      bctx.lineWidth = 2;
      bctx.strokeRect(bx + 1, by + 1, bumpTilePx - 2, bumpTilePx - 2);
    }
  }

  // Anel ornamental externo azul-real e dourado perto das colunas
  const outerRingR = (15.0 / hallRadius) * half;
  const innerTrackR = (13.3 / hallRadius) * half;

  ctx.strokeStyle = '#cfa246';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, outerRingR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#1f4488';
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.arc(cx, cy, (outerRingR + innerTrackR) * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#d8b058';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, innerTrackR, 0, Math.PI * 2);
  ctx.stroke();

  // Motivos geométricos dourados dentro da faixa azul externa
  const ringMidR = (outerRingR + innerTrackR) * 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  const segCount = 48;
  for (let i = 0; i < segCount; i++) {
    ctx.rotate((Math.PI * 2) / segCount);
    ctx.strokeStyle = 'rgba(232, 195, 110, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -ringMidR + 12);
    ctx.lineTo(10, -ringMidR);
    ctx.lineTo(0, -ringMidR - 12);
    ctx.lineTo(-10, -ringMidR);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();

  // Passadeiras / caminhos ornamentais radiais alinhados às 3 portas
  for (const alpha of doorAnglesRad) {
    const start = hallPolarToCanvas(alpha, 5.2, hallRadius, cx, cy, half);
    const end = hallPolarToCanvas(alpha, 16.5, hallRadius, cx, cy, half);

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(start.x, start.y);
    ctx.rotate(angle);

    // Moldura clara + faixa azul-real + borda dourada
    ctx.fillStyle = '#efe9dc';
    ctx.fillRect(0, -48, len, 96);

    ctx.fillStyle = '#1f4488';
    ctx.fillRect(0, -34, len, 68);

    ctx.strokeStyle = '#d6aa4c';
    ctx.lineWidth = 6;
    ctx.strokeRect(2, -36, len - 4, 72);

    // Linha de losangos dourados no centro do caminho
    ctx.fillStyle = '#e5be68';
    for (let d = 28; d < len - 24; d += 44) {
      ctx.beginPath();
      ctx.moveTo(d, -10);
      ctx.lineTo(d + 12, 0);
      ctx.lineTo(d, 10);
      ctx.lineTo(d - 12, 0);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  // Grande Rosácea / Brasão Arcano Central (estilo Rei Mago / Salão Real)
  const centerOuterR = (5.4 / hallRadius) * half;
  const centerMidR = (4.1 / hallRadius) * half;
  const centerInnerR = (2.3 / hallRadius) * half;

  // Disco base de mármore branco puro da rosácea
  ctx.fillStyle = '#f3efe6';
  ctx.beginPath();
  ctx.arc(cx, cy, centerOuterR, 0, Math.PI * 2);
  ctx.fill();

  // Halo azul-celeste sutil no centro
  const centerGlow = ctx.createRadialGradient(
    cx,
    cy,
    centerInnerR * 0.2,
    cx,
    cy,
    centerOuterR,
  );
  centerGlow.addColorStop(0, 'rgba(93, 147, 230, 0.22)');
  centerGlow.addColorStop(0.55, 'rgba(36, 80, 158, 0.12)');
  centerGlow.addColorStop(1, 'rgba(36, 80, 158, 0)');
  ctx.fillStyle = centerGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, centerOuterR, 0, Math.PI * 2);
  ctx.fill();

  // Anéis concêntricos dourados e azul-safira
  ctx.strokeStyle = '#cfa246';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, centerOuterR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#24509e';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(cx, cy, centerMidR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#e0b861';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, centerMidR - 14, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#cfa246';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, centerInnerR, 0, Math.PI * 2);
  ctx.stroke();

  // Estrela real de 8 pontas + emblema ornamental de 4 folhas no núcleo
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = i % 2 === 0 ? '#24509e' : '#5d93e6';
    ctx.beginPath();
    ctx.moveTo(0, -centerMidR + 18);
    ctx.lineTo(20, -centerInnerR * 0.52);
    ctx.lineTo(0, 0);
    ctx.lineTo(-20, -centerInnerR * 0.52);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#e5be68';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Pétalas reais douradas no núcleo
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#d6aa4c';
    ctx.beginPath();
    ctx.arc(0, -centerInnerR * 0.36, centerInnerR * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#f5f0e6';
  ctx.beginPath();
  ctx.arc(0, 0, centerInnerR * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#24509e';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  const colorMap = new THREE.CanvasTexture(canvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;

  return { colorMap, bumpMap };
}

function createMarbleWallTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = mulberry32(3199);

  ctx.fillStyle = '#ddd6c7';
  ctx.fillRect(0, 0, size, size);

  const rows = 4;
  const rowH = size / rows;

  for (let r = 0; r < rows; r++) {
    const cols = 3;
    const blockW = size / cols;
    const shift = (r % 2) * (blockW * 0.5);

    for (let c = -1; c <= cols; c++) {
      const x = c * blockW + shift + 2;
      const y = r * rowH + 2;
      const w = blockW - 4;
      const h = rowH - 4;

      const base = 227 + Math.floor(rng() * 12);
      ctx.fillStyle = `rgb(${base}, ${base - 4}, ${base - 11})`;
      ctx.fillRect(x, y, w, h);

      // Veios sutis de mármore
      ctx.strokeStyle = 'rgba(182, 174, 160, 0.32)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + rng() * w * 0.4, y + 6);
      ctx.bezierCurveTo(
        x + w * 0.4,
        y + h * 0.35,
        x + w * 0.65,
        y + h * 0.65,
        x + w * (0.4 + rng() * 0.5),
        y + h - 6,
      );
      ctx.stroke();

      // Chanfro claro no topo do bloco
      ctx.fillStyle = 'rgba(255, 253, 247, 0.42)';
      ctx.fillRect(x, y, w, 2);
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

function createStainedGlassTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Fundo luminoso banhado de sol
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#fff9e6');
  bg.addColorStop(0.35, '#e8f3ff');
  bg.addColorStop(0.75, '#d7ecff');
  bg.addColorStop(1, '#fff2d2');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Molduras diagonais (losangos de vidro chumbado dourado)
  ctx.strokeStyle = 'rgba(196, 152, 68, 0.72)';
  ctx.lineWidth = 3;
  const step = 42;
  for (let y = -h; y < h * 2; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + w);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w, y);
    ctx.lineTo(0, y + w);
    ctx.stroke();
  }

  // Faixa lateral azul-celeste elegante
  ctx.fillStyle = 'rgba(92, 152, 240, 0.36)';
  ctx.fillRect(10, 10, 22, h - 20);
  ctx.fillRect(w - 32, 10, 22, h - 20);

  // Medalhão solar/arcano superior
  const medalY = h * 0.24;
  ctx.fillStyle = 'rgba(255, 226, 145, 0.78)';
  ctx.beginPath();
  ctx.arc(w / 2, medalY, 52, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#c9973b';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(w / 2, medalY, 52, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#4a84df';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(w / 2, medalY, 34, 0, Math.PI * 2);
  ctx.stroke();

  // Moldura vertical central
  ctx.strokeStyle = '#b98834';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSunbeamGradientTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const img = ctx.createImageData(w, h);
  const data = img.data;

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1); // 0 = topo (perto da janela), 1 = base (chão)
    const verticalFade = Math.sin(Math.min(1, v * 1.05) * Math.PI) * (1 - v * 0.52);

    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1; // -1..1
      const horizontalFade = Math.pow(Math.max(0, 1 - u * u), 1.6);
      const streak = 0.85 + 0.15 * Math.sin(u * 14);
      const alpha = Math.max(0, Math.min(1, verticalFade * horizontalFade * streak));

      const idx = (y * w + x) * 4;
      data[idx + 0] = 255;
      data[idx + 1] = 240;
      data[idx + 2] = 196;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGardenGrassTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = mulberry32(5589);

  // Base de gramado ensolarado claro
  const baseGrad = ctx.createRadialGradient(half, half, 90, half, half, half);
  baseGrad.addColorStop(0, '#69b153');
  baseGrad.addColorStop(0.5, '#5ca348');
  baseGrad.addColorStop(1, '#4c8e3d');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  // Manchas suaves de luz e variação orgânica da grama
  for (let i = 0; i < 420; i++) {
    const px = rng() * size;
    const py = rng() * size;
    const r = 16 + rng() * 44;
    const warm = rng() > 0.45;
    const grad = ctx.createRadialGradient(px, py, 2, px, py, r);
    grad.addColorStop(
      0,
      warm ? 'rgba(138, 204, 96, 0.22)' : 'rgba(54, 114, 48, 0.18)',
    );
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Caminhos circulares e radiais de pedra clara no jardim (mundo raio ~98m)
  const gardenWorldRadius = 98;
  const pathInnerR = (28.5 / gardenWorldRadius) * half;
  const pathOuterR = (41.0 / gardenWorldRadius) * half;

  ctx.strokeStyle = '#dfd8c7';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(half, half, pathInnerR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#d5ccb8';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(half, half, pathOuterR, 0, Math.PI * 2);
  ctx.stroke();

  // Três passadeiras radiais conectando os anéis do jardim
  ctx.save();
  ctx.translate(half, half);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.fillStyle = '#ddd6c5';
    ctx.fillRect(-7, pathInnerR - 4, 14, pathOuterR - pathInnerR + 8);
  }
  ctx.restore();

  // Pontinhos suaves de flores brancas/douradas espalhadas pelo gramado
  for (let i = 0; i < 950; i++) {
    const px = rng() * size;
    const py = rng() * size;
    const dist = Math.hypot(px - half, py - half);
    if (dist < (23 / gardenWorldRadius) * half) continue;
    ctx.fillStyle =
      rng() > 0.35 ? 'rgba(255, 248, 224, 0.65)' : 'rgba(255, 215, 115, 0.65)';
    ctx.fillRect(px, py, 2.2, 2.2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

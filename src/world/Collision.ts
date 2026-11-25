export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
}

export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function resolveCollisions(
  pos: { x: number; z: number },
  playerRadius: number,
  circles: readonly CircleCollider[],
  boxes: readonly BoxCollider[],
  boundsRadius: number,
): void {
  const iterations = 3;
  const maxR = Math.max(0.5, boundsRadius - playerRadius);
  const maxRSq = maxR * maxR;

  for (let iter = 0; iter < iterations; iter++) {
    // Limite circular suave da rotunda
    const radialDistSq = pos.x * pos.x + pos.z * pos.z;
    if (radialDistSq > maxRSq) {
      const radialDist = Math.sqrt(radialDistSq);
      const scale = maxR / radialDist;
      pos.x *= scale;
      pos.z *= scale;
    }

    // Colisão círculo vs caixa (AABB) com deslizamento suave
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      const closestX = Math.max(box.minX, Math.min(pos.x, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));

      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < playerRadius * playerRadius) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const overlap = playerRadius - dist;
          pos.x += (dx / dist) * overlap;
          pos.z += (dz / dist) * overlap;
        } else {
          const penLeft = Math.abs(pos.x - box.minX);
          const penRight = Math.abs(box.maxX - pos.x);
          const penTop = Math.abs(pos.z - box.minZ);
          const penBottom = Math.abs(box.maxZ - pos.z);
          const minPen = Math.min(penLeft, penRight, penTop, penBottom);

          if (minPen === penLeft) pos.x = box.minX - playerRadius;
          else if (minPen === penRight) pos.x = box.maxX + playerRadius;
          else if (minPen === penTop) pos.z = box.minZ - playerRadius;
          else pos.z = box.maxZ + playerRadius;
        }
      }
    }

    // Colisão círculo vs círculo (colunas, bigorna, baú, etc.)
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const minDist = playerRadius + c.radius;
      const distSq = dx * dx + dz * dz;

      if (distSq < minDist * minDist) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          pos.x += (dx / dist) * overlap;
          pos.z += (dz / dist) * overlap;
        } else {
          pos.x += minDist;
        }
      }
    }
  }
}

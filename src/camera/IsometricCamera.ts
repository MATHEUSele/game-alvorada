import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class IsometricCamera {
  public readonly camera: THREE.PerspectiveCamera;

  private readonly baseOffset = new THREE.Vector3(10.5, 13.0, 10.5);
  private readonly lookAtOffset = new THREE.Vector3(0, 1.1, 0);
  private readonly currentTarget = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly forwardXZ = new THREE.Vector3();
  private readonly rightXZ = new THREE.Vector3();

  private zoomCurrent = 1.0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(36, aspect, 0.2, 360);
    this.camera.position.copy(this.baseOffset);
    this.camera.lookAt(this.lookAtOffset);
  }

  public snapTo(targetPos: THREE.Vector3): void {
    this.currentTarget.copy(targetPos).add(this.lookAtOffset);
    this.camera.position
      .copy(targetPos)
      .addScaledVector(this.baseOffset, this.zoomCurrent);
    this.camera.lookAt(this.currentTarget);
  }

  public update(
    targetPos: THREE.Vector3,
    zoomTarget: number,
    dt: number,
  ): void {
    const zoomAlpha = 1 - Math.exp(-10 * dt);
    this.zoomCurrent += (zoomTarget - this.zoomCurrent) * zoomAlpha;

    const followAlpha = 1 - Math.exp(-9 * dt);
    const desiredTargetX = targetPos.x + this.lookAtOffset.x;
    const desiredTargetY = targetPos.y + this.lookAtOffset.y;
    const desiredTargetZ = targetPos.z + this.lookAtOffset.z;

    this.currentTarget.x += (desiredTargetX - this.currentTarget.x) * followAlpha;
    this.currentTarget.y += (desiredTargetY - this.currentTarget.y) * followAlpha;
    this.currentTarget.z += (desiredTargetZ - this.currentTarget.z) * followAlpha;

    this.desiredPosition
      .copy(targetPos)
      .addScaledVector(this.baseOffset, this.zoomCurrent);

    this.camera.position.lerp(this.desiredPosition, followAlpha);
    this.camera.lookAt(this.currentTarget);
  }

  /**
   * Converte o vetor 2D em espaço de tela (X = direita, Y = cima)
   * para um vetor normalizado no plano XZ alinhado à câmera isométrica.
   */
  public screenInputToWorld(
    inputX: number,
    inputY: number,
    outVec3: THREE.Vector3,
  ): THREE.Vector3 {
    const mag = Math.min(1, Math.hypot(inputX, inputY));
    if (mag <= 1e-6) {
      return outVec3.set(0, 0, 0);
    }

    this.camera.getWorldDirection(this.forwardXZ);
    this.forwardXZ.y = 0;
    this.forwardXZ.normalize();

    this.rightXZ.crossVectors(this.forwardXZ, WORLD_UP).normalize();

    outVec3
      .set(0, 0, 0)
      .addScaledVector(this.rightXZ, inputX)
      .addScaledVector(this.forwardXZ, inputY);

    if (outVec3.lengthSq() > 1e-6) {
      outVec3.normalize().multiplyScalar(mag);
    }

    return outVec3;
  }

  public resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

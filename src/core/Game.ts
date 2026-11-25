import * as THREE from 'three';
import { IsometricCamera } from '../camera/IsometricCamera';
import { Player } from '../entities/Player';
import { resolveCollisions } from '../world/Collision';
import { HubMap } from '../world/HubMap';
import { Input } from './Input';

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly isoCamera: IsometricCamera;
  private readonly input: Input;
  private readonly hubMap: HubMap;
  private readonly player: Player;

  private readonly analogKnob: HTMLElement | null;
  private readonly moveStateEl: HTMLElement | null;
  private readonly dungeonPromptEl: HTMLElement | null;
  private readonly dungeonPromptTextEl: HTMLElement | null;

  private readonly moveWorldVec = new THREE.Vector3();
  private lastTime = performance.now();
  private elapsed = 0;
  private rafId = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#cde0f5');
    this.scene.fog = new THREE.FogExp2('#d7e6f5', 0.0045);

    this.isoCamera = new IsometricCamera(
      window.innerWidth / Math.max(1, window.innerHeight),
    );
    this.input = new Input(window);

    const maxAnisotropy = Math.min(
      8,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.hubMap = new HubMap(maxAnisotropy);
    this.scene.add(this.hubMap.group);

    this.player = new Player();
    this.scene.add(this.player.group);

    this.isoCamera.snapTo(this.player.group.position);

    this.analogKnob = document.getElementById('analog-knob');
    this.moveStateEl = document.getElementById('move-state');
    this.dungeonPromptEl = document.getElementById('dungeon-prompt');
    this.dungeonPromptTextEl = document.getElementById('dungeon-prompt-text');

    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h);
    this.isoCamera.resize(w / h);
  };

  public start(): void {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private loop = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.elapsed += dt;

    const moveInput = this.input.getMoveInput();
    this.isoCamera.screenInputToWorld(
      moveInput.x,
      moveInput.y,
      this.moveWorldVec,
    );

    this.player.update(this.moveWorldVec, moveInput.sprint, dt, this.elapsed);

    // Resolve colisões no plano XZ com limite circular e deslizamento suave
    const pos = {
      x: this.player.group.position.x,
      z: this.player.group.position.z,
    };
    resolveCollisions(
      pos,
      this.player.radius,
      this.hubMap.circleColliders,
      this.hubMap.boxColliders,
      this.hubMap.boundsRadius,
    );
    this.player.group.position.x = pos.x;
    this.player.group.position.z = pos.z;

    this.isoCamera.update(
      this.player.group.position,
      this.input.getZoomTarget(),
      dt,
    );
    this.hubMap.update(dt, this.elapsed, this.player.group.position);

    this.updateHud(moveInput.x, moveInput.y);

    this.renderer.render(this.scene, this.isoCamera.camera);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private updateHud(inputX: number, inputY: number): void {
    if (this.analogKnob) {
      const radiusPx = 13;
      const offsetX = inputX * radiusPx;
      const offsetY = -inputY * radiusPx;
      this.analogKnob.style.transform = `translate(calc(-50% + ${offsetX.toFixed(1)}px), calc(-50% + ${offsetY.toFixed(1)}px))`;
    }

    if (this.moveStateEl) {
      if (this.player.isRunning()) {
        this.moveStateEl.textContent = 'Correndo';
      } else if (this.player.isMoving()) {
        this.moveStateEl.textContent = 'Andando';
      } else {
        this.moveStateEl.textContent = 'Parado';
      }
    }

    if (this.dungeonPromptEl) {
      const promptText = this.hubMap.getNearbyInteractionPrompt(
        this.player.group.position,
      );
      if (promptText && this.dungeonPromptTextEl) {
        this.dungeonPromptTextEl.textContent = promptText;
      }
      this.dungeonPromptEl.classList.toggle('visible', promptText !== null);
    }
  }

  public dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.input.dispose(window);
    this.renderer.dispose();
  }
}

import * as THREE from 'three';
import { IsometricCamera } from '../camera/IsometricCamera';
import { Player, type SwordSkillSlot } from '../entities/Player';
import {
  resolveCollisions,
  type InteractionPrompt,
} from '../world/Collision';
import { DungeonMap } from '../world/DungeonMap';
import { dungeonAssetLibrary } from '../world/DungeonAssets';
import { HubMap } from '../world/HubMap';
import {
  createDungeonTextures,
  type DungeonTextureSet,
} from '../world/ProceduralTextures';
import { Input } from './Input';
import { initMobileUi } from './MobileUi';

interface SkillButtonRefs {
  slot: SwordSkillSlot;
  root: HTMLElement;
  overlay: HTMLElement | null;
  timerText: HTMLElement | null;
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly sceneFog: THREE.FogExp2;
  private readonly isoCamera: IsometricCamera;
  private readonly input: Input;
  private readonly hubMap: HubMap;
  private readonly player: Player;
  private readonly cleanupMobileUi: () => void;
  private readonly maxAnisotropy: number;

  private readonly hubBgColor = new THREE.Color('#cde0f5');
  private readonly hubFogColor = new THREE.Color('#d7e6f5');
  private readonly dungeonBgColor = new THREE.Color('#070b14');
  private readonly dungeonFogColor = new THREE.Color('#0b1222');

  private dungeonTextures: DungeonTextureSet | null = null;
  private dungeonMap: DungeonMap | null = null;
  private activeLocation: 'hub' | 'dungeon' = 'hub';
  private currentFloor = 0;
  private isTransitioning = false;
  private readonly transitionTimers: number[] = [];

  private readonly analogKnob: HTMLElement | null;
  private readonly moveStateEl: HTMLElement | null;
  private readonly areaTitleEl: HTMLElement | null;
  private readonly areaSubtitleEl: HTMLElement | null;
  private readonly screenFadeEl: HTMLElement | null;
  private readonly minimapCanvas: HTMLCanvasElement | null;
  private readonly minimapCtx: CanvasRenderingContext2D | null;
  private readonly returnHubBtn: HTMLElement | null;
  private readonly dungeonPromptEl: HTMLElement | null;
  private readonly dungeonPromptTextEl: HTMLElement | null;
  private readonly dungeonActionBtn: HTMLElement | null;
  private readonly dungeonActionLabelEl: HTMLElement | null;
  private readonly skillButtonRefs: SkillButtonRefs[] = [];

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
    const isTouchDevice =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2),
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = this.hubBgColor.clone();
    this.sceneFog = new THREE.FogExp2(this.hubFogColor.getHex(), 0.0045);
    this.scene.fog = this.sceneFog;

    this.isoCamera = new IsometricCamera(
      window.innerWidth / Math.max(1, window.innerHeight),
    );
    this.input = new Input(window);

    this.maxAnisotropy = Math.min(
      8,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.hubMap = new HubMap(this.maxAnisotropy);
    this.scene.add(this.hubMap.group);

    this.player = new Player();
    this.scene.add(this.player.group);

    this.isoCamera.snapTo(this.player.group.position);

    this.analogKnob = document.getElementById('analog-knob');
    this.moveStateEl = document.getElementById('move-state');
    this.areaTitleEl = document.getElementById('area-title');
    this.areaSubtitleEl = document.getElementById('area-subtitle');
    this.screenFadeEl = document.getElementById('screen-fade');
    this.minimapCanvas = document.getElementById(
      'dungeon-minimap',
    ) as HTMLCanvasElement | null;
    this.minimapCtx = this.minimapCanvas?.getContext('2d') ?? null;
    this.returnHubBtn = document.getElementById('hud-return-hub-btn');
    this.dungeonPromptEl = document.getElementById('dungeon-prompt');
    this.dungeonPromptTextEl = document.getElementById('dungeon-prompt-text');
    this.dungeonActionBtn = document.getElementById('dungeon-action-btn');
    this.dungeonActionLabelEl = document.getElementById('dungeon-action-label');
    this.cleanupMobileUi = initMobileUi();

    this.returnHubBtn?.addEventListener('click', this.onReturnHubClick);

    document
      .querySelectorAll<HTMLElement>('[data-skill-slot]')
      .forEach((root) => {
        const slot = root.dataset.skillSlot as SwordSkillSlot | undefined;
        if (!slot) return;
        this.skillButtonRefs.push({
          slot,
          root,
          overlay: root.querySelector<HTMLElement>('.skill-cd-fill'),
          timerText: root.querySelector<HTMLElement>('.skill-cd-text'),
        });
      });

    window.addEventListener('resize', this.onResize);
  }

  private onReturnHubClick = (): void => {
    if (this.activeLocation === 'dungeon' && !this.isTransitioning) {
      this.transitionToHub();
    }
  };

  private runWithFade(swapScene: () => void): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this.screenFadeEl?.classList.add('active');

    const t1 = window.setTimeout(() => {
      swapScene();
      const t2 = window.setTimeout(() => {
        this.screenFadeEl?.classList.remove('active');
        this.isTransitioning = false;
      }, 150);
      this.transitionTimers.push(t2);
    }, 180);
    this.transitionTimers.push(t1);
  }

  private transitionToDungeon(floorNumber: number): void {
    this.runWithFade(() => {
      if (!this.dungeonTextures) {
        this.dungeonTextures = createDungeonTextures(this.maxAnisotropy);
      }

      if (this.dungeonMap) {
        this.scene.remove(this.dungeonMap.group);
        this.dungeonMap.dispose();
        this.dungeonMap = null;
      } else {
        this.scene.remove(this.hubMap.group);
      }

      const nextMap = new DungeonMap(this.dungeonTextures, floorNumber);
      this.dungeonMap = nextMap;
      this.activeLocation = 'dungeon';
      this.currentFloor = floorNumber;

      this.scene.add(nextMap.group);
      (this.scene.background as THREE.Color).copy(this.dungeonBgColor);
      this.sceneFog.color.copy(this.dungeonFogColor);
      this.sceneFog.density = 0.0078;
      this.renderer.toneMappingExposure = 1.18;

      document.body.classList.add('in-dungeon');
      this.minimapCanvas?.classList.remove('hidden');
      this.returnHubBtn?.classList.remove('hidden');

      if (this.areaTitleEl) {
        this.areaTitleEl.textContent = `Catacumbas Cinzentas — Andar ${floorNumber}`;
      }
      if (this.areaSubtitleEl) {
        this.areaSubtitleEl.textContent = `Masmorra Randômica • ${nextMap.roomCount} Salas • Semente #${nextMap.seedCode}`;
      }

      this.player.teleportTo(
        nextMap.spawnPosition.x,
        nextMap.spawnPosition.z,
        nextMap.spawnYaw,
      );
      this.isoCamera.snapTo(this.player.group.position);
      this.dungeonPromptEl?.classList.remove('visible', 'is-actionable');
    });
  }

  private transitionToHub(): void {
    this.runWithFade(() => {
      if (this.dungeonMap) {
        this.scene.remove(this.dungeonMap.group);
        this.dungeonMap.dispose();
        this.dungeonMap = null;
      }

      this.activeLocation = 'hub';
      this.currentFloor = 0;

      if (!this.hubMap.group.parent) {
        this.scene.add(this.hubMap.group);
      }

      (this.scene.background as THREE.Color).copy(this.hubBgColor);
      this.sceneFog.color.copy(this.hubFogColor);
      this.sceneFog.density = 0.0045;
      this.renderer.toneMappingExposure = 1.05;

      document.body.classList.remove('in-dungeon');
      this.minimapCanvas?.classList.add('hidden');
      this.returnHubBtn?.classList.add('hidden');

      if (this.areaTitleEl) {
        this.areaTitleEl.textContent = 'Salão Real da Alvorada';
      }
      if (this.areaSubtitleEl) {
        this.areaSubtitleEl.textContent = 'Home • Cidadela Central';
      }

      const ret = this.hubMap.getDungeonReturnSpawn();
      this.player.teleportTo(ret.x, ret.z, ret.yaw);
      this.isoCamera.snapTo(this.player.group.position);
      this.dungeonPromptEl?.classList.remove('visible', 'is-actionable');
    });
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

    const activeMap =
      this.activeLocation === 'dungeon' && this.dungeonMap
        ? this.dungeonMap
        : this.hubMap;

    const moveInput = this.input.getMoveInput();
    if (!this.isTransitioning) {
      this.isoCamera.screenInputToWorld(
        moveInput.x,
        moveInput.y,
        this.moveWorldVec,
      );

      const triggeredSkills = this.input.consumeTriggeredSkills();
      for (const slot of triggeredSkills) {
        this.player.useSkill(slot, this.moveWorldVec);
      }

      this.player.update(this.moveWorldVec, moveInput.sprint, dt, this.elapsed);

      const pos = {
        x: this.player.group.position.x,
        z: this.player.group.position.z,
      };
      resolveCollisions(
        pos,
        this.player.radius,
        activeMap.circleColliders,
        activeMap.boxColliders,
        activeMap.boundsRadius,
      );
      this.player.group.position.x = pos.x;
      this.player.group.position.z = pos.z;
    }

    this.isoCamera.update(
      this.player.group.position,
      this.input.getZoomTarget(),
      dt,
    );
    activeMap.update(dt, this.elapsed, this.player.group.position);

    const nearbyPrompt = activeMap.getNearbyInteractionPrompt(
      this.player.group.position,
    );
    const interacted = this.input.consumeInteract();
    if (interacted && nearbyPrompt?.action && !this.isTransitioning) {
      if (nearbyPrompt.action === 'enter-dungeon') {
        this.transitionToDungeon(1);
      } else if (nearbyPrompt.action === 'next-dungeon-floor') {
        this.transitionToDungeon(this.currentFloor + 1);
      } else if (nearbyPrompt.action === 'exit-dungeon') {
        this.transitionToHub();
      }
    }

    if (
      this.activeLocation === 'dungeon' &&
      this.dungeonMap &&
      this.minimapCanvas &&
      this.minimapCtx
    ) {
      this.dungeonMap.renderMinimap(
        this.minimapCtx,
        this.minimapCanvas.width,
        this.minimapCanvas.height,
        this.player.group.position,
        this.player.getBodyYaw(),
      );
    }

    this.updateHud(moveInput.x, moveInput.y, nearbyPrompt);

    this.renderer.render(this.scene, this.isoCamera.camera);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private updateHud(
    inputX: number,
    inputY: number,
    nearbyPrompt: InteractionPrompt | null,
  ): void {
    if (this.analogKnob) {
      const radiusPx = 13;
      const offsetX = inputX * radiusPx;
      const offsetY = -inputY * radiusPx;
      this.analogKnob.style.transform = `translate(calc(-50% + ${offsetX.toFixed(1)}px), calc(-50% + ${offsetY.toFixed(1)}px))`;
    }

    if (this.moveStateEl) {
      const skillLabel = this.player.getActiveSkillLabel();
      if (skillLabel) {
        this.moveStateEl.textContent = skillLabel;
      } else if (this.player.isRunning()) {
        this.moveStateEl.textContent = 'Correndo';
      } else if (this.player.isMoving()) {
        this.moveStateEl.textContent = 'Andando';
      } else {
        this.moveStateEl.textContent = 'Parado';
      }
    }

    for (const ref of this.skillButtonRefs) {
      const state = this.player.getSkillState(ref.slot);
      ref.root.classList.toggle('is-active', state.active);
      ref.root.classList.toggle('on-cooldown', !state.ready);

      if (ref.overlay) {
        const deg =
          state.cooldownTotal > 0
            ? (state.cooldownRemaining / state.cooldownTotal) * 360
            : 0;
        ref.overlay.style.setProperty('--cd-deg', `${deg.toFixed(1)}deg`);
      }
      if (ref.timerText) {
        ref.timerText.textContent = state.ready
          ? ''
          : state.cooldownRemaining.toFixed(1);
      }
    }

    if (this.dungeonPromptEl) {
      if (nearbyPrompt && this.dungeonPromptTextEl) {
        this.dungeonPromptTextEl.textContent = nearbyPrompt.label;
      }
      const isActionable = Boolean(nearbyPrompt?.action);
      if (this.dungeonActionBtn) {
        this.dungeonActionBtn.classList.toggle('hidden', !isActionable);
      }
      if (isActionable && nearbyPrompt?.actionLabel && this.dungeonActionLabelEl) {
        this.dungeonActionLabelEl.textContent = nearbyPrompt.actionLabel;
      }
      this.dungeonPromptEl.classList.toggle('is-actionable', isActionable);
      this.dungeonPromptEl.classList.toggle('visible', nearbyPrompt !== null);
    }
  }

  public dispose(): void {
    cancelAnimationFrame(this.rafId);
    for (const id of this.transitionTimers) {
      clearTimeout(id);
    }
    this.transitionTimers.length = 0;

    if (this.dungeonMap) {
      this.dungeonMap.dispose();
      this.dungeonMap = null;
    }
    if (this.dungeonTextures) {
      this.dungeonTextures.stoneFloorMap.dispose();
      this.dungeonTextures.stoneFloorBump.dispose();
      this.dungeonTextures.corridorFloorMap.dispose();
      this.dungeonTextures.stoneWallMap.dispose();
      this.dungeonTextures.cavernRockMap.dispose();
      this.dungeonTextures.lightShaftMap.dispose();
      this.dungeonTextures = null;
    }
    dungeonAssetLibrary.dispose();

    window.removeEventListener('resize', this.onResize);
    this.returnHubBtn?.removeEventListener('click', this.onReturnHubClick);
    this.cleanupMobileUi();
    this.input.dispose(window);
    this.renderer.dispose();
  }
}

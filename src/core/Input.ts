import type { SwordSkillSlot } from '../entities/Player';
import { TouchControls } from './TouchControls';

export interface MoveInput {
  x: number;
  y: number;
  sprint: boolean;
}

const KEY_TO_SKILL: Record<string, SwordSkillSlot> = {
  Digit1: 'slash',
  KeyJ: 'slash',
  Digit2: 'spin',
  KeyQ: 'spin',
  KeyK: 'spin',
  Digit3: 'thrust',
  KeyE: 'thrust',
  KeyL: 'thrust',
  Digit4: 'ult',
  KeyR: 'ult',
  Space: 'ult',
};

export class Input {
  private readonly pressed = new Set<string>();
  private readonly touchControls: TouchControls;
  private readonly pendingSkills: SwordSkillSlot[] = [];
  private readonly pcSkillButtons: HTMLElement[] = [];
  private zoomTarget = 1.0;

  private static readonly MIN_ZOOM = 0.72;
  private static readonly MAX_ZOOM = 1.45;

  constructor(target: Window = window) {
    this.touchControls = new TouchControls();
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    target.addEventListener('wheel', this.onWheel, { passive: true });

    const buttons = document.querySelectorAll<HTMLElement>('.skill-btn-pc[data-skill-slot]');
    buttons.forEach((btn) => {
      this.pcSkillButtons.push(btn);
      btn.addEventListener('pointerdown', this.onPcSkillPointerDown);
    });
  }

  private onPcSkillPointerDown = (event: PointerEvent): void => {
    const btn = event.currentTarget as HTMLElement | null;
    const slot = btn?.dataset.skillSlot as SwordSkillSlot | undefined;
    if (!slot) return;
    event.preventDefault();
    this.pendingSkills.push(slot);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    this.pressed.add(event.code);

    if (!event.repeat) {
      const skill = KEY_TO_SKILL[event.code];
      if (skill) {
        if (event.code === 'Space') event.preventDefault();
        this.pendingSkills.push(skill);
      }
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private onBlur = (): void => {
    this.pressed.clear();
  };

  private onWheel = (event: WheelEvent): void => {
    const delta = Math.sign(event.deltaY) * 0.08;
    this.zoomTarget = Math.min(
      Input.MAX_ZOOM,
      Math.max(Input.MIN_ZOOM, this.zoomTarget + delta),
    );
  };

  public getZoomTarget(): number {
    return this.zoomTarget;
  }

  public getMoveInput(): MoveInput {
    const touch = this.touchControls.getState();

    let x = 0;
    let y = 0;

    if (Math.hypot(touch.x, touch.y) > 0.01) {
      x = touch.x;
      y = touch.y;
    } else {
      if (this.pressed.has('KeyD') || this.pressed.has('ArrowRight')) x += 1;
      if (this.pressed.has('KeyA') || this.pressed.has('ArrowLeft')) x -= 1;
      if (this.pressed.has('KeyW') || this.pressed.has('ArrowUp')) y += 1;
      if (this.pressed.has('KeyS') || this.pressed.has('ArrowDown')) y -= 1;

      const lenSq = x * x + y * y;
      if (lenSq > 1) {
        const invLen = 1 / Math.sqrt(lenSq);
        x *= invLen;
        y *= invLen;
      }
    }

    const keyboardSprint =
      this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight');

    return { x, y, sprint: keyboardSprint || touch.sprint };
  }

  public consumeTriggeredSkills(): SwordSkillSlot[] {
    const touchSkills = this.touchControls.consumeSkills();
    if (this.pendingSkills.length === 0 && touchSkills.length === 0) return [];
    const merged = [...this.pendingSkills, ...touchSkills];
    this.pendingSkills.length = 0;
    return merged;
  }

  public dispose(target: Window = window): void {
    this.touchControls.dispose();
    target.removeEventListener('keydown', this.onKeyDown);
    target.removeEventListener('keyup', this.onKeyUp);
    target.removeEventListener('blur', this.onBlur);
    target.removeEventListener('wheel', this.onWheel);
    for (const btn of this.pcSkillButtons) {
      btn.removeEventListener('pointerdown', this.onPcSkillPointerDown);
    }
  }
}

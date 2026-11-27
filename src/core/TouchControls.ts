import type { SwordSkillSlot } from '../entities/Player';

export interface TouchInputState {
  x: number;
  y: number;
  sprint: boolean;
}

const TOUCH_SKILL_BUTTON_IDS: Array<[string, SwordSkillSlot]> = [
  ['touch-skill-slash', 'slash'],
  ['touch-skill-spin', 'spin'],
  ['touch-skill-thrust', 'thrust'],
  ['touch-skill-ult', 'ult'],
];

export class TouchControls {
  private readonly joyZone: HTMLElement | null;
  private readonly joyBase: HTMLElement | null;
  private readonly joyKnob: HTMLElement | null;
  private readonly sprintBtn: HTMLElement | null;
  private readonly skillButtons = new Map<HTMLElement, SwordSkillSlot>();
  private readonly pendingSkills: SwordSkillSlot[] = [];

  private joyPointerId: number | null = null;
  private sprintPointerId: number | null = null;
  private joyCenterX = 0;
  private joyCenterY = 0;
  private readonly maxRadius = 46;
  private readonly deadzone = 0.08;

  private x = 0;
  private y = 0;
  private sprint = false;

  constructor() {
    this.joyZone = document.getElementById('touch-joystick-zone');
    this.joyBase = document.getElementById('touch-joystick-base');
    this.joyKnob = document.getElementById('touch-joystick-knob');
    this.sprintBtn = document.getElementById('touch-sprint-btn');

    if (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    ) {
      document.body.classList.add('is-touch');
    }

    window.addEventListener('pointerdown', this.onFirstTouchPointer, {
      passive: true,
    });

    if (this.joyZone) {
      this.joyZone.addEventListener('pointerdown', this.onJoyDown);
      this.joyZone.addEventListener('pointermove', this.onJoyMove);
      this.joyZone.addEventListener('pointerup', this.onJoyUp);
      this.joyZone.addEventListener('pointercancel', this.onJoyUp);
    }

    if (this.sprintBtn) {
      this.sprintBtn.addEventListener('pointerdown', this.onSprintDown);
      this.sprintBtn.addEventListener('pointerup', this.onSprintUp);
      this.sprintBtn.addEventListener('pointercancel', this.onSprintUp);
      this.sprintBtn.addEventListener('lostpointercapture', this.onSprintUp);
    }

    for (const [id, slot] of TOUCH_SKILL_BUTTON_IDS) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      this.skillButtons.set(btn, slot);
      btn.addEventListener('pointerdown', this.onSkillDown);
      btn.addEventListener('pointerup', this.onSkillUp);
      btn.addEventListener('pointercancel', this.onSkillUp);
    }
  }

  private onFirstTouchPointer = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      document.body.classList.add('is-touch');
    }
  };

  private onSkillDown = (event: PointerEvent): void => {
    const btn = event.currentTarget as HTMLElement | null;
    if (!btn) return;
    event.preventDefault();
    document.body.classList.add('is-touch');
    const slot = this.skillButtons.get(btn);
    if (slot) {
      this.pendingSkills.push(slot);
      btn.classList.add('pressed');
    }
  };

  private onSkillUp = (event: PointerEvent): void => {
    const btn = event.currentTarget as HTMLElement | null;
    btn?.classList.remove('pressed');
  };

  private onJoyDown = (event: PointerEvent): void => {
    if (this.joyPointerId !== null || !this.joyZone || !this.joyBase) return;
    event.preventDefault();
    document.body.classList.add('is-touch');

    this.joyPointerId = event.pointerId;
    this.joyZone.setPointerCapture(event.pointerId);

    const rect = this.joyBase.getBoundingClientRect();
    this.joyCenterX = rect.left + rect.width / 2;
    this.joyCenterY = rect.top + rect.height / 2;

    this.joyBase.classList.add('active');
    this.updateJoystick(event.clientX, event.clientY);
  };

  private onJoyMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.joyPointerId) return;
    event.preventDefault();
    this.updateJoystick(event.clientX, event.clientY);
  };

  private onJoyUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.joyPointerId) return;
    this.joyPointerId = null;
    this.x = 0;
    this.y = 0;

    if (this.joyBase) {
      this.joyBase.classList.remove('active');
    }
    if (this.joyKnob) {
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
    }
  };

  private updateJoystick(clientX: number, clientY: number): void {
    const dx = clientX - this.joyCenterX;
    const dy = clientY - this.joyCenterY;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(dist, this.maxRadius);
    const angle = Math.atan2(dy, dx);
    const visualX = Math.cos(angle) * clampedDist;
    const visualY = Math.sin(angle) * clampedDist;

    if (this.joyKnob) {
      this.joyKnob.style.transform = `translate(calc(-50% + ${visualX.toFixed(1)}px), calc(-50% + ${visualY.toFixed(1)}px))`;
    }

    const normMag = clampedDist / this.maxRadius;
    if (normMag < this.deadzone) {
      this.x = 0;
      this.y = 0;
      return;
    }

    const remapped = (normMag - this.deadzone) / (1 - this.deadzone);
    this.x = Math.cos(angle) * remapped;
    // Em espaço de tela, Y positivo = para cima (para frente no mundo isométrico)
    this.y = -Math.sin(angle) * remapped;
  }

  private onSprintDown = (event: PointerEvent): void => {
    if (this.sprintPointerId !== null || !this.sprintBtn) return;
    event.preventDefault();
    document.body.classList.add('is-touch');

    this.sprintPointerId = event.pointerId;
    this.sprintBtn.setPointerCapture(event.pointerId);
    this.sprint = true;
    this.sprintBtn.classList.add('active');
  };

  private onSprintUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.sprintPointerId) return;
    this.sprintPointerId = null;
    this.sprint = false;
    this.sprintBtn?.classList.remove('active');
  };

  public getState(): TouchInputState {
    return {
      x: this.x,
      y: this.y,
      sprint: this.sprint,
    };
  }

  public consumeSkills(): SwordSkillSlot[] {
    if (this.pendingSkills.length === 0) return [];
    return this.pendingSkills.splice(0, this.pendingSkills.length);
  }

  public dispose(): void {
    window.removeEventListener('pointerdown', this.onFirstTouchPointer);
    if (this.joyZone) {
      this.joyZone.removeEventListener('pointerdown', this.onJoyDown);
      this.joyZone.removeEventListener('pointermove', this.onJoyMove);
      this.joyZone.removeEventListener('pointerup', this.onJoyUp);
      this.joyZone.removeEventListener('pointercancel', this.onJoyUp);
    }
    if (this.sprintBtn) {
      this.sprintBtn.removeEventListener('pointerdown', this.onSprintDown);
      this.sprintBtn.removeEventListener('pointerup', this.onSprintUp);
      this.sprintBtn.removeEventListener('pointercancel', this.onSprintUp);
      this.sprintBtn.removeEventListener('lostpointercapture', this.onSprintUp);
    }
    for (const btn of this.skillButtons.keys()) {
      btn.removeEventListener('pointerdown', this.onSkillDown);
      btn.removeEventListener('pointerup', this.onSkillUp);
      btn.removeEventListener('pointercancel', this.onSkillUp);
    }
  }
}

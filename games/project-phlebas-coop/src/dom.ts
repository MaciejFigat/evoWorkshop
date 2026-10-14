import { ERAS, requireEra } from './eras';
import type { RenderableState } from './types';

export type Ui = {
  status: HTMLDivElement;
  board: HTMLCanvasElement;
  overlay: HTMLDivElement;
  overlayTitle: HTMLHeadingElement;
  overlayWeapon: HTMLParagraphElement;
  overlayEnemy: HTMLParagraphElement;
  score: HTMLElement;
  lives: HTMLElement;
  era: HTMLElement;
  speedSlow: HTMLButtonElement;
  speedNormal: HTMLButtonElement;
  speedFast: HTMLButtonElement;
  stayInEra: HTMLInputElement;
  eraPrev: HTMLButtonElement;
  eraNext: HTMLButtonElement;
};

function el<T extends HTMLElement>(root: ParentNode, id: string, ctor: new () => T): T {
  const node = root.querySelector(`#${id}`);
  if (!(node instanceof ctor)) {
    throw new Error(`#${id} is missing or not a ${ctor.name}`);
  }
  return node;
}

// Called once, after the GameView component has mounted its markup into the
// real DOM — unlike the single-player bench game, these elements don't
// exist at module-load time here, since React renders them.
export function createUi(root: ParentNode): Ui {
  return {
    status: el(root, 'status', HTMLDivElement),
    board: el(root, 'board', HTMLCanvasElement),
    overlay: el(root, 'overlay', HTMLDivElement),
    overlayTitle: el(root, 'overlayTitle', HTMLHeadingElement),
    overlayWeapon: el(root, 'overlayWeapon', HTMLParagraphElement),
    overlayEnemy: el(root, 'overlayEnemy', HTMLParagraphElement),
    score: el(root, 'score', HTMLElement),
    lives: el(root, 'lives', HTMLElement),
    era: el(root, 'era', HTMLElement),
    speedSlow: el(root, 'speedSlow', HTMLButtonElement),
    speedNormal: el(root, 'speedNormal', HTMLButtonElement),
    speedFast: el(root, 'speedFast', HTMLButtonElement),
    stayInEra: el(root, 'stayInEra', HTMLInputElement),
    eraPrev: el(root, 'eraPrev', HTMLButtonElement),
    eraNext: el(root, 'eraNext', HTMLButtonElement),
  };
}

export function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('2d canvas context unavailable');
  }
  return context;
}

export function showOverlay(ui: Ui, title: string, weaponText: string, enemyText: string): void {
  ui.overlayTitle.textContent = title;
  ui.overlayWeapon.textContent = weaponText;
  ui.overlayEnemy.textContent = enemyText;
  ui.overlay.classList.add('visible');
}

export function hideOverlay(ui: Ui): void {
  ui.overlay.classList.remove('visible');
}

export function refreshOverlay(ui: Ui, state: Pick<RenderableState, 'phase' | 'eraIndex' | 'score'>): void {
  if (state.phase === 'over') {
    showOverlay(ui, 'Game Over', `Final score: ${state.score}`, 'Reload the page to play again.');
    return;
  }
  if (state.phase === 'won') {
    showOverlay(ui, 'Project Shipped', `Final score: ${state.score}`, 'From relays to attention. Reload to run it again.');
    return;
  }
  if (state.phase === 'boss') {
    showOverlay(ui, 'The Transformer', requireEra(ERAS.length - 1).weaponTooltip, 'Boss: trained on everything that came before it. Keep the beam on target.');
    return;
  }
  const era = requireEra(state.eraIndex);
  showOverlay(ui, era.label, era.weaponTooltip, era.enemyTooltip);
}

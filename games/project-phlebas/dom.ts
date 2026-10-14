import { ERAS, requireEra } from './eras';
import type { GameState } from './types';

function el<T extends HTMLElement>(id: string, ctor: new () => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof ctor)) {
    throw new Error(`#${id} is missing or not a ${ctor.name}`);
  }
  return node;
}

export const ui = {
  status: el('status', HTMLDivElement),
  board: el('board', HTMLCanvasElement),
  overlay: el('overlay', HTMLDivElement),
  overlayTitle: el('overlayTitle', HTMLHeadingElement),
  overlayWeapon: el('overlayWeapon', HTMLParagraphElement),
  overlayEnemy: el('overlayEnemy', HTMLParagraphElement),
  score: el('score', HTMLElement),
  lives: el('lives', HTMLElement),
  era: el('era', HTMLElement),
  speedSlow: el('speedSlow', HTMLButtonElement),
  speedNormal: el('speedNormal', HTMLButtonElement),
  speedFast: el('speedFast', HTMLButtonElement),
  stayInEra: el('stayInEra', HTMLInputElement),
  eraPrev: el('eraPrev', HTMLButtonElement),
  eraNext: el('eraNext', HTMLButtonElement),
};

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('2d canvas context unavailable');
  }
  return context;
}

export const ctx = get2dContext(ui.board);

export function showOverlay(title: string, weaponText: string, enemyText: string): void {
  ui.overlayTitle.textContent = title;
  ui.overlayWeapon.textContent = weaponText;
  ui.overlayEnemy.textContent = enemyText;
  ui.overlay.classList.add('visible');
}

export function hideOverlay(): void {
  ui.overlay.classList.remove('visible');
}

export function refreshOverlay(state: GameState): void {
  if (state.phase === 'over') {
    showOverlay('Game Over', `Final score: ${state.score}`, 'Reload the page to play again.');
    return;
  }
  if (state.phase === 'won') {
    showOverlay('Project Shipped', `Final score: ${state.score}`, 'From relays to attention. Reload to run it again.');
    return;
  }
  if (state.phase === 'boss') {
    showOverlay('The Transformer', requireEra(ERAS.length - 1).weaponTooltip, 'Boss: trained on everything that came before it. Keep the beam on target.');
    return;
  }
  const era = requireEra(state.eraIndex);
  showOverlay(era.label, era.weaponTooltip, era.enemyTooltip);
}

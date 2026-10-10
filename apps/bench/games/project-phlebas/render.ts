import { BEAM_MAX_CHARGE_T, BEAM_WIDTH, BOARD_H, BOARD_W, BOSS_HP, PLAYER_HALF_W, PLAYER_Y } from './constants';
import { ctx, ui } from './dom';
import { ERAS, requireEra } from './eras';
import type { GameState } from './types';

function drawDiamond(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
}

export function render(state: GameState, nowMs: number): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';

  const era = requireEra(Math.min(state.eraIndex, ERAS.length - 1));
  if (era.weapon === 'attention' && state.beamCharge > 0) {
    const ratio = Math.min(state.beamCharge / BEAM_MAX_CHARGE_T, 1);
    ctx.globalAlpha = 0.25 + ratio * 0.5;
    ctx.fillRect(state.playerX - BEAM_WIDTH / 2, 0, BEAM_WIDTH, PLAYER_Y);
    ctx.globalAlpha = 1;
  }

  for (const bullet of state.bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const enemy of state.enemies) {
    if (enemy.kind === 'byte') {
      ctx.fillRect(enemy.x - enemy.r, enemy.y - enemy.r, enemy.r * 2, enemy.r * 2);
      ctx.save();
      ctx.strokeStyle = '#000';
      for (let col = 1; col < 4; col += 1) {
        const lineX = enemy.x - enemy.r + (col * enemy.r * 2) / 4;
        ctx.beginPath();
        ctx.moveTo(lineX, enemy.y - enemy.r);
        ctx.lineTo(lineX, enemy.y + enemy.r);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(enemy.x - enemy.r, enemy.y);
      ctx.lineTo(enemy.x + enemy.r, enemy.y);
      ctx.stroke();
      ctx.restore();
    } else if (enemy.kind === 'bit') {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 12px ui-monospace, Menlo, Consolas, monospace';
      if (enemy.bitValue) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(enemy.x - enemy.r, enemy.y - enemy.r, enemy.r * 2, enemy.r * 2);
        ctx.fillStyle = '#000';
        ctx.fillText('1', enemy.x, enemy.y + 1);
      } else {
        ctx.strokeStyle = '#555';
        ctx.strokeRect(enemy.x - enemy.r, enemy.y - enemy.r, enemy.r * 2, enemy.r * 2);
        ctx.fillStyle = '#555';
        ctx.fillText('0', enemy.x, enemy.y + 1);
      }
      ctx.restore();
    } else if (enemy.kind === 'loop') {
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.r, 0, Math.PI * 2);
      if (enemy.vulnerable) {
        ctx.fill();
      } else {
        ctx.stroke();
      }
    } else if (enemy.kind === 'bubble') {
      ctx.strokeRect(enemy.x - enemy.r, enemy.y - enemy.r * 0.6, enemy.r * 2, enemy.r * 1.2);
      ctx.beginPath();
      ctx.moveTo(enemy.x - enemy.r, enemy.y);
      ctx.lineTo(enemy.x + enemy.r, enemy.y);
      ctx.stroke();
    } else if (enemy.kind === 'hallucination') {
      ctx.globalAlpha = enemy.decoy ? (Math.sin(nowMs * 0.02) > 0 ? 1 : 0.15) : 1;
      if (enemy.decoy) {
        drawDiamond(ctx, enemy.x, enemy.y, enemy.r);
        ctx.stroke();
      } else {
        drawDiamond(ctx, enemy.x, enemy.y, enemy.r);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeRect(enemy.x - enemy.r, enemy.y - enemy.r, enemy.r * 2, enemy.r * 2);
      ctx.strokeRect(enemy.x - enemy.r + 8, enemy.y - enemy.r + 8, enemy.r * 2 - 16, enemy.r * 2 - 16);
      const ratio = Math.max(0, enemy.hp / BOSS_HP);
      ctx.strokeRect(enemy.x - 60, enemy.y - enemy.r - 16, 120, 8);
      ctx.fillRect(enemy.x - 60, enemy.y - enemy.r - 16, 120 * ratio, 8);
    }
  }

  ctx.beginPath();
  ctx.moveTo(state.playerX, PLAYER_Y - 14);
  ctx.lineTo(state.playerX - PLAYER_HALF_W, PLAYER_Y + 10);
  ctx.lineTo(state.playerX + PLAYER_HALF_W, PLAYER_Y + 10);
  ctx.closePath();
  ctx.fill();
}

export function updateHud(state: GameState): void {
  ui.score.textContent = String(state.score);
  ui.lives.textContent = String(Math.max(0, state.lives));
  ui.era.textContent = state.phase === 'boss' || state.phase === 'won' ? 'Boss' : requireEra(Math.min(state.eraIndex, ERAS.length - 1)).label;
}

import { randomInt } from 'node:crypto';
import type { PlayerInfo } from '@evo/project-phlebas-coop/shared';
import { mulberry32 } from '@evo/rng';

const SEED_RANGE = 2 ** 31;

export type RoomInfo = {
  code: string;
  maxPlayers: number;
  players: PlayerInfo[];
  roundNo: number;
  roundSeed: number | null;
  firstPlayerId: string | null;
  hostId: string | null;
};

export class Room {
  readonly code: string;
  readonly maxPlayers: number;
  private readonly seats: PlayerInfo[] = [];
  private roundNo = 0;
  private roundSeed: number | null = null;
  private firstPlayerId: string | null = null;

  constructor(code: string, maxPlayers: number) {
    this.code = code;
    this.maxPlayers = maxPlayers;
  }

  get full(): boolean {
    return this.seats.length >= this.maxPlayers;
  }

  get empty(): boolean {
    return this.seats.length === 0;
  }

  // Whoever is currently in the first seat — authoritative for the match
  // simulation (see client/src/GameView.tsx). If the host disconnects
  // mid-match, this shifts to the other seat, but nothing currently
  // reconstructs a running match from a new host; the game just freezes for
  // whoever's left. Fine for a demo, a real game would need a handoff.
  get hostId(): string | null {
    return this.seats[0]?.id ?? null;
  }

  join(id: string, name: string): boolean {
    if (this.full || this.seats.some((s) => s.id === id)) {
      return false;
    }
    this.seats.push({ id, name, ready: false });
    return true;
  }

  leave(id: string): void {
    const index = this.seats.findIndex((s) => s.id === id);
    if (index !== -1) {
      this.seats.splice(index, 1);
    }
  }

  // Everyone seated is ready: the server draws the one seed for the round,
  // and @evo/rng is the only thing allowed to turn it into an outcome —
  // here, which seated player moves first. A real game replaces this with
  // its own deal/shuffle/etc, seeded the same way.
  setReady(id: string): void {
    const seat = this.seats.find((s) => s.id === id);
    if (seat === undefined) {
      return;
    }
    seat.ready = true;
    if (this.seats.length === 0 || !this.seats.every((s) => s.ready)) {
      return;
    }
    this.roundNo += 1;
    this.roundSeed = randomInt(SEED_RANGE);
    const rng = mulberry32(this.roundSeed);
    this.firstPlayerId = this.seats[rng.int(0, this.seats.length - 1)]?.id ?? null;
    for (const s of this.seats) {
      s.ready = false;
    }
  }

  info(): RoomInfo {
    return {
      code: this.code,
      maxPlayers: this.maxPlayers,
      players: this.seats.map((s) => ({ ...s })),
      roundNo: this.roundNo,
      roundSeed: this.roundSeed,
      firstPlayerId: this.firstPlayerId,
      hostId: this.hostId,
    };
  }
}

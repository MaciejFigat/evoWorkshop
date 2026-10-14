// The persistence seam: Lobby only ever talks to this interface, so swapping
// the in-memory map below for a real database (lowdb, better-sqlite3, ...)
// later is a one-file change.
export type PlayerRecord = { id: string; name: string };

export type Store = {
  savePlayer(record: PlayerRecord): void;
  loadPlayer(id: string): PlayerRecord | undefined;
};

export function createMemoryStore(): Store {
  const players = new Map<string, PlayerRecord>();
  return {
    savePlayer: (record) => {
      players.set(record.id, record);
    },
    loadPlayer: (id) => players.get(id),
  };
}

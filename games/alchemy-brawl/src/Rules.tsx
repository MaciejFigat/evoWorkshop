// The short rules card: shown beside the lobby and as an overlay over the board.
export function Rules() {
  return (
    <div className="rules">
      <h2>How to play</h2>
      <p>A poker-family game: two rounds, and the pot is paid in two stages.</p>
      <ul>
        <li>You get 3 cards. One card plus two shared table cards make a three-card poker hand.</li>
        <li>
          Round 1: stay or skip, no betting. To stay you turn one card face up; it plays for the Round 1 pot with the
          two table cards and stays face up until the end of the hand. Nothing is ever discarded.
        </li>
        <li>
          Everyone draws a card, so everyone holds 4 in the Final: three table cards go up and all your cards play;
          fixed-limit betting, then the best three cards among your hand and the table.
        </li>
        <li>Best combination takes the pot; equal combinations split it. Nothing is spent in either round.</li>
      </ul>
    </div>
  );
}

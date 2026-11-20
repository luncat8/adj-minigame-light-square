# findings

- Ring quarter-turn: slots are clockwise, so 90° cw advances len/4 slots, not 1. A 1-slot shift is cell creep, not a rotation.
- Puzzle laser columns must be inside the 7x7 glass. Columns outside the glass light a straight border line, so targets stay lit under every ring rotation and the start is already solved.
- A one-slot ring shift is not a rigid rotation; a diagonal cannot be derived from the shift alone. Flip on corner entry only: four corner entries per cycle restore every diagonal.
- The 1x1 ring has no slots. Its only move is flipping the center mirror diagonal.
- Laser width >1 lights multiple columns and can solve a puzzle without ring moves. Generated puzzles stay at width 1 until width is part of puzzle state and difficulty.
- A rejection-sampled generator needs a deterministic valid fallback; returning the last candidate can return an already-solved board.
- Save/restore of ring state: shortest-delta rotation alone can leave an equivalent but different turn counter. Set the counter to the target after applying the delta when exact restore matters.

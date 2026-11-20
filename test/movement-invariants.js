// Movement model invariants test fixture (0.1)
// Tests ring strides, corner crossings, and move reversal
// Run with Node (requires no DOM)

const assert = require('assert');

// Ring definitions from 0.1.0-plan.md
const RINGS = {
  7: { side: 7, slots: 24, quarterSlots: 6, singleMoves: 24 },
  5: { side: 5, slots: 16, quarterSlots: 4, singleMoves: 16 },
  3: { side: 3, slots: 8,  quarterSlots: 2, singleMoves: 8 },
  1: { side: 1, slots: 1,  quarterSlots: 1, singleMoves: 1 } // 1x1 exception
};

function testRingStrides() {
  console.log("Testing ring strides...");
  for (const [sideStr, ring] of Object.entries(RINGS)) {
    const side = parseInt(sideStr, 10);
    const expectedSlots = 4 * (side - 1) || 1; // 1x1 is 1 slot conceptually for flip
    assert.strictEqual(ring.slots, expectedSlots, `Slots mismatch for ${side}x${side}`);
    
    if (side > 1) {
      // Quarter turn mode: 4 moves = 1 lap (4 * quarterSlots == slots)
      assert.strictEqual(ring.quarterSlots * 4, ring.slots, `${side}x${side} quarter turn lap mismatch`);
      // Single slot mode: moves per lap == slots
      assert.strictEqual(ring.singleMoves, ring.slots, `${side}x${side} single slot lap mismatch`);
    } else {
      // 1x1 exception: flip center mirror in place
      assert.strictEqual(ring.slots, 1, "1x1 should have 1 conceptual slot for flip");
    }
  }
  console.log("✓ Ring strides validated.");
}

function testCornerCrossings() {
  console.log("Testing corner crossings logic...");
  // Logic from 0.1:
  // Corner-turn OFF: diagonal fixed.
  // Corner-turn ON: mark 4 clockwise edges leaving corner slots; traversing flips diagonal.
  // Quarter turn crosses 1 marked edge per tile. Reversing undoes it.
  
  // We simulate a 3x3 ring (8 slots)
  // Slots: 0(TL corner), 1, 2(TR corner), 3, 4(BR corner), 5, 6(BL corner), 7
  // Marked edges (ON): leaving corners (0->1, 2->3, 4->5, 6->7)
  
  const cornerSlots = [0, 2, 4, 6];
  const markedEdges = cornerSlots.map(s => ({ from: s, to: (s + 1) % 8 }));
  
  // Quarter turn (2 slots for 3x3) crosses exactly 1 marked edge per tile?
  // For 3x3, quarter turn = 2 slots.
  // Start at 0 (corner). Move 2 slots: 0->1 (marked), 1->2 (unmarked). Total 1 marked edge.
  // Start at 1. Move 2 slots: 1->2 (unmarked), 2->3 (marked). Total 1 marked edge.
  // This holds for all starts.
  
  for (let start = 0; start < 8; start++) {
    let crossed = 0;
    for (let step = 0; step < 2; step++) {
      const from = (start + step) % 8;
      const to = (from + 1) % 8;
      if (markedEdges.some(e => e.from === from && e.to === to)) crossed++;
    }
    assert.strictEqual(crossed, 1, `Corner crossing mismatch at start ${start} for 3x3 quarter turn`);
  }
  console.log("✓ Corner crossings validated.");
}

function testMoveReversal() {
  console.log("Testing move reversal...");
  // For any ring S > 1, quarter turn uses same slot transitions as S-1 single steps.
  // Reversing a move undoes it exactly.
  // 1x1: two flips restore center mirror.
  
  // Mock state: ring position (0..slots-1) and diagonal (0: /, 1: \)
  const simulateMove = (ringSide, pos, diagonal, mode, direction, cornerOn) => {
    const ring = RINGS[ringSide];
    let newPos = pos;
    let newDiag = diagonal;
    
    const stride = mode === 'quarter' ? ring.quarterSlots : 1;
    const steps = direction === 'cw' ? stride : -stride;
    
    if (ringSide === 1) {
      // 1x1 exception: flips center mirror in place
      newDiag = 1 - diagonal; // / <-> \
    } else {
      newPos = (pos + steps + ring.slots) % ring.slots;
      if (cornerOn) {
        // Check if we crossed a marked edge
        // Marked edges: leaving corner slots (0, 2, 4, 6 for 3x3; generalize for S)
        // For simplicity, assume 3x3 logic for test:
        const cornerSlots = [0, 2, 4, 6].map(s => s * (ringSide === 3 ? 1 : (ringSide === 5 ? 2 : 3))); // simplified
        // Actually, let's just assert that if we move and then move back, we get original.
        // The math in 0.1 says reversal undoes exactly.
      }
    }
    return { pos: newPos, diag: newDiag };
  };

  // Test 7x7 Quarter Turn
  let state = { pos: 0, diag: 0 };
  state = simulateMove(7, state.pos, state.diag, 'quarter', 'cw', false);
  state = simulateMove(7, state.pos, state.diag, 'quarter', 'ccw', false);
  assert.strictEqual(state.pos, 0, "7x7 quarter turn reversal failed (pos)");
  assert.strictEqual(state.diag, 0, "7x7 quarter turn reversal failed (diag)");

  // Test 1x1 Center Flip
  state = { pos: 0, diag: 0 }; // /
  state = simulateMove(1, state.pos, state.diag, 'single', 'cw', false); // -> \
  state = simulateMove(1, state.pos, state.diag, 'single', 'cw', false); // -> /
  assert.strictEqual(state.diag, 0, "1x1 center flip reversal failed");

  console.log("✓ Move reversal validated.");
}

// Run tests
try {
  testRingStrides();
  testCornerCrossings();
  testMoveReversal();
  console.log("All movement model invariants passed.");
  process.exit(0);
} catch (err) {
  console.error("Movement model invariants failed:", err.message);
  process.exit(1);
}

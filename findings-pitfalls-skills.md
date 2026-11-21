# findings, pitfalls, skills

- board corner cells (0,0), (0,14), (14,0), (14,14) can never be hit: light is absorbed by the first border cell it enters and border cells do not propagate, so a ray along row/col 1 never turns the final corner. Keep corners out of 0.3 receiver pools and 0.4 generation.
- diagonal reflection is a xor on dir (0=up, 1=right, 2=down, 3=left): `/` = dir^1, `\` = dir^3.
- corner-rule flips reduce to a closed form: corner on + quarter = flip every tile each move; corner on + single = flip iff from-slot mod (side-1) is 0 (cw) or 1 (ccw); corner off = never. Fixtures count flips instead of walking edges.
- a mirror loop cannot trap a ray seeded in its interior: cardinal rays cross loop edges through straight cells and escape. Closed loops only terminate rays that travel the loop itself (visited on enqueue); fixture seeds the loop path.
- cross-file constants: top-level const is visible to later classic scripts but not on window and not across node modules. Read sibling exports inside functions (lazy init) instead of at definition time — keeps load order free and files requireable alone.
- trace bound: visited bitmask per (cell, dir) at enqueue, ≤3 propagations per entry, union at receivers; queue Int32Array(4096) covers 169 interior cells.
- RING_CELLS indexes the 49-cell glass tile array, not the 15×15 board: glass cell = (row-4)*7 + (col-4). Map through GLASS_OFF before any hit test or tile read against board coordinates.
- trace buffers (traceRecv/traceSeg) are null until the first traceReset: alias them at call time (recvNow/recvBuf pattern), never at module load — generate.js fixtures pass because of this, a load-time alias crashes the first evaluate.
- canvas.width/height assignment resets the 2d context state: setTransform + lineCap/lineJoin/composite must be set every paint, not once at init.
- dom smoke without a browser: stub document/window/rAF before require('../app.js') and drive the real addEventListener handlers through a stored-handler fire(); it caught both a coordinate-space bug and a load-order-lazy bug that node --check cannot see.
- 0.5 band measurement (n=200 x 12 ruleset-band combos): fallback 0%, attempts med 1 max 6, witness hits 1-3 — sampled availability is not the difficulty lever; bands differ by quota/color policy, so slider labels state the policy (few/any, all/any, all/exact).
- classic scripts share one global lexical scope: two files declaring the same top-level const (e.g. the `gBoard` node-shim in game.js and generate.js) throws SyntaxError at load, so every later file's globals are missing and boot dies with misleading ReferenceErrors. require-based experiments cannot see this — they run each file in its own module scope. Keep node-shim consts prefixed per file (g* / i* / a* / r* / n*).

# findings, pitfalls, skills

- board corner cells (0,0), (0,14), (14,0), (14,14) can never be hit: light is absorbed by the first border cell it enters and border cells do not propagate, so a ray along row/col 1 never turns the final corner. Keep corners out of 0.3 receiver pools and 0.4 generation.
- diagonal reflection is a xor on dir (0=up, 1=right, 2=down, 3=left): `/` = dir^1, `\` = dir^3.
- corner-rule flips reduce to a closed form: corner on + quarter = flip every tile each move; corner on + single = flip iff from-slot mod (side-1) is 0 (cw) or 1 (ccw); corner off = never. Fixtures count flips instead of walking edges.
- a mirror loop cannot trap a ray seeded in its interior: cardinal rays cross loop edges through straight cells and escape. Closed loops only terminate rays that travel the loop itself (visited on enqueue); fixture seeds the loop path.
- cross-file constants: top-level const is visible to later classic scripts but not on window and not across node modules. Read sibling exports inside functions (lazy init) instead of at definition time — keeps load order free and files requireable alone.
- trace bound: visited bitmask per (cell, dir) at enqueue, ≤3 propagations per entry, union at receivers; queue Int32Array(4096) covers 169 interior cells.

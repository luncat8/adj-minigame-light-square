// owns: board grid, concentric rings, puzzle generation
// edit for: board size, ring layout, cell generation, groups, difficulty

const Board = {
	n: 15,
	glass: 7,
	glassOff: 4,
	center: 7,
	EMPTY: 0,
	GLASS: 1,
	BORDER: 2,
	PASS: 0,
	MIRROR: 1,
	_buf: null
};

Board.DIFFICULTY = [
	{ max: 0.20, rings: [1, 1], depth: [1, 1], groups: [1, 1], size: [1, 1], need: [1.00, 1.00], exact: 0 },
	{ max: 0.40, rings: [1, 2], depth: [1, 2], groups: [1, 1], size: [2, 3], need: [0.80, 0.80], exact: 0 },
	{ max: 0.60, rings: [2, 3], depth: [2, 2], groups: [1, 2], size: [2, 3], need: [0.80, 0.80], exact: 1 },
	{ max: 0.80, rings: [3, 3], depth: [2, 3], groups: [2, 2], size: [2, 2], need: [1.00, 1.00], exact: 1 },
	// 12 is the half-period of the 24-slot ring; per-ring caps clamp it
	{ max: 1.01, rings: [4, 4], depth: [12, 12], groups: [2, 2], size: [2, 2], need: [1.00, 1.00], exact: 1 }
];

Board.makeCell = function(kind) {
	return { kind: kind, type: Board.PASS, diag: 0, mask: 0, light: 0 };
};

Board.isBorder = function(row, col) {
	const n = Board.n;
	return row === 0 || col === 0 || row === n - 1 || col === n - 1;
};

Board.inGlass = function(row, col) {
	const o = Board.glassOff;
	return row >= o && row < o + Board.glass && col >= o && col < o + Board.glass;
};

Board.ringSize = function(ring) {
	return Board.glass - 2 * ring;
};

Board.ringAt = function(row, col) {
	const d = Math.max(Math.abs(row - Board.center), Math.abs(col - Board.center));
	if (d > 3) return -1;
	return 3 - d;
};

Board.ringSlots = function(ring) {
	const s = Board.glassOff + ring;
	const size = Board.ringSize(ring);
	const slots = [];
	if (size <= 1) return slots;
	const w = Board.n;
	for (let i = 0; i < size; i++) slots.push(s * w + (s + i));
	for (let i = 1; i < size; i++) slots.push((s + i) * w + (s + size - 1));
	for (let i = 1; i < size; i++) slots.push((s + size - 1) * w + (s + size - 1 - i));
	for (let i = 1; i < size - 1; i++) slots.push((s + size - 1 - i) * w + s);
	return slots;
};

Board.create = function() {
	const n = Board.n;
	const b = {
		n: n,
		mode: 'quarter',
		flipAtCorners: true,
		grid: new Array(n * n),
		rings: [],
		groups: [],
		difficulty: 0.5,
		difficultyScore: 0,
		laserCol: 7,
		laserWidth: 1,
		laserStart: 0,
		solutionTurns: [0, 0, 0, 0],
		startTurns: [0, 0, 0, 0],
		solutionLaser: 7,
		solutionWidth: 1
	};
	for (let row = 0; row < n; row++) {
		for (let col = 0; col < n; col++) {
			let kind = Board.EMPTY;
			if (Board.isBorder(row, col)) kind = Board.BORDER;
			else if (Board.inGlass(row, col)) kind = Board.GLASS;
			b.grid[row * n + col] = Board.makeCell(kind);
		}
	}
	for (let ring = 0; ring < 4; ring++) {
		b.rings.push({ size: Board.ringSize(ring), slots: Board.ringSlots(ring), turns: 0 });
	}
	Board.updateLaser(b);
	return b;
};

Board.updateLaser = function(b) {
	const w = b.laserWidth;
	let start = b.laserCol - ((w - 1) >> 1);
	if (start < 0) start = 0;
	const max = Board.n - w;
	if (start > max) start = max;
	b.laserStart = start;
};

Board.period = function(b, ring) {
	const slots = b.rings[ring].slots;
	if (slots.length === 0) return 2;
	return b.mode === 'shift' ? slots.length : 4;
};

Board.rotateRing = function(b, ring, dir) {
	const slots = b.rings[ring].slots;
	const len = slots.length;
	if (len === 0) {
		b.grid[Board.center * b.n + Board.center].diag ^= 1;
		b.rings[ring].turns += dir;
		return;
	}
	let buf = Board._buf;
	if (!buf || buf.length < len) {
		buf = new Array(len);
		Board._buf = buf;
	}
	const quarter = b.mode !== 'shift';
	const step = quarter ? len >> 2 : 1;
	const shift = dir * step;
	for (let i = 0; i < len; i++) buf[i] = b.grid[slots[i]];
	for (let i = 0; i < len; i++) {
		const cell = buf[(i - shift + len) % len];
		b.grid[slots[i]] = cell;
		if (quarter) {
			cell.diag ^= 1;
			continue;
		}
		if (b.flipAtCorners) {
			const c = dir > 0 ? i : (i + 1) % len;
			if (c === 0 || c === len >> 2 || c === len >> 1 || c === (len >> 2) + (len >> 1)) cell.diag ^= 1;
		}
	}
	b.rings[ring].turns += dir;
};

Board.applyTurns = function(b, turns) {
	for (let ring = 0; ring < b.rings.length; ring++) {
		const period = Board.period(b, ring);
		const current = b.rings[ring].turns;
		let delta = (turns[ring] - current) % period;
		if (delta < 0) delta += period;
		if (delta > period >> 1) delta -= period;
		const steps = delta < 0 ? -delta : delta;
		const dir = delta < 0 ? -1 : 1;
		for (let k = 0; k < steps; k++) Board.rotateRing(b, ring, dir);
		b.rings[ring].turns = turns[ring];
	}
};

Board.normalizeTurns = function(b, turns) {
	for (let ring = 0; ring < b.rings.length; ring++) {
		const period = Board.period(b, ring);
		let t = turns[ring] % period;
		if (t < 0) t += period;
		turns[ring] = t;
	}
	return turns;
};

Board.fillGlass = function(b, rng) {
	const n = Board.n;
	const o = Board.glassOff;
	for (let row = o; row < o + Board.glass; row++) {
		for (let col = o; col < o + Board.glass; col++) {
			const cell = b.grid[row * n + col];
			if (rng() < 0.3) {
				cell.type = Board.MIRROR;
				cell.diag = rng() < 0.5 ? 0 : 1;
				cell.mask = 1 + Math.floor(rng() * 7);
			} else {
				cell.type = Board.PASS;
				cell.diag = 0;
				cell.mask = 0;
			}
		}
	}
};

Board.countBorderLit = function(b) {
	const n = b.n;
	const g = b.grid;
	let count = 0;
	for (let col = 0; col < n; col++) {
		if (g[col].light) count++;
		if (g[(n - 1) * n + col].light) count++;
	}
	for (let row = 1; row < n - 1; row++) {
		if (g[row * n].light) count++;
		if (g[row * n + n - 1].light) count++;
	}
	return count;
};

Board.cellGood = function(light, mask, exact) {
	if (exact) return light === mask;
	return light > 0;
};

Board.groupGood = function(group, grid) {
	const cells = group.cells;
	let count = 0;
	for (let i = 0; i < cells.length; i++) {
		const c = cells[i];
		if (Board.cellGood(grid[c.idx].light, c.mask, group.exact)) count++;
	}
	return count;
};

Board.groupGoodLight = function(group, light) {
	const cells = group.cells;
	let count = 0;
	for (let i = 0; i < cells.length; i++) {
		const c = cells[i];
		if (Board.cellGood(light[c.idx], c.mask, group.exact)) count++;
	}
	return count;
};

Board.isGroupSatisfied = function(b, group) {
	return Board.groupGood(group, b.grid) >= group.need;
};

Board.countGroupsSatisfied = function(b) {
	let count = 0;
	for (let i = 0; i < b.groups.length; i++) {
		if (Board.isGroupSatisfied(b, b.groups[i])) count++;
	}
	return count;
};

Board.isSolved = function(b) {
	return b.groups.length > 0 && Board.countGroupsSatisfied(b) === b.groups.length;
};

Board.clamp01 = function(value) {
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
};

Board.blendRange = function(rng, a, b, f) {
	const lo = Math.round(a[0] + (b[0] - a[0]) * f);
	const hi = Math.round(a[1] + (b[1] - a[1]) * f);
	const min = lo < hi ? lo : hi;
	const max = lo < hi ? hi : lo;
	return min + Math.floor(rng() * (max - min + 1));
};

Board.profile = function(rng, difficulty) {
	const d = Board.clamp01(difficulty);
	const t = d * 4;
	let i = Math.floor(t);
	if (i > 3) i = 3;
	const j = i + 1;
	const f = t - i;
	const a = Board.DIFFICULTY[i];
	const c = Board.DIFFICULTY[j];
	const needMin = a.need[0] + (c.need[0] - a.need[0]) * f;
	const needMax = a.need[1] + (c.need[1] - a.need[1]) * f;
	return {
		rings: Board.blendRange(rng, a.rings, c.rings, f),
		depth: Board.blendRange(rng, a.depth, c.depth, f),
		groups: Board.blendRange(rng, a.groups, c.groups, f),
		size: Board.blendRange(rng, a.size, c.size, f),
		need: needMin + (needMax - needMin) * rng(),
		exact: rng() < a.exact + (c.exact - a.exact) * f
	};
};

Board.columnRings = function(b, col) {
	const seen = [false, false, false, false];
	for (let row = Board.glassOff; row < Board.glassOff + Board.glass; row++) {
		const ring = Board.ringAt(row, col);
		if (ring >= 0) seen[ring] = true;
	}
	const rings = [];
	for (let r = 0; r < 4; r++) {
		if (seen[r]) rings.push(r);
	}
	return rings;
};

Board.activeRings = function(rng, count, candidates) {
	const pool = candidates.slice();
	for (let r = 0; r < 4; r++) {
		if (pool.indexOf(r) < 0) pool.push(r);
	}
	const source = count <= candidates.length ? candidates : pool;
	for (let i = source.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const tmp = source[i];
		source[i] = source[j];
		source[j] = tmp;
	}
	const take = count < source.length ? count : source.length;
	source.length = take;
	source.sort(function(a, b) { return a - b; });
	return source;
};

Board.buildGroups = function(b, p, lit, solvedLight, startLight, rng) {
	const used = new Uint8Array(b.n * b.n);
	const groups = [];
	for (let gi = 0; gi < p.groups; gi++) {
		const notGood = [];
		const good = [];
		for (let i = 0; i < lit.length; i++) {
			const idx = lit[i];
			if (used[idx] || solvedLight[idx] === 0) continue;
			const goodNow = p.exact ? startLight[idx] === solvedLight[idx] : startLight[idx] > 0;
			if (goodNow) good.push(idx);
			else notGood.push(idx);
		}
		if (notGood.length + good.length < p.size) return null;
		const cells = [];
		for (let k = 0; k < p.size; k++) {
			const src = notGood.length > 0 ? notGood : good;
			const j = Math.floor(rng() * src.length);
			const idx = src[j];
			src[j] = src[src.length - 1];
			src.pop();
			used[idx] = 1;
			cells.push({ idx: idx, mask: p.exact ? solvedLight[idx] : 0 });
		}
		const need = Math.max(1, Math.min(cells.length, Math.round(p.need * cells.length)));
		groups.push({ cells: cells, need: need, exact: p.exact });
	}
	return groups;
};

Board.difficultyScore = function(b) {
	const count = b.rings.length;
	let depth = 0;
	for (let r = 0; r < count; r++) {
		const period = Board.period(b, r);
		let delta = (b.startTurns[r] - b.solutionTurns[r]) % period;
		if (delta < 0) delta += period;
		const d = delta < period - delta ? delta : period - delta;
		depth += d / Math.floor(period / 2);
	}
	depth /= count;
	let strict = 0;
	for (let i = 0; i < b.groups.length; i++) {
		const g = b.groups[i];
		strict += g.need / g.cells.length;
	}
	strict /= b.groups.length;
	const color = b.groups[0].exact ? 1 : 0;
	const group = (b.groups.length - 1) / 2;
	return 0.4 * depth + 0.3 * strict + 0.2 * color + 0.1 * group;
};

Board.attempt = function(rng, settings, p, trace) {
	const n = Board.n;
	const b = Board.create();
	b.mode = settings.mode;
	b.flipAtCorners = settings.flipAtCorners;
	b.difficulty = settings.difficulty;
	Board.fillGlass(b, rng);
	const center = b.grid[Board.center * n + Board.center];
	center.type = Board.MIRROR;
	center.diag = rng() < 0.5 ? 0 : 1;
	center.mask = 1 + Math.floor(rng() * 7);
	const solvedTurns = [0, 0, 0, 0];
	for (let ring = 0; ring < 4; ring++) {
		const period = Board.period(b, ring);
		solvedTurns[ring] = Math.floor(rng() * period);
		for (let k = 0; k < solvedTurns[ring]; k++) Board.rotateRing(b, ring, 1);
	}
	const required = p.groups * p.size;
	let bestCount = -1;
	const bestCols = [];
	for (let col = Board.glassOff; col < Board.glassOff + Board.glass; col++) {
		b.laserCol = col;
		b.laserWidth = 1;
		Board.updateLaser(b);
		trace(b);
		const count = Board.countBorderLit(b);
		if (count > bestCount) {
			bestCount = count;
			bestCols.length = 0;
			bestCols.push(col);
		} else if (count === bestCount) bestCols.push(col);
	}
	if (bestCount < required) return null;
	const bestCol = bestCols[Math.floor(rng() * bestCols.length)];
	b.laserCol = bestCol;
	b.laserWidth = 1;
	Board.updateLaser(b);
	trace(b);
	const solvedLight = new Uint8Array(n * n);
	const lit = [];
	for (let i = 0; i < n * n; i++) {
		solvedLight[i] = b.grid[i].light;
		if (Board.isBorder(Math.floor(i / n), i % n) && b.grid[i].light > 0) lit.push(i);
	}
	const active = Board.activeRings(rng, p.rings, Board.columnRings(b, bestCol));
	for (let a = 0; a < active.length; a++) {
		const ring = active[a];
		const period = Board.period(b, ring);
		const cap = Math.min(p.depth, Math.floor(period / 2));
		const depth = 1 + Math.floor(rng() * cap);
		const dir = rng() < 0.5 ? -1 : 1;
		for (let k = 0; k < depth; k++) Board.rotateRing(b, ring, dir);
	}
	const startTurns = [0, 0, 0, 0];
	for (let ring = 0; ring < 4; ring++) {
		const period = Board.period(b, ring);
		let t = b.rings[ring].turns % period;
		if (t < 0) t += period;
		startTurns[ring] = t;
		b.rings[ring].turns = t;
	}
	trace(b);
	const startLight = new Uint8Array(n * n);
	for (let i = 0; i < n * n; i++) startLight[i] = b.grid[i].light;
	const groups = Board.buildGroups(b, p, lit, solvedLight, startLight, rng);
	if (!groups) return null;
	b.groups = groups;
	if (Board.isSolved(b)) return null;
	for (let i = 0; i < groups.length; i++) {
		if (Board.groupGoodLight(groups[i], startLight) >= groups[i].need) return null;
	}
	if (Board.laserSolves(b, trace)) return null;
	Board.applyTurns(b, solvedTurns);
	b.laserCol = bestCol;
	b.laserWidth = 1;
	Board.updateLaser(b);
	trace(b);
	if (!Board.isSolved(b)) return null;
	Board.applyTurns(b, startTurns);
	b.laserCol = bestCol;
	b.laserWidth = 1;
	Board.updateLaser(b);
	trace(b);
	b.solutionTurns = solvedTurns;
	b.startTurns = startTurns;
	b.solutionLaser = bestCol;
	b.solutionWidth = 1;
	b.laserCol = bestCol;
	b.laserWidth = 1;
	b.difficultyScore = Board.difficultyScore(b);
	return b;
};

Board.seeded = function(seed) {
	let a = seed >>> 0;
	return function() {
		a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
		return a / 4294967296;
	};
};

Board.fallback = function(settings, trace) {
	const easy = { rings: 1, depth: 1, groups: 1, size: 1, need: 1, exact: false };
	for (let seed = 0; seed < 256; seed++) {
		const b = Board.attempt(Board.seeded(seed), settings, easy, trace);
		if (b) return b;
	}
	throw new Error('generation failed');
};

Board.generate = function(rng, settings, trace) {
	rng = rng || Math.random;
	settings = settings || {};
	const mode = settings.mode === 'shift' ? 'shift' : 'quarter';
	const flipAtCorners = settings.flipAtCorners !== false;
	const difficulty = Board.clamp01(settings.difficulty === undefined ? 0.5 : settings.difficulty);
	const base = { mode: mode, flipAtCorners: flipAtCorners, difficulty: difficulty };
	for (let attempt = 0; attempt < 24; attempt++) {
		const b = Board.attempt(rng, base, Board.profile(rng, difficulty), trace);
		if (b) return b;
	}
	return Board.fallback(base, trace);
};

Board.laserSolves = function(b, trace) {
	const keep = b.laserCol;
	const keepWidth = b.laserWidth;
	let solved = false;
	for (let col = 0; col < b.n; col++) {
		b.laserCol = col;
		b.laserWidth = 1;
		Board.updateLaser(b);
		trace(b);
		if (Board.isSolved(b)) {
			solved = true;
			break;
		}
	}
	b.laserCol = keep;
	b.laserWidth = keepWidth;
	Board.updateLaser(b);
	trace(b);
	return solved;
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Board: Board };
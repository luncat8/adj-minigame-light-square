// owns: puzzle generation, target groups, difficulty profiles
// edit for: group sampling, difficulty tiers, generation retries

if (typeof module !== 'undefined' && module.exports) global.Board = require('./board.js').Board;

const Generate = {};

Generate.DIFFICULTY = [
	{ max: 0.20, rings: [1, 1], depth: [1, 1], groups: [1, 1], size: [1, 1], need: [1.00, 1.00], exact: 0 },
	{ max: 0.40, rings: [1, 2], depth: [1, 2], groups: [1, 1], size: [2, 3], need: [0.80, 0.80], exact: 0 },
	{ max: 0.60, rings: [2, 3], depth: [2, 2], groups: [1, 2], size: [2, 3], need: [0.80, 0.80], exact: 1 },
	{ max: 0.80, rings: [3, 3], depth: [2, 3], groups: [2, 2], size: [2, 2], need: [1.00, 1.00], exact: 1 },
	// 12 is the half-period of the 24-slot ring; per-ring caps clamp it
	{ max: 1.01, rings: [4, 4], depth: [12, 12], groups: [2, 2], size: [2, 2], need: [1.00, 1.00], exact: 1 }
];

Generate.blendRange = function(rng, a, b, f) {
	const lo = Math.round(a[0] + (b[0] - a[0]) * f);
	const hi = Math.round(a[1] + (b[1] - a[1]) * f);
	const min = lo < hi ? lo : hi;
	const max = lo < hi ? hi : lo;
	return min + Math.floor(rng() * (max - min + 1));
};

Generate.profile = function(rng, difficulty) {
	const d = Board.clamp01(difficulty);
	const t = d * 4;
	let i = Math.floor(t);
	if (i > 3) i = 3;
	const j = i + 1;
	const f = t - i;
	const a = Generate.DIFFICULTY[i];
	const c = Generate.DIFFICULTY[j];
	const needMin = a.need[0] + (c.need[0] - a.need[0]) * f;
	const needMax = a.need[1] + (c.need[1] - a.need[1]) * f;
	return {
		rings: Generate.blendRange(rng, a.rings, c.rings, f),
		depth: Generate.blendRange(rng, a.depth, c.depth, f),
		groups: Generate.blendRange(rng, a.groups, c.groups, f),
		size: Generate.blendRange(rng, a.size, c.size, f),
		need: needMin + (needMax - needMin) * rng(),
		exact: rng() < a.exact + (c.exact - a.exact) * f
	};
};

Generate.columnRings = function(b, col) {
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

Generate.activeRings = function(rng, count, candidates) {
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

Generate.buildGroups = function(b, p, lit, solvedLight, startLight, rng) {
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

Generate.difficultyScore = function(b) {
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

Generate.attempt = function(rng, settings, p, trace) {
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
	const active = Generate.activeRings(rng, p.rings, Generate.columnRings(b, bestCol));
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
	const groups = Generate.buildGroups(b, p, lit, solvedLight, startLight, rng);
	if (!groups) return null;
	b.groups = groups;
	if (Board.isSolved(b)) return null;
	for (let i = 0; i < groups.length; i++) {
		if (Board.groupGoodLight(groups[i], startLight) >= groups[i].need) return null;
	}
	if (Generate.laserSolves(b, trace)) return null;
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
	b.difficultyScore = Generate.difficultyScore(b);
	Board.allocStatus(b);
	return b;
};

Generate.seeded = function(seed) {
	let a = seed >>> 0;
	return function() {
		a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
		return a / 4294967296;
	};
};

Generate.fallback = function(settings, trace) {
	const easy = { rings: 1, depth: 1, groups: 1, size: 1, need: 1, exact: false };
	for (let seed = 0; seed < 256; seed++) {
		const b = Generate.attempt(Generate.seeded(seed), settings, easy, trace);
		if (b) return b;
	}
	throw new Error('generation failed');
};

Generate.make = function(rng, settings, trace) {
	rng = rng || Math.random;
	settings = settings || {};
	const mode = settings.mode === 'shift' ? 'shift' : 'quarter';
	const flipAtCorners = settings.flipAtCorners !== false;
	const difficulty = Board.clamp01(settings.difficulty === undefined ? 0.5 : settings.difficulty);
	const base = { mode: mode, flipAtCorners: flipAtCorners, difficulty: difficulty };
	let attempts = 0;
	for (; attempts < 24; attempts++) {
		const b = Generate.attempt(rng, base, Generate.profile(rng, difficulty), trace);
		if (b) {
			b.attempts = attempts + 1;
			b.fallback = false;
			return b;
		}
	}
	const b = Generate.fallback(base, trace);
	b.attempts = attempts;
	b.fallback = true;
	return b;
};

Generate.laserSolves = function(b, trace) {
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

if (typeof module !== 'undefined' && module.exports) module.exports = { Generate: Generate };
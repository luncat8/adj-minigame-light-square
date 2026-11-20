// owns: board grid, concentric rings, puzzle generation
// edit for: board size, ring layout, cell generation, target selection

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
		targets: [],
		laserCol: 7,
		laserWidth: 1,
		laserStart: 0,
		solutionTurns: [0, 0, 0, 0],
		startTurns: [0, 0, 0, 0],
		solutionLaser: 7
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

Board.countSolved = function(b) {
	const g = b.grid;
	const t = b.targets;
	let count = 0;
	for (let i = 0; i < t.length; i++) {
		if (g[t[i].idx].light === t[i].mask) count++;
	}
	return count;
};

Board.isSolved = function(b) {
	return b.targets.length > 0 && Board.countSolved(b) === b.targets.length;
};

Board.generate = function(rng, settings, trace) {
	rng = rng || Math.random;
	settings = settings || {};
	const mode = settings.mode === 'shift' ? 'shift' : 'quarter';
	const flipAtCorners = settings.flipAtCorners !== false;
	const targetCount = settings.targetCount || 4;
	const n = Board.n;
	let b = null;
	for (let attempt = 0; attempt < 40; attempt++) {
		b = Board.create();
		b.mode = mode;
		b.flipAtCorners = flipAtCorners;
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
		let bestCount = -1;
		let bestCol = Board.glassOff;
		let bestCols = [];
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
		if (bestCount < 2) continue;
		bestCol = bestCols[Math.floor(rng() * bestCols.length)];
		b.laserCol = bestCol;
		b.laserWidth = 1;
		Board.updateLaser(b);
		trace(b);
		const lit = [];
		for (let i = 0; i < n * n; i++) {
			if (!Board.isBorder(Math.floor(i / n), i % n)) continue;
			if (b.grid[i].light > 0) lit.push(i);
		}
		if (lit.length < 2) continue;
		for (let i = lit.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			const tmp = lit[i];
			lit[i] = lit[j];
			lit[j] = tmp;
		}
		b.targets = [];
		const take = Math.min(targetCount, lit.length);
		for (let i = 0; i < take; i++) {
			const idx = lit[i];
			b.targets.push({ idx: idx, mask: b.grid[idx].light });
		}
		for (let ring = 0; ring < 4; ring++) {
			const period = Board.period(b, ring);
			const depth = 1 + Math.floor(rng() * Math.floor(period / 2));
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
		b.solutionTurns = solvedTurns;
		b.startTurns = startTurns;
		b.solutionLaser = bestCol;
		b.laserCol = bestCol;
		Board.updateLaser(b);
		trace(b);
		if (Board.countSolved(b) === b.targets.length) continue;
		if (Board.laserSolves(b, trace)) continue;
		Board.applyTurns(b, b.solutionTurns);
		b.laserCol = bestCol;
		Board.updateLaser(b);
		trace(b);
		if (!Board.isSolved(b)) continue;
		Board.applyTurns(b, b.startTurns);
		b.laserCol = bestCol;
		Board.updateLaser(b);
		trace(b);
		return b;
	}
	return b;
};

Board.laserSolves = function(b, trace) {
	const n = b.n;
	const keep = b.laserCol;
	const keepWidth = b.laserWidth;
	let solved = false;
	for (let col = 0; col < n; col++) {
		b.laserCol = col;
		b.laserWidth = 1;
		Board.updateLaser(b);
		trace(b);
		if (Board.countSolved(b) === b.targets.length) {
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

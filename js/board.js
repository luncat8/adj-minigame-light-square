// owns: board grid, concentric rings, cell rules
// edit for: board size, ring layout, ring moves, group scoring

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
		groups: [],
		difficulty: 0.5,
		difficultyScore: 0,
		preview: false,
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

Board.allocStatus = function(b) {
	const n = b.n;
	const groups = b.groups;
	b.status = new Uint8Array(n * n);
	b.found = new Uint8Array(n * n);
	b.targetGroup = new Int16Array(n * n);
	b.groupGood = new Uint16Array(groups.length);
	b.groupNeed = new Uint16Array(groups.length);
	b.progress = 0;
	b.remaining = 0;
	b.wrong = 0;
	b.preview = false;
	for (let gi = 0; gi < groups.length; gi++) {
		const group = groups[gi];
		const cells = group.cells;
		b.groupNeed[gi] = group.need;
		for (let ci = 0; ci < cells.length; ci++) b.targetGroup[cells[ci].idx] = gi + 1;
	}
};

Board.refreshStatus = function(b) {
	if (!b.status || b.groupGood.length !== b.groups.length) Board.allocStatus(b);
	const grid = b.grid;
	const status = b.status;
	const groups = b.groups;
	status.fill(0);
	let progress = 0;
	let remaining = 0;
	let wrong = 0;
	for (let gi = 0; gi < groups.length; gi++) {
		const group = groups[gi];
		const cells = group.cells;
		let good = 0;
		let partial = 0;
		for (let ci = 0; ci < cells.length; ci++) {
			const cell = cells[ci];
			const idx = cell.idx;
			const light = grid[idx].light;
			let s = 0;
			if (group.exact) {
				if (light === cell.mask) s = 2;
				else if (light > 0) s = (light & cell.mask) !== 0 ? 1 : 3;
			} else if (light > 0) s = 2;
			status[idx] = s;
			if (s === 2) {
				good++;
				if (!b.preview) b.found[idx] = 1;
			} else if (s === 1) partial++;
			else if (s === 3) wrong++;
		}
		const score = good + 0.5 * partial;
		progress += (score < group.need ? score : group.need) / group.need;
		const need = group.need - good;
		if (need > 0) remaining += need;
		b.groupGood[gi] = good;
	}
	b.progress = groups.length > 0 ? progress / groups.length : 0;
	b.remaining = remaining;
	b.wrong = wrong;
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Board: Board };
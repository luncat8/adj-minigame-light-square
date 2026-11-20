// owns: laser tracing, mirror splitting, light masks
// edit for: reflection rules, beam limits, color bits

const Optics = {
	MIRROR: 1,
	DX: [0, 1, 0, -1],
	DY: [-1, 0, 1, 0],
	segments: null,
	segCount: 0,
	maxSegments: 2048,
	beamX: null,
	beamY: null,
	beamDir: null,
	beamMask: null,
	beamCount: 0,
	maxBeams: 256,
	maxSteps: 4096
};

Optics.init = function() {
	const segs = new Array(Optics.maxSegments);
	for (let i = 0; i < Optics.maxSegments; i++) {
		segs[i] = { x1: 0, y1: 0, x2: 0, y2: 0, mask: 0 };
	}
	Optics.segments = segs;
	Optics.segCount = 0;
	Optics.beamX = new Int16Array(Optics.maxBeams);
	Optics.beamY = new Int16Array(Optics.maxBeams);
	Optics.beamDir = new Int8Array(Optics.maxBeams);
	Optics.beamMask = new Int8Array(Optics.maxBeams);
	Optics.beamCount = 0;
};

Optics.pushBeam = function(x, y, dir, mask) {
	const i = Optics.beamCount;
	if (i >= Optics.maxBeams) return;
	Optics.beamX[i] = x;
	Optics.beamY[i] = y;
	Optics.beamDir[i] = dir;
	Optics.beamMask[i] = mask;
	Optics.beamCount = i + 1;
};

Optics.addSegment = function(x1, y1, x2, y2, mask) {
	const i = Optics.segCount;
	if (i >= Optics.maxSegments) return;
	const s = Optics.segments[i];
	s.x1 = x1;
	s.y1 = y1;
	s.x2 = x2;
	s.y2 = y2;
	s.mask = mask;
	Optics.segCount = i + 1;
};

Optics.stepBeam = function(b, x, y, dir, mask) {
	const n = b.n;
	const grid = b.grid;
	let cx = x;
	let cy = y;
	let cd = dir;
	let cm = mask;
	let guard = 0;
	while (guard++ < 512) {
		const nx = cx + Optics.DX[cd];
		const ny = cy + Optics.DY[cd];
		if (nx < 0 || ny < 0 || nx >= n || ny >= n) {
			Optics.addSegment(cx + 0.5, cy + 0.5, nx + 0.5, ny + 0.5, cm);
			return;
		}
		Optics.addSegment(cx + 0.5, cy + 0.5, nx + 0.5, ny + 0.5, cm);
		cx = nx;
		cy = ny;
		const cell = grid[cy * n + cx];
		cell.light |= cm;
		if (cell.type !== Optics.MIRROR) continue;
		const reflect = cm & cell.mask;
		const pass = cm & ~cell.mask;
		if (reflect) {
			const rd = cell.diag === 0 ? (cd ^ 1) : (3 - cd);
			Optics.pushBeam(cx, cy, rd, reflect);
		}
		if (!pass) return;
		cm = pass;
	}
};

Optics.trace = function(b) {
	const n = b.n;
	const grid = b.grid;
	for (let i = 0; i < grid.length; i++) grid[i].light = 0;
	Optics.segCount = 0;
	Optics.beamCount = 0;
	const w = b.laserWidth;
	const start = b.laserStart;
	for (let i = 0; i < w; i++) {
		const col = start + i;
		if (col < 0 || col >= n) continue;
		Optics.pushBeam(col, n, 0, 7);
	}
	let steps = 0;
	while (Optics.beamCount > 0 && steps < Optics.maxSteps) {
		steps++;
		Optics.beamCount--;
		const i = Optics.beamCount;
		Optics.stepBeam(b, Optics.beamX[i], Optics.beamY[i], Optics.beamDir[i], Optics.beamMask[i]);
	}
};

if (typeof module !== 'undefined' && module.exports) module.exports = { Optics: Optics };

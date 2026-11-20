// owns: canvas drawing of board, glass, beams, receivers and hint overlays
// edit for: visuals, layout, overlays

// one RGB string per reflect-mask bit value; indexed by mask & 7 so the
// frame loop never builds a color string.
const MASK_RGB = [
	'rgb(0,0,0)', 'rgb(255,64,64)', 'rgb(64,255,96)', 'rgb(255,224,96)',
	'rgb(80,120,255)', 'rgb(255,96,224)', 'rgb(96,224,255)', 'rgb(255,255,255)'
];
const REGION = { lo: 4, hi: 10 }; // glass block bounds
const DX = [0, 1, 0, -1]; // direction vectors, same order as trace
const DY = [-1, 0, 1, 0];
const MARGIN = 0.14; // fraction of the canvas side kept free around the board

let RING_OF = null; // cell -> owning ring side, built once at bind
let canvas = null;
let ctx = null;
let view = null;
let rafId = 0;
// the shared `game` state object is owned by the composer and read here at
// call time only, so this file declares no `game` of its own.

function ringSideOf(cell) {
	if (!RING_OF) return 0;
	return RING_OF[cell];
}

function fitSide() {
	const w = window.innerWidth - 320;
	const h = window.innerHeight - 40;
	return Math.max(240, Math.min(720, Math.min(w, h)));
}

function resize() {
	const side = fitSide();
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	canvas.width = Math.round(side * dpr);
	canvas.height = Math.round(side * dpr);
	canvas.style.width = side + 'px';
	canvas.style.height = side + 'px';
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	const margin = side * MARGIN;
	const board = side - margin * 2;
	const cell = board / 15;
	view = {
		side, cell, margin, board, ox: margin, oy: margin,
		fontBadge: Math.max(8, cell * 0.3) + 'px ui-sans-serif',
		fontTag: '12px ui-sans-serif'
	};
}

// cell coordinates -> canvas pixels, all board drawing goes through these
function cellX(x) { return view.ox + (x + 0.5) * view.cell; }
function cellY(y) { return view.oy + (y + 0.5) * view.cell; }
function cellL(x) { return view.ox + x * view.cell; }
function cellT(y) { return view.oy + y * view.cell; }

function isBorder(x, y) {
	return x === 0 || x === 14 || y === 0 || y === 14;
}

function drawGrid() {
	const { cell, ox, oy, board } = view;
	ctx.strokeStyle = 'rgba(255,255,255,0.05)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let i = 0; i <= 15; i++) {
		const p = ox + i * cell;
		ctx.moveTo(p, oy); ctx.lineTo(p, oy + board);
		ctx.moveTo(ox, p); ctx.lineTo(ox + board, p);
	}
	ctx.stroke();
}

function drawReceivers(hits) {
	const { cell } = view;
	const r = cell * 0.32;
	for (let i = 0; i < 225; i++) {
		const x = i % 15, y = (i / 15) | 0;
		if (!isBorder(x, y)) continue;
		const h = hits[i];
		const cx = cellX(x), cy = cellY(y);
		ctx.globalAlpha = 1;
		ctx.fillStyle = h ? MASK_RGB[h] : '#1b1f2a';
		ctx.fillRect(cx - r / 2, cy - r / 2, r, r);
		if (!h) continue;
		ctx.globalAlpha = 0.3;
		ctx.fillStyle = MASK_RGB[h];
		ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
	}
	ctx.globalAlpha = 1;
}

function drawGlass(pose) {
	const { cell } = view;
	for (let y = REGION.lo; y <= REGION.hi; y++) {
		for (let x = REGION.lo; x <= REGION.hi; x++) {
			const i = y * 15 + x;
			const m = pose.mask[i];
			const x0 = cellL(x), y0 = cellT(y);
			ctx.globalAlpha = 1;
			ctx.fillStyle = m ? 'rgba(120,140,190,0.18)' : 'rgba(120,140,190,0.06)';
			ctx.fillRect(x0, y0, cell, cell);
			if (!m) continue;
			ctx.globalAlpha = 0.85;
			ctx.strokeStyle = MASK_RGB[m];
			ctx.lineWidth = Math.max(1.5, cell * 0.12);
			ctx.beginPath();
			if (pose.diagonal[i]) {
				ctx.moveTo(x0 + 2, y0 + 2);
				ctx.lineTo(x0 + cell - 2, y0 + cell - 2);
			} else {
				ctx.moveTo(x0 + cell - 2, y0 + 2);
				ctx.lineTo(x0 + 2, y0 + cell - 2);
			}
			ctx.stroke();
		}
	}
	ctx.globalAlpha = 1;
}

// beams grouped by exact mask so each color is one path, stroked twice
function drawBeams(segments) {
	const { cell } = view;
	for (let bits = 1; bits <= 7; bits++) {
		ctx.beginPath();
		let has = false;
		for (let i = 0; i < 225; i++) {
			const x = i % 15, y = (i / 15) | 0;
			for (let d = 0; d < 4; d++) {
				if (segments[i * 4 + d] !== bits) continue;
				const nx = x + DX[d], ny = y + DY[d];
				ctx.moveTo(cellX(x), cellY(y));
				ctx.lineTo(cellX(nx), cellY(ny));
				has = true;
			}
		}
		if (!has) continue;
		ctx.strokeStyle = MASK_RGB[bits];
		ctx.globalAlpha = 0.22;
		ctx.lineWidth = cell * 0.42;
		ctx.lineCap = 'round';
		ctx.stroke();
		ctx.globalAlpha = 1;
		ctx.lineWidth = Math.max(1, cell * 0.12);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

function drawEmitter(emitter, preview) {
	const { cell } = view;
	const x = cellX(emitter);
	const y = cellY(14);
	ctx.globalAlpha = preview ? 0.6 : 1;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(x - cell * 0.3, y - cell * 0.16, cell * 0.6, cell * 0.32);
	ctx.globalAlpha = 1;
}

function drawCheck(cx, cy, r) {
	ctx.strokeStyle = '#05060a';
	ctx.lineWidth = Math.max(1.5, r * 0.35);
	ctx.lineCap = 'round';
	ctx.beginPath();
	ctx.moveTo(cx - r * 0.5, cy);
	ctx.lineTo(cx - r * 0.1, cy + r * 0.45);
	ctx.lineTo(cx + r * 0.55, cy - r * 0.5);
	ctx.stroke();
}

function drawHints(game) {
	const contract = game.puzzle.contract;
	const statuses = game.evaluation.statuses;
	if (game.hints.targets) drawTargets(contract);
	if (game.hints.match) drawCurrentMatches(statuses);
	if (game.hints.remember) drawDiscoveries(game.discoveries);
}

function drawTargets(contract) {
	const { cell } = view;
	const r = cell * 0.16;
	ctx.lineWidth = Math.max(1.5, cell * 0.09);
	for (let i = 0; i < 225; i++) {
		const t = contract.targets[i];
		if (!t) continue;
		const x = i % 15, y = (i / 15) | 0;
		if (!isBorder(x, y)) continue;
		ctx.strokeStyle = t === 8 ? '#ffffff' : MASK_RGB[t];
		ctx.beginPath();
		ctx.arc(cellX(x), cellY(y), r, 0, Math.PI * 2);
		ctx.stroke();
	}
}

function drawCurrentMatches(statuses) {
	const { cell } = view;
	const r = cell * 0.3;
	for (let i = 0; i < 225; i++) {
		const s = statuses[i];
		if (!s) continue;
		const x = i % 15, y = (i / 15) | 0;
		if (!isBorder(x, y)) continue;
		const cx = cellX(x), cy = cellY(y);
		if (s === 2) {
			ctx.globalAlpha = 1;
			ctx.strokeStyle = '#39d98a';
			ctx.lineWidth = Math.max(2, cell * 0.12);
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.stroke();
			drawCheck(cx, cy, r * 0.6);
		} else {
			ctx.globalAlpha = 1;
			ctx.strokeStyle = '#ffb020';
			ctx.lineWidth = Math.max(1.5, cell * 0.09);
			ctx.setLineDash([cell * 0.18, cell * 0.14]);
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = '#ffb020';
			ctx.beginPath();
			ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
			ctx.fill();
		}
	}
}

function drawDiscoveries(disc) {
	const { cell, fontBadge } = view;
	const r = cell * 0.22;
	ctx.font = fontBadge;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	for (let i = 0; i < 225; i++) {
		const s = disc[i];
		if (!s) continue;
		const x = i % 15, y = (i / 15) | 0;
		if (!isBorder(x, y)) continue;
		const cx = cellX(x) + cell * 0.34;
		const cy = cellY(y) - cell * 0.34;
		ctx.globalAlpha = 0.92;
		ctx.fillStyle = s === 2 ? '#39d98a' : '#ffb020';
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = 1;
		ctx.fillStyle = '#05060a';
		ctx.fillText(s === 2 ? 'v' : '-', cx, cy);
	}
}

function drawSelection(game) {
	if (game.previewActive) return;
	const side = game.selectedRing;
	if (!side) return;
	const { cell } = view;
	const lo = (15 - side) / 2;
	const hi = lo + side - 1;
	ctx.strokeStyle = 'rgba(110,168,255,0.9)';
	ctx.lineWidth = Math.max(1.5, cell * 0.08);
	ctx.setLineDash([cell * 0.2, cell * 0.16]);
	ctx.strokeRect(cellL(lo) + cell * 0.1, cellT(lo) + cell * 0.1, (hi - lo) * cell - cell * 0.2, (hi - lo) * cell - cell * 0.2);
	ctx.setLineDash([]);
}

function drawPreviewTag() {
	ctx.globalAlpha = 1;
	ctx.fillStyle = 'rgba(110,168,255,0.95)';
	ctx.font = view.fontTag;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	ctx.fillText('preview - solution', 8, 8);
}

function drawScene(game) {
	const { side } = view;
	ctx.clearRect(0, 0, side, side);
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, side, side);
	const preview = game.previewActive;
	const pose = preview ? game.witness : game.pose;
	const emitter = preview ? game.witness.emitter : game.pose.emitter;
	const trace = preview ? game.previewTrace : game.trace;
	drawGrid();
	drawReceivers(trace.hits);
	drawGlass(pose);
	drawBeams(trace.segments);
	drawEmitter(emitter, preview);
	if (!preview) drawHints(game);
	drawSelection(game);
	if (preview) drawPreviewTag();
	drawItems(game, view);
}

function frame() {
	rafId = requestAnimationFrame(frame);
	drawScene(game);
}

function bindRender() {
	canvas = document.getElementById('canv');
	ctx = canvas.getContext('2d');
	RING_OF = new Uint8Array(225);
	for (const side of [7, 5, 3, 1]) {
		for (const cell of ringSlots(side)) RING_OF[cell] = side;
	}
	resize();
	window.addEventListener('resize', resize);
	rafId = requestAnimationFrame(frame);
}

if (typeof module !== 'undefined') module.exports = { bindRender, ringSideOf };

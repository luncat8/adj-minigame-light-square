// owns: canvas painting of pose, animated beams, receivers and hint overlays
// edit for: board visuals, dash motion, overlay shapes, sizing

const rBoard = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
const rGoal = typeof module !== 'undefined' && module.exports ? require('./contract.js') : null;
const rRim = typeof module !== 'undefined' && module.exports ? require('./rim.js') : null;

const rN = rBoard ? rBoard.BOARD_N : BOARD_N;
const rGlass = rBoard ? rBoard.GLASS : GLASS;
const rGlassOff = rBoard ? rBoard.GLASS_OFF : GLASS_OFF;
const rTileDiag = rBoard ? rBoard.TILE_DIAG : TILE_DIAG;
const rRingSide = rBoard ? rBoard.RING_SIDE : RING_SIDE;
const rAny = rGoal ? rGoal.CONTRACT_ANY : CONTRACT_ANY;
const rPartial = rGoal ? rGoal.CONTRACT_PARTIAL : CONTRACT_PARTIAL;
const rMatch = rGoal ? rGoal.CONTRACT_MATCH : CONTRACT_MATCH;
const rDrawRim = rRim ? rRim.drawRimItems : drawRimItems;

const RIM_PAD = 1.5;
const RENDER_SPAN = rN + RIM_PAD * 2;

// per-channel styles; additive composite rebuilds white from R+G+B
const CH_CORE = ['rgb(255,52,40)', 'rgb(64,255,72)', 'rgb(92,108,255)'];
const CH_GLOW = ['rgba(255,40,24,0.22)', 'rgba(40,255,40,0.22)', 'rgba(72,88,255,0.26)'];
const MASK_STYLE = [null,
	'rgb(255,96,96)', 'rgb(96,255,96)', 'rgb(255,255,96)',
	'rgb(96,96,255)', 'rgb(255,96,255)', 'rgb(96,255,255)', 'rgb(224,228,236)'];
const STEP_X = [0, 1, 0, -1];
const STEP_Y = [-1, 0, 1, 0];
const DASH_NONE = [];
const DASH_PARTIAL = [0.16, 0.12];
// 0.5-cell period divides every 1-cell step evenly, so dash phase stays continuous across turns
const DASH_BEAM = [0.2, 0.3];
const DASH_PERIOD = 0.5;
const BEAM_SPEED = 0.0018;

const BOARD_EDGE = 'rgba(150,180,255,0.1)';
const GLASS_FILL = 'rgba(150,180,255,0.06)';
const GLASS_EDGE = 'rgba(150,180,255,0.16)';
const SLOT_DIM = 'rgba(150,160,180,0.4)';
const INK = 'rgba(236,240,248,0.9)';
const INK_HALF = 'rgba(236,240,248,0.45)';
const SEL_STYLE = 'rgba(236,240,248,0.38)';
const TAU = Math.PI * 2;

let rCanv = null;
let rCtx = null;
let rCell = 0;
let rSel = -1;
const rView = { tiles: null, emitter: 0, seg: null, recv: null, overlays: null, result: null, previewing: false };
const rPt = { row: 0, col: 0 };

function rInit(root) {
	rCanv = root;
	rCtx = root.getContext('2d');
	sizeCanvas();
	if (typeof window !== 'undefined') window.addEventListener('resize', sizeCanvas);
	requestAnimationFrame(rFrame);
}

function sizeCanvas() {
	const css = rCanv.clientWidth || 600;
	const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
	const px = Math.max(1, Math.round(css * dpr));
	if (rCanv.width !== px || rCanv.height !== px) {
		rCanv.width = px;
		rCanv.height = px;
	}
	rCell = px / RENDER_SPAN;
}

function rSetView(v) {
	rView.tiles = v.tiles;
	rView.emitter = v.emitter;
	rView.seg = v.seg;
	rView.recv = v.recv;
	rView.overlays = v.overlays;
	rView.result = v.result;
	rView.previewing = v.previewing;
}

function rSelect(ring) {
	rSel = ring;
}

function rHit(x, y) {
	const rect = rCanv.getBoundingClientRect();
	const s = rect.width / RENDER_SPAN;
	const col = Math.floor((x - rect.left) / s - RIM_PAD);
	const row = Math.floor((y - rect.top) / s - RIM_PAD);
	if (row < 0 || row >= rN || col < 0 || col >= rN) return null;
	rPt.row = row;
	rPt.col = col;
	return rPt;
}

function rFrame(now) {
	paint(now || 0);
	requestAnimationFrame(rFrame);
}

// canvas.width resets ctx state, so cap/join/composite are set every paint
function paint(t) {
	if (!rView.tiles) return;
	rCtx.setTransform(1, 0, 0, 1, 0, 0);
	rCtx.globalCompositeOperation = 'source-over';
	rCtx.globalAlpha = 1;
	rCtx.lineCap = 'round';
	rCtx.lineJoin = 'round';
	rCtx.fillStyle = '#000';
	rCtx.fillRect(0, 0, rCanv.width, rCanv.height);
	const orig = rCell * RIM_PAD;
	rCtx.setTransform(rCell, 0, 0, rCell, orig, orig);
	rCtx.strokeStyle = BOARD_EDGE;
	rCtx.lineWidth = 0.04;
	rCtx.strokeRect(0.02, 0.02, rN - 0.04, rN - 0.04);
	drawGlass();
	drawBeams(t);
	drawEmitterDevice();
	drawReceivers(t);
	drawOverlays();
	if (!rView.previewing) drawSelection();
	if (rView.previewing) drawPreviewTag();
}

function drawGlass() {
	rCtx.globalCompositeOperation = 'source-over';
	rCtx.fillStyle = GLASS_FILL;
	rCtx.fillRect(rGlassOff, rGlassOff, rGlass, rGlass);
	rCtx.strokeStyle = GLASS_EDGE;
	rCtx.lineWidth = 0.06;
	rCtx.strokeRect(rGlassOff + 0.03, rGlassOff + 0.03, rGlass - 0.06, rGlass - 0.06);
	const tiles = rView.tiles;
	for (let r = 0; r < rGlass; r++) {
		for (let c = 0; c < rGlass; c++) {
			const t = tiles[r * rGlass + c];
			const mask = t & 7;
			if (!mask) continue;
			const x = rGlassOff + c;
			const y = rGlassOff + r;
			rCtx.strokeStyle = MASK_STYLE[mask];
			rCtx.lineWidth = 0.1;
			rCtx.beginPath();
			if (t & rTileDiag) {
				rCtx.moveTo(x, y);
				rCtx.lineTo(x + 1, y + 1);
			} else {
				rCtx.moveTo(x, y + 1);
				rCtx.lineTo(x + 1, y);
			}
			rCtx.stroke();
		}
	}
}

// butt caps join straddling dashes cleanly at cell centers without additive double-brightening
function drawBeams(t) {
	rCtx.globalCompositeOperation = 'lighter';
	rCtx.lineCap = 'butt';
	rCtx.setLineDash(DASH_BEAM);
	rCtx.lineDashOffset = -((t * BEAM_SPEED) % DASH_PERIOD);
	const seg = rView.seg;
	const ex = rView.emitter + 0.5;
	for (let ch = 0; ch < 3; ch++) {
		rCtx.beginPath();
		rCtx.moveTo(ex, rN - 0.5);
		rCtx.lineTo(ex, rN - 1.5);
		for (let i = 0; i < rN * rN; i++) {
			const r = (i / rN) | 0;
			const c = i - r * rN;
			const x = c + 0.5;
			const y = r + 0.5;
			for (let d = 0; d < 4; d++) {
				if (!(seg[i * 4 + d] >> ch & 1)) continue;
				rCtx.moveTo(x, y);
				rCtx.lineTo(x + STEP_X[d], y + STEP_Y[d]);
			}
		}
		rCtx.strokeStyle = CH_GLOW[ch];
		rCtx.lineWidth = 0.24;
		rCtx.stroke();
		rCtx.strokeStyle = CH_CORE[ch];
		rCtx.lineWidth = 0.075;
		rCtx.stroke();
	}
	rCtx.setLineDash(DASH_NONE);
	rCtx.lineDashOffset = 0;
	rCtx.lineCap = 'round';
}

function drawEmitterDevice() {
	const c = rView.emitter;
	rCtx.globalCompositeOperation = 'source-over';
	rCtx.fillStyle = INK;
	rCtx.beginPath();
	rCtx.arc(c + 0.5, rN - 0.5, 0.34, 0, TAU);
	rCtx.fill();
}

// one pass owns both border receiver slots and the out-of-border rim items (plan 0.6)
function drawReceivers(t) {
	const recv = rView.recv;
	rCtx.globalCompositeOperation = 'source-over';
	rCtx.strokeStyle = SLOT_DIM;
	rCtx.lineWidth = 0.05;
	for (let i = 1; i < rN - 1; i++) {
		drawSlot(0, i, recv);
		drawSlot(rN - 1, i, recv);
		drawSlot(i, 0, recv);
		drawSlot(i, rN - 1, recv);
	}
	rDrawRim(rCtx, rView.result, recv, rView.emitter, t);
}

function drawSlot(r, c, recv) {
	const x = c + 0.18;
	const y = r + 0.18;
	const bits = recv[r * rN + c];
	if (!bits) {
		rCtx.strokeRect(x, y, 0.64, 0.64);
		return;
	}
	rCtx.globalCompositeOperation = 'lighter';
	for (let ch = 0; ch < 3; ch++) {
		if (!(bits >> ch & 1)) continue;
		rCtx.fillStyle = CH_CORE[ch];
		rCtx.fillRect(x, y, 0.64, 0.64);
	}
	rCtx.globalCompositeOperation = 'source-over';
}

// shapes stay distinct: circle target, square outline for current, diamond badge for history
function drawOverlays() {
	const o = rView.overlays;
	if (!o) return;
	rCtx.globalCompositeOperation = 'source-over';
	if (o.targets) drawTargets(o.targets);
	if (o.current) drawCurrent(o.current);
	if (o.discoveries) drawDiscoveries(o.discoveries);
}

function cellXY(i) {
	rPt.row = (i / rN) | 0;
	rPt.col = i - rPt.row * rN;
}

function drawTargets(req) {
	rCtx.lineWidth = 0.07;
	for (let i = 0; i < req.length; i++) {
		const mask = req[i];
		if (!mask) continue;
		cellXY(i);
		const cx = rPt.col + 0.5;
		const cy = rPt.row + 0.5;
		rCtx.beginPath();
		rCtx.arc(cx, cy, 0.2, 0, TAU);
		if (mask === rAny) {
			rCtx.strokeStyle = INK;
			rCtx.stroke();
		} else {
			rCtx.fillStyle = MASK_STYLE[mask];
			rCtx.fill();
		}
	}
}

function drawCurrent(status) {
	rCtx.lineWidth = 0.08;
	rCtx.strokeStyle = INK;
	for (let i = 0; i < status.length; i++) {
		const s = status[i];
		if (!s) continue;
		cellXY(i);
		const c = rPt.col;
		const r = rPt.row;
		const cx = c + 0.5;
		const cy = r + 0.5;
		if (s === rMatch) {
			rCtx.strokeRect(c + 0.12, r + 0.12, 0.76, 0.76);
			rCtx.beginPath();
			rCtx.moveTo(cx - 0.14, cy + 0.02);
			rCtx.lineTo(cx - 0.03, cy + 0.12);
			rCtx.lineTo(cx + 0.16, cy - 0.12);
			rCtx.stroke();
		} else if (s === rPartial) {
			rCtx.setLineDash(DASH_PARTIAL);
			rCtx.strokeRect(c + 0.12, r + 0.12, 0.76, 0.76);
			rCtx.setLineDash(DASH_NONE);
			rCtx.beginPath();
			rCtx.arc(cx, cy, 0.12, 0, Math.PI);
			rCtx.fillStyle = INK;
			rCtx.fill();
		}
	}
}

function drawDiscoveries(disc) {
	for (let i = 0; i < disc.length; i++) {
		const s = disc[i];
		if (!s) continue;
		cellXY(i);
		const c = rPt.col;
		const r = rPt.row;
		let dx = 0;
		let dy = 0;
		if (r === 0) dy = 0.2;
		else if (r === rN - 1) dy = -0.2;
		else if (c === 0) dx = 0.2;
		else dx = -0.2;
		const bx = c + 0.5 + dx;
		const by = r + 0.5 + dy;
		rCtx.fillStyle = s === rMatch ? INK : INK_HALF;
		rCtx.beginPath();
		rCtx.moveTo(bx, by - 0.1);
		rCtx.lineTo(bx + 0.1, by);
		rCtx.lineTo(bx, by + 0.1);
		rCtx.lineTo(bx - 0.1, by);
		rCtx.fill();
	}
}

function drawSelection() {
	if (rSel < 0) return;
	rCtx.globalCompositeOperation = 'source-over';
	rCtx.strokeStyle = SEL_STYLE;
	rCtx.lineWidth = 0.08;
	if (rSel === 3) {
		rCtx.beginPath();
		rCtx.arc(rGlassOff + 3.5, rGlassOff + 3.5, 0.32, 0, TAU);
		rCtx.stroke();
		return;
	}
	const side = rRingSide[rSel];
	const off = rGlassOff + (rGlass - side) / 2;
	rCtx.strokeRect(off + 0.1, off + 0.1, side - 0.2, side - 0.2);
}

function drawPreviewTag() {
	rCtx.globalCompositeOperation = 'source-over';
	rCtx.fillStyle = INK;
	rCtx.font = 'bold 1.1px system-ui, sans-serif';
	rCtx.textAlign = 'center';
	rCtx.textBaseline = 'middle';
	rCtx.fillText('PREVIEW', 7.5, 2);
}

if (typeof module !== 'undefined') module.exports = {
	RIM_PAD,
	RENDER_SPAN,
	renderInit: rInit,
	renderView: rSetView,
	renderSetSelection: rSelect,
	renderPointToCell: rHit
};

if (typeof module === 'undefined' && typeof Skin !== 'undefined') {
	skinRegister('current', { init: rInit, view: rSetView, setSelection: rSelect, pointToCell: rHit });
}

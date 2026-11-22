// owns: the old-prototype visual style skin (radial bg, full grid, glass cells,
//       soft additive beams, diamond targets, glowing laser) on the current engine
// edit for: old-look colors, beam feel, target shapes, sizing
// adopts the out-of-border rim items (plan 0.6) via drawRimItems

const oBoard = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
const oGoal = typeof module !== 'undefined' && module.exports ? require('./contract.js') : null;
const oRim = typeof module !== 'undefined' && module.exports ? require('./rim.js') : null;

const oN = oBoard ? oBoard.BOARD_N : BOARD_N;
const oGS = oBoard ? oBoard.GLASS : GLASS;
const oGlassOff = oBoard ? oBoard.GLASS_OFF : GLASS_OFF;
const oDiag = oBoard ? oBoard.TILE_DIAG : TILE_DIAG;
const oEMin = oBoard ? oBoard.EMITTER_MIN : EMITTER_MIN;
const oEMax = oBoard ? oBoard.EMITTER_MAX : EMITTER_MAX;
const oRingSide = oBoard ? oBoard.RING_SIDE : RING_SIDE;
const oAny = oGoal ? oGoal.CONTRACT_ANY : CONTRACT_ANY;
const oMatch = oGoal ? oGoal.CONTRACT_MATCH : CONTRACT_MATCH;
const oPartial = oGoal ? oGoal.CONTRACT_PARTIAL : CONTRACT_PARTIAL;
const oDrawRim = oRim ? oRim.drawRimItems : drawRimItems;

const RIM_PAD = 1.5;
const RENDER_SPAN = oN + RIM_PAD * 2;

// per-channel styles; additive composite rebuilds white from R+G+B
const CH_CORE = ['rgb(255,52,40)', 'rgb(64,255,72)', 'rgb(92,108,255)'];
const CH_GLOW = ['rgba(255,40,24,0.22)', 'rgba(40,255,40,0.22)', 'rgba(72,88,255,0.26)'];
const MASK_STYLE = [null,
	'rgb(255,96,96)', 'rgb(96,255,96)', 'rgb(255,255,96)',
	'rgb(96,96,255)', 'rgb(255,96,255)', 'rgb(96,255,255)', 'rgb(224,228,236)'];
const STEP_X = [0, 1, 0, -1];
const STEP_Y = [-1, 0, 1, 0];
const DASH_BEAM = [0.2, 0.3];
const DASH_PERIOD = 0.5;
const BEAM_SPEED = 0.0018;

const TAU = Math.PI * 2;
const INK = 'rgba(236,240,248,0.92)';
const INK_HALF = 'rgba(236,240,248,0.45)';
const GOOD = '#7dffb0';
const PARTIAL_TONE = '#ffd45e';
const WRONG_TONE = '#ff5b5b';

let oCanv = null;
let oCtx = null;
let oCell = 0;
let oSel = -1;
const oView = { tiles: null, emitter: 0, seg: null, recv: null, overlays: null, result: null, previewing: false };
const oPt = { row: 0, col: 0 };

function oInit(root) {
	oCanv = root;
	oCtx = root.getContext('2d');
	oSize();
	if (typeof window !== 'undefined') window.addEventListener('resize', oSize);
	requestAnimationFrame(oFrame);
}

function oSize() {
	const css = oCanv.clientWidth || 600;
	const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
	const px = Math.max(1, Math.round(css * dpr));
	if (oCanv.width !== px || oCanv.height !== px) {
		oCanv.width = px;
		oCanv.height = px;
	}
	oCell = px / RENDER_SPAN;
}

function oSetView(v) {
	oView.tiles = v.tiles;
	oView.emitter = v.emitter;
	oView.seg = v.seg;
	oView.recv = v.recv;
	oView.overlays = v.overlays;
	oView.result = v.result;
	oView.previewing = v.previewing;
}

function oSelect(ring) {
	oSel = ring;
}

function oHit(x, y) {
	const rect = oCanv.getBoundingClientRect();
	const s = rect.width / RENDER_SPAN;
	const col = Math.floor((x - rect.left) / s - RIM_PAD);
	const row = Math.floor((y - rect.top) / s - RIM_PAD);
	if (row < 0 || row >= oN || col < 0 || col >= oN) return null;
	oPt.row = row;
	oPt.col = col;
	return oPt;
}

function oFrame(now) {
	oPaint(now || 0);
	requestAnimationFrame(oFrame);
}

function oPaint(t) {
	if (!oView.tiles) return;
	const ctx = oCtx;
	const w = oCanv.width;
	const h = oCanv.height;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	// old-style atmosphere: dark radial well instead of flat black
	const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.72);
	g.addColorStop(0, '#0a1020');
	g.addColorStop(1, '#030408');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, w, h);
	const orig = oCell * RIM_PAD;
	ctx.setTransform(oCell, 0, 0, oCell, orig, orig);
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	oGrid(ctx);
	oGlass(ctx, t);
	oBeams(ctx, t);
	oReceivers(ctx, t);
	oTargets(ctx);
	oCurrent(ctx);
	oDiscoveries(ctx);
	oLaser(ctx, t);
	if (!oView.previewing) oSelection(ctx);
	if (oView.previewing) oPreviewTag(ctx);
}

function oGrid(ctx) {
	ctx.globalCompositeOperation = 'source-over';
	ctx.strokeStyle = 'rgba(120,170,255,0.05)';
	ctx.lineWidth = 0.012;
	ctx.beginPath();
	for (let i = 0; i <= oN; i++) {
		const p = i;
		ctx.moveTo(p, 0);
		ctx.lineTo(p, oN);
		ctx.moveTo(0, p);
		ctx.lineTo(oN, p);
	}
	ctx.stroke();
	ctx.strokeStyle = 'rgba(120,170,255,0.12)';
	ctx.lineWidth = 0.03;
	ctx.strokeRect(0, 0, oN, oN);
}

function oGlass(ctx, t) {
	const tiles = oView.tiles;
	const pad = Math.max(0.04, 0.1);
	const size = 1 - pad * 2;
	const radius = 0.16;
	const lit = oView.seg;
	ctx.globalCompositeOperation = 'source-over';
	for (let r = 0; r < oGS; r++) {
		for (let c = 0; c < oGS; c++) {
			const tile = tiles[r * oGS + c];
			const mask = tile & 7;
			const x = oGlassOff + c;
			const y = oGlassOff + r;
			// faint socket for every glass cell
			ctx.beginPath();
			ctx.roundRect(x + pad, y + pad, size, size, radius);
			ctx.fillStyle = mask ? 'rgba(150,180,255,0.08)' : 'rgba(150,170,255,0.04)';
			ctx.fill();
			ctx.strokeStyle = 'rgba(130,190,255,0.18)';
			ctx.lineWidth = 0.03;
			ctx.stroke();
			if (mask) {
				// energized glass: a soft additive wash where light passes
				const cell = (y * oN) + x;
				let energized = false;
				for (let d = 0; d < 4; d++) if (lit[cell * 4 + d]) { energized = true; break; }
				if (energized) {
					ctx.globalCompositeOperation = 'lighter';
					ctx.fillStyle = MASK_STYLE[mask];
					ctx.globalAlpha = 0.1;
					ctx.beginPath();
					ctx.roundRect(x + pad * 0.4, y + pad * 0.4, size + pad * 0.8, size + pad * 0.8, radius);
					ctx.fill();
					ctx.globalAlpha = 1;
					ctx.globalCompositeOperation = 'source-over';
				}
				// mirror: glowing diagonal line, glow pass + crisp core
				const inset = size * 0.16;
				const diag = tile & oDiag;
				const x1 = x + pad + inset;
				const y1 = diag ? y + pad + size - inset : y + pad + inset;
				const x2 = x + pad + size - inset;
				const y2 = diag ? y + pad + inset : y + pad + size - inset;
				ctx.globalCompositeOperation = 'lighter';
				ctx.strokeStyle = MASK_STYLE[mask];
				ctx.globalAlpha = 0.16;
				ctx.lineWidth = Math.max(2, oCell * 0.18);
				ctx.beginPath();
				ctx.moveTo(x1, y1);
				ctx.lineTo(x2, y2);
				ctx.stroke();
				ctx.globalAlpha = 0.9;
				ctx.lineWidth = Math.max(1.2, oCell * 0.05);
				ctx.beginPath();
				ctx.moveTo(x1, y1);
				ctx.lineTo(x2, y2);
				ctx.stroke();
				ctx.globalAlpha = 1;
				ctx.globalCompositeOperation = 'source-over';
			}
		}
	}
}

function oBeams(ctx, t) {
	const seg = oView.seg;
	const ex = oView.emitter + 0.5;
	ctx.globalCompositeOperation = 'lighter';
	ctx.lineCap = 'butt';
	ctx.setLineDash(DASH_BEAM);
	ctx.lineDashOffset = -((t * BEAM_SPEED) % DASH_PERIOD);
	for (let ch = 0; ch < 3; ch++) {
		ctx.beginPath();
		ctx.moveTo(ex, oN - 0.5);
		ctx.lineTo(ex, oN - 1.5);
		for (let i = 0; i < oN * oN; i++) {
			const r = (i / oN) | 0;
			const c = i - r * oN;
			const x = c + 0.5;
			const y = r + 0.5;
			for (let d = 0; d < 4; d++) {
				if (!(seg[i * 4 + d] >> ch & 1)) continue;
				ctx.moveTo(x, y);
				ctx.lineTo(x + STEP_X[d], y + STEP_Y[d]);
			}
		}
		ctx.strokeStyle = CH_GLOW[ch];
		ctx.lineWidth = Math.max(2, oCell * 0.3);
		ctx.globalAlpha = 0.12;
		ctx.stroke();
		ctx.strokeStyle = CH_CORE[ch];
		ctx.lineWidth = Math.max(1.4, oCell * 0.1);
		ctx.globalAlpha = 0.4;
		ctx.stroke();
		ctx.lineWidth = Math.max(0.9, oCell * 0.035);
		ctx.globalAlpha = 0.95;
		ctx.stroke();
	}
	ctx.setLineDash([]);
	ctx.lineDashOffset = 0;
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-over';
}

function oReceivers(ctx, t) {
	const recv = oView.recv;
	ctx.globalCompositeOperation = 'source-over';
	ctx.strokeStyle = 'rgba(150,160,180,0.4)';
	ctx.lineWidth = 0.05;
	for (let i = 1; i < oN - 1; i++) {
		oSlot(ctx, 0, i, recv);
		oSlot(ctx, oN - 1, i, recv);
		oSlot(ctx, i, 0, recv);
		oSlot(ctx, i, oN - 1, recv);
	}
	// out-of-border rim items adopted from the current engine (plan 0.6)
	oDrawRim(ctx, oView.result, recv, oView.emitter, t);
}

function oSlot(ctx, r, c, recv) {
	const x = c + 0.18;
	const y = r + 0.18;
	const bits = recv[r * oN + c];
	if (!bits) {
		ctx.strokeRect(x, y, 0.64, 0.64);
		return;
	}
	ctx.globalCompositeOperation = 'lighter';
	for (let ch = 0; ch < 3; ch++) {
		if (!(bits >> ch & 1)) continue;
		ctx.fillStyle = CH_CORE[ch];
		ctx.fillRect(x, y, 0.64, 0.64);
	}
	ctx.globalCompositeOperation = 'source-over';
}

function oCellXY(i) {
	oPt.row = (i / oN) | 0;
	oPt.col = i - oPt.row * oN;
}

// diamond targets, filled for exact color, outlined for any-color
function oTargets(ctx) {
	const o = oView.overlays;
	if (!o || !o.targets) return;
	ctx.globalCompositeOperation = 'source-over';
	const r = Math.max(2.5, oCell * 0.12);
	for (let i = 0; i < o.targets.length; i++) {
		const mask = o.targets[i];
		if (!mask) continue;
		oCellXY(i);
		const cx = oPt.col + 0.5;
		const cy = oPt.row + 0.5;
		ctx.beginPath();
		ctx.moveTo(cx, cy - r);
		ctx.lineTo(cx + r, cy);
		ctx.lineTo(cx, cy + r);
		ctx.lineTo(cx - r, cy);
		ctx.closePath();
		if (mask === oAny) {
			ctx.strokeStyle = INK;
			ctx.lineWidth = 0.05;
			ctx.stroke();
		} else {
			ctx.fillStyle = MASK_STYLE[mask];
			ctx.globalAlpha = 0.9;
			ctx.fill();
			ctx.globalAlpha = 1;
		}
	}
}

// current-match check / partial dash drawn inside the target diamond
function oCurrent(ctx) {
	const o = oView.overlays;
	if (!o || !o.current) return;
	ctx.globalCompositeOperation = 'source-over';
	const r = Math.max(2.5, oCell * 0.12);
	for (let i = 0; i < o.current.length; i++) {
		const s = o.current[i];
		if (!s) continue;
		oCellXY(i);
		const cx = oPt.col + 0.5;
		const cy = oPt.row + 0.5;
		if (s === oMatch) {
			ctx.strokeStyle = GOOD;
			ctx.lineWidth = Math.max(1.4, oCell * 0.045);
			ctx.beginPath();
			ctx.moveTo(cx - r * 0.45, cy + r * 0.05);
			ctx.lineTo(cx - r * 0.08, cy + r * 0.42);
			ctx.lineTo(cx + r * 0.52, cy - r * 0.42);
			ctx.stroke();
		} else if (s === oPartial) {
			ctx.strokeStyle = PARTIAL_TONE;
			ctx.setLineDash([0.12, 0.1]);
			ctx.lineWidth = Math.max(1.2, oCell * 0.04);
			ctx.strokeRect(oPt.col + 0.18, oPt.row + 0.18, 0.64, 0.64);
			ctx.setLineDash([]);
			ctx.beginPath();
			ctx.arc(cx, cy, r * 0.5, Math.PI, 0);
			ctx.lineWidth = Math.max(1, oCell * 0.03);
			ctx.fillStyle = PARTIAL_TONE;
			ctx.fill();
		}
	}
}

function oDiscoveries(ctx) {
	const o = oView.overlays;
	if (!o || !o.discoveries) return;
	ctx.globalCompositeOperation = 'source-over';
	const dot = Math.max(1.4, oCell * 0.05);
	for (let i = 0; i < o.discoveries.length; i++) {
		const s = o.discoveries[i];
		if (!s) continue;
		oCellXY(i);
		let dx = 0;
		let dy = 0;
		if (oPt.row === 0) dy = 0.2;
		else if (oPt.row === oN - 1) dy = -0.2;
		else if (oPt.col === 0) dx = 0.2;
		else dx = -0.2;
		ctx.fillStyle = s === oMatch ? INK : INK_HALF;
		ctx.beginPath();
		ctx.arc(oPt.col + 0.5 + dx, oPt.row + 0.5 + dy, dot, 0, TAU);
		ctx.fill();
	}
}

// old-style emitter: glowing capsule on the bottom border with an upward lance
function oLaser(ctx, t) {
	const e = oView.emitter;
	const x = e + 0.5;
	const y = oN - 0.5;
	const w = Math.max(2, oCell * 0.18);
	ctx.globalCompositeOperation = 'lighter';
	const pulse = 0.85 + 0.15 * Math.sin(t * 0.005);
	ctx.fillStyle = 'rgba(255,255,255,0.20)';
	ctx.beginPath();
	ctx.roundRect(x - w * 1.6, y - w * 0.5, w * 3.2, w, w * 0.5);
	ctx.fill();
	ctx.globalAlpha = pulse;
	ctx.fillStyle = '#ffffff';
	ctx.beginPath();
	ctx.roundRect(x - w * 0.9, y - w * 0.28, w * 1.8, w * 0.56, w * 0.28);
	ctx.fill();
	ctx.beginPath();
	ctx.moveTo(x - w * 0.5, y - w * 0.2);
	ctx.lineTo(x + w * 0.5, y - w * 0.2);
	ctx.lineTo(x, y - w * 1.8);
	ctx.closePath();
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-over';
}

function oSelection(ctx) {
	if (oSel < 0) return;
	ctx.globalCompositeOperation = 'source-over';
	ctx.strokeStyle = 'rgba(236,240,248,0.4)';
	ctx.lineWidth = 0.06;
	if (oSel === 3) {
		ctx.beginPath();
		ctx.arc(oGlassOff + 3.5, oGlassOff + 3.5, 0.34, 0, TAU);
		ctx.stroke();
		return;
	}
	const side = oRingSide[oSel];
	const off = oGlassOff + (oGS - side) / 2;
	ctx.strokeRect(off + 0.08, off + 0.08, side - 0.16, side - 0.16);
}

function oPreviewTag(ctx) {
	ctx.globalCompositeOperation = 'source-over';
	ctx.fillStyle = INK;
	ctx.font = 'bold 1.1px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('PREVIEW', 7.5, 2);
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { RIM_PAD, RENDER_SPAN, renderInit: oInit, renderView: oSetView, renderSetSelection: oSelect, renderPointToCell: oHit };
}

if (typeof module === 'undefined' && typeof Skin !== 'undefined') {
	skinRegister('old', { init: oInit, view: oSetView, setSelection: oSelect, pointToCell: oHit });
}

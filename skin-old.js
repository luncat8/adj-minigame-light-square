// owns: the old-prototype visual style skin (radial bg, full grid, glass cells,
//       solid additive beams, diamond targets, glowing laser) on the current engine
// edit for: old-look colors, beam feel, target shapes, sizing
// adopts the out-of-border rim items (plan 0.6) via drawRimItems

const oBoard = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
const oGoal = typeof module !== 'undefined' && module.exports ? require('./contract.js') : null;
const oRim = typeof module !== 'undefined' && module.exports ? require('./rim.js') : null;

const oN = oBoard ? oBoard.BOARD_N : BOARD_N;
const oGS = oBoard ? oBoard.GLASS : GLASS;
const oGlassOff = oBoard ? oBoard.GLASS_OFF : GLASS_OFF;
const oDiag = oBoard ? oBoard.TILE_DIAG : TILE_DIAG;
const oRingSide = oBoard ? oBoard.RING_SIDE : RING_SIDE;
const oAny = oGoal ? oGoal.CONTRACT_ANY : CONTRACT_ANY;
const oMatch = oGoal ? oGoal.CONTRACT_MATCH : CONTRACT_MATCH;
const oPartial = oGoal ? oGoal.CONTRACT_PARTIAL : CONTRACT_PARTIAL;
const oDrawRim = oRim ? oRim.drawRimItems : drawRimItems;

const RIM_PAD = 1.5;
const RENDER_SPAN = oN + RIM_PAD * 2;

// old prototype palette and proportions (f286079 js/render.js), expressed in cell units
const OLD_BG0 = '#0a1020';
const OLD_BG1 = '#030408';
const OLD_GRID = 'rgba(120,170,255,0.055)';
const OLD_GRID_EDGE = 'rgba(120,170,255,0.12)';
const OLD_BORDER_FILL = '#0a0f1a';
const OLD_BORDER_EDGE = 'rgba(130,170,255,0.2)';
const OLD_GLASS_FILL = 'rgba(80,140,220,0.08)';
const OLD_GLASS_EDGE = 'rgba(130,190,255,0.22)';
const OLD_SLOT = 'rgba(150,160,180,0.4)';

// per-channel styles; additive composite rebuilds white from R+G+B
const CH_CORE = ['rgb(255,52,40)', 'rgb(64,255,72)', 'rgb(92,108,255)'];
const MASK_STYLE = [null,
	'rgb(255,96,96)', 'rgb(96,255,96)', 'rgb(255,255,96)',
	'rgb(96,96,255)', 'rgb(255,96,255)', 'rgb(96,255,255)', 'rgb(224,228,236)'];
const STEP_X = [0, 1, 0, -1];
const STEP_Y = [-1, 0, 1, 0];

const TAU = Math.PI * 2;
const INK = 'rgba(236,240,248,0.9)';
const INK_HALF = 'rgba(236,240,248,0.45)';
const SEL_STYLE = 'rgba(236,240,248,0.38)';
const CHECK_DARK = '#04110a';

let oCanv = null;
let oCtx = null;
let oCell = 0;
let oBg = null;
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
	// old-style atmosphere: dark radial well instead of flat black
	oBg = null;
	const g = oCtx.createRadialGradient(px * 0.5, px * 0.45, 0, px * 0.5, px * 0.45, Math.max(px, px) * 0.72);
	if (g && g.addColorStop) {
		g.addColorStop(0, OLD_BG0);
		g.addColorStop(1, OLD_BG1);
		oBg = g;
	}
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
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.fillStyle = oBg || OLD_BG1;
	ctx.fillRect(0, 0, oCanv.width, oCanv.height);
	const orig = oCell * RIM_PAD;
	ctx.setTransform(oCell, 0, 0, oCell, orig, orig);
	oGrid(ctx);
	oGlass(ctx);
	oReceivers(ctx, t);
	oBeams(ctx);
	oLaser(ctx);
	oTargets(ctx);
	oCurrent(ctx);
	oDiscoveries(ctx);
	if (!oView.previewing) oSelection(ctx);
	if (oView.previewing) oPreviewTag(ctx);
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-over';
}

function oGrid(ctx) {
	ctx.globalCompositeOperation = 'source-over';
	ctx.strokeStyle = OLD_GRID;
	ctx.lineWidth = 0.04;
	ctx.beginPath();
	for (let i = 0; i <= oN; i++) {
		ctx.moveTo(i, 0);
		ctx.lineTo(i, oN);
		ctx.moveTo(0, i);
		ctx.lineTo(oN, i);
	}
	ctx.stroke();
	ctx.strokeStyle = OLD_GRID_EDGE;
	ctx.lineWidth = 0.06;
	ctx.strokeRect(0.02, 0.02, oN - 0.04, oN - 0.04);
}

// rounded per-cell glass: dark border ring, lit glass, glowing mirror diagonals
function oGlass(ctx) {
	const tiles = oView.tiles;
	const lit = oView.seg;
	const pad = 0.06;
	const size = 1 - pad * 2;
	const radius = 0.14;
	ctx.globalCompositeOperation = 'source-over';
	for (let r = 0; r < oN; r++) {
		for (let c = 0; c < oN; c++) {
			const border = r === 0 || c === 0 || r === oN - 1 || c === oN - 1;
			const x = c;
			const y = r;
			ctx.beginPath();
			ctx.roundRect(x + pad, y + pad, size, size, radius);
			ctx.fillStyle = border ? OLD_BORDER_FILL : OLD_GLASS_FILL;
			ctx.fill();
			ctx.strokeStyle = border ? OLD_BORDER_EDGE : OLD_GLASS_EDGE;
			ctx.lineWidth = 0.05;
			ctx.stroke();
			if (border) continue;
			if (r < oGlassOff || r >= oGlassOff + oGS || c < oGlassOff || c >= oGlassOff + oGS) continue;
			const tile = tiles[(r - oGlassOff) * oGS + (c - oGlassOff)];
			const mask = tile & 7;
			if (!mask) continue;
			// energized glass: a soft additive wash where light passes
			const cell = r * oN + c;
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
			const x1 = x + pad + inset;
			const y1 = tile & oDiag ? y + pad + inset : y + pad + size - inset;
			const x2 = x + pad + size - inset;
			const y2 = tile & oDiag ? y + pad + size - inset : y + pad + inset;
			ctx.globalCompositeOperation = 'lighter';
			ctx.strokeStyle = MASK_STYLE[mask];
			ctx.globalAlpha = 0.16;
			ctx.lineWidth = 0.18;
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();
			ctx.globalAlpha = 0.9;
			ctx.lineWidth = 0.055;
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();
			ctx.globalAlpha = 1;
			ctx.globalCompositeOperation = 'source-over';
		}
	}
}

// solid additive beams: wide glow, mid pass, thin core, per channel
function oBeams(ctx) {
	const seg = oView.seg;
	if (!seg) return;
	const ex = oView.emitter + 0.5;
	ctx.globalCompositeOperation = 'lighter';
	ctx.lineCap = 'round';
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
		ctx.strokeStyle = CH_CORE[ch];
		ctx.globalAlpha = 0.12;
		ctx.lineWidth = 0.34;
		ctx.stroke();
		ctx.globalAlpha = 0.34;
		ctx.lineWidth = 0.12;
		ctx.stroke();
		ctx.globalAlpha = 0.95;
		ctx.lineWidth = 0.035;
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-over';
}

function oReceivers(ctx, t) {
	const recv = oView.recv;
	if (!recv) return;
	ctx.globalCompositeOperation = 'source-over';
	ctx.strokeStyle = OLD_SLOT;
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
	ctx.beginPath();
	ctx.roundRect(x, y, 0.64, 0.64, 0.1);
	if (!bits) {
		ctx.stroke();
		return;
	}
	ctx.globalCompositeOperation = 'lighter';
	for (let ch = 0; ch < 3; ch++) {
		if (!(bits >> ch & 1)) continue;
		ctx.fillStyle = CH_CORE[ch];
		ctx.fill();
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
	const r = 0.2;
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
			ctx.lineWidth = 0.07;
			ctx.stroke();
		} else {
			ctx.fillStyle = MASK_STYLE[mask];
			ctx.fill();
		}
	}
}

// current-match check / partial badge drawn inside the target diamond
function oCurrent(ctx) {
	const o = oView.overlays;
	if (!o || !o.current) return;
	ctx.globalCompositeOperation = 'source-over';
	for (let i = 0; i < o.current.length; i++) {
		const s = o.current[i];
		if (!s) continue;
		oCellXY(i);
		const c = oPt.col;
		const r = oPt.row;
		const cx = c + 0.5;
		const cy = r + 0.5;
		if (s === oMatch) {
			ctx.fillStyle = INK;
			ctx.beginPath();
			ctx.roundRect(c + 0.12, r + 0.12, 0.76, 0.76, 0.1);
			ctx.fill();
			ctx.strokeStyle = CHECK_DARK;
			ctx.lineWidth = 0.06;
			ctx.beginPath();
			ctx.moveTo(cx - 0.14, cy + 0.02);
			ctx.lineTo(cx - 0.03, cy + 0.12);
			ctx.lineTo(cx + 0.16, cy - 0.12);
			ctx.stroke();
		} else if (s === oPartial) {
			ctx.strokeStyle = INK;
			ctx.lineWidth = 0.07;
			ctx.beginPath();
			ctx.roundRect(c + 0.12, r + 0.12, 0.76, 0.76, 0.1);
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(cx, cy, 0.12, 0, Math.PI);
			ctx.fillStyle = INK;
			ctx.fill();
		}
	}
}

function oDiscoveries(ctx) {
	const o = oView.overlays;
	if (!o || !o.discoveries) return;
	const dot = 0.08;
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
function oLaser(ctx) {
	const e = oView.emitter;
	const x = e + 0.12;
	const width = 0.76;
	const y = oN - 0.5;
	const h = 0.16;
	ctx.globalCompositeOperation = 'lighter';
	ctx.fillStyle = '#ffffff';
	ctx.globalAlpha = 0.22;
	ctx.beginPath();
	ctx.roundRect(x, y - h * 0.5, width, h, h * 0.5);
	ctx.fill();
	ctx.globalAlpha = 0.95;
	ctx.beginPath();
	ctx.roundRect(x + width * 0.08, y - h * 0.18, width * 0.84, h * 0.36, h * 0.18);
	ctx.fill();
	ctx.globalAlpha = 0.8;
	ctx.beginPath();
	ctx.moveTo(x + width * 0.5, y - 0.34);
	ctx.lineTo(x + width * 0.32, y - h * 0.2);
	ctx.lineTo(x + width * 0.68, y - h * 0.2);
	ctx.closePath();
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-over';
}

function oSelection(ctx) {
	if (oSel < 0) return;
	ctx.globalCompositeOperation = 'source-over';
	ctx.strokeStyle = SEL_STYLE;
	ctx.lineWidth = 0.08;
	if (oSel === 3) {
		ctx.beginPath();
		ctx.arc(oGlassOff + 3.5, oGlassOff + 3.5, 0.32, 0, TAU);
		ctx.stroke();
		return;
	}
	const side = oRingSide[oSel];
	const off = oGlassOff + (oGS - side) / 2;
	ctx.beginPath();
	ctx.roundRect(off + 0.1, off + 0.1, side - 0.2, side - 0.2, 0.08);
	ctx.stroke();
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
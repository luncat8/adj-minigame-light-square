// owns: the prototype render skin — rounded glass, additive solid beams, diamond targets
// edit for: prototype skin visuals, beam glow, overlay shapes, sizing (skins.js dispatches the active skin)
// shares the rim coordinate space and items with the glass skin, so both skins draw rim.js in the same margin

const aBoard = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
const aGoal = typeof module !== 'undefined' && module.exports ? require('./contract.js') : null;
const aRim = typeof module !== 'undefined' && module.exports ? require('./rim.js') : null;

const aN = aBoard ? aBoard.BOARD_N : BOARD_N;
const aGlass = aBoard ? aBoard.GLASS : GLASS;
const aGlassOff = aBoard ? aBoard.GLASS_OFF : GLASS_OFF;
const aDiag = aBoard ? aBoard.TILE_DIAG : TILE_DIAG;
const aSide = aBoard ? aBoard.RING_SIDE : RING_SIDE;
const aAny = aGoal ? aGoal.CONTRACT_ANY : CONTRACT_ANY;
const aDrawRim = aRim ? aRim.drawRimItems : drawRimItems;

// rim coordinate space; must match render.js RIM_PAD so items land in the same margin
const aRimPad = 1.5;
const aSpan = aN + aRimPad * 2;

const aBg0 = '#0a1020';
const aBg1 = '#030408';
const aGrid = 'rgba(120,170,255,0.055)';
const aGridEdge = 'rgba(120,170,255,0.12)';
const aBorderFill = '#0a0f1a';
const aBorderEdge = 'rgba(130,170,255,0.2)';
const aGlassFill = 'rgba(80,140,220,0.08)';
const aGlassEdge = 'rgba(130,190,255,0.22)';
const aSlotDim = 'rgba(150,160,180,0.4)';
const aInk = 'rgba(236,240,248,0.9)';
const aInkHalf = 'rgba(236,240,248,0.45)';
const aSel = 'rgba(236,240,248,0.38)';
const aChannel = ['rgb(255,52,40)', 'rgb(64,255,72)', 'rgb(92,108,255)'];
const aMask = [null,
	'rgb(255,96,96)', 'rgb(96,255,96)', 'rgb(255,255,96)',
	'rgb(96,96,255)', 'rgb(255,96,255)', 'rgb(96,255,255)', 'rgb(224,228,236)'];
const aStepX = [0, 1, 0, -1];
const aStepY = [-1, 0, 1, 0];
const aTa = Math.PI * 2;
// thin-core ray styles pushed by skins.js (0 lines, 1 fast long dashes, 2 short); glow passes stay solid as in the prototype
const aRayStyles = [
	{ dash: null, period: 0, speed: 0 },
	{ dash: [0.35, 0.15], period: 0.5, speed: 0.0045 },
	{ dash: [0.2, 0.3], period: 0.5, speed: 0.0018 }
];

let aCanv = null;
let aCtx = null;
let aCell = 0;
let aSelRing = -1;
let aRay = 2;
let aRaf = 0;
let aResize = null;
let aBg = null;
const aView = { tiles: null, emitter: 0, seg: null, recv: null, overlays: null, result: null, previewing: false };
const aPt = { row: 0, col: 0 };

function renderAltInit(root) {
	aCanv = root;
	aCtx = root.getContext('2d');
	sizeAlt();
	if (typeof window !== 'undefined') {
		aResize = sizeAlt;
		window.addEventListener('resize', aResize);
	}
	aRaf = requestAnimationFrame(aFrame);
}

function renderAltStop() {
	if (typeof window !== 'undefined' && aResize) window.removeEventListener('resize', aResize);
	if (aRaf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(aRaf);
	aRaf = 0;
	aResize = null;
}

function renderAltView(v) {
	aView.tiles = v.tiles;
	aView.emitter = v.emitter;
	aView.seg = v.seg;
	aView.recv = v.recv;
	aView.overlays = v.overlays;
	aView.result = v.result;
	aView.previewing = v.previewing;
}

function renderAltSetSelection(ring) {
	aSelRing = ring;
}

function renderAltSetRay(i) {
	aRay = i;
}

function renderAltPointToCell(x, y) {
	const rect = aCanv.getBoundingClientRect();
	const s = rect.width / aSpan;
	const col = Math.floor((x - rect.left) / s - aRimPad);
	const row = Math.floor((y - rect.top) / s - aRimPad);
	if (row < 0 || row >= aN || col < 0 || col >= aN) return null;
	aPt.row = row;
	aPt.col = col;
	return aPt;
}

function sizeAlt() {
	const css = aCanv.clientWidth || 600;
	const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
	const px = Math.max(1, Math.round(css * dpr));
	if (aCanv.width !== px || aCanv.height !== px) {
		aCanv.width = px;
		aCanv.height = px;
	}
	aCell = px / aSpan;
	aBg = null;
	const grad = aCtx.createRadialGradient(px * 0.5, px * 0.45, 0, px * 0.5, px * 0.45, Math.max(px, px) * 0.7);
	if (grad && grad.addColorStop) {
		grad.addColorStop(0, aBg0);
		grad.addColorStop(1, aBg1);
		aBg = grad;
	}
}

function aFrame(now) {
	paintAlt(now || 0);
	requestAnimationFrame(aFrame);
}

function paintAlt(t) {
	if (!aView.tiles) return;
	const ctx = aCtx;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.fillStyle = aBg || aBg1;
	ctx.fillRect(0, 0, aCanv.width, aCanv.height);
	const orig = aCell * aRimPad;
	ctx.setTransform(aCell, 0, 0, aCell, orig, orig);
	drawAltGrid(ctx);
	drawAltGlass(ctx);
	drawAltReceivers(ctx);
	aDrawRim(ctx, aView.result, aView.recv, aView.emitter, t);
	drawAltBeams(ctx, t);
	drawAltLaser(ctx);
	drawAltOverlays(ctx);
	if (!aView.previewing) drawAltSelection(ctx);
	if (aView.previewing) drawAltPreviewTag(ctx);
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-over';
}

function drawAltGrid(ctx) {
	const size = aN;
	ctx.strokeStyle = aGrid;
	ctx.lineWidth = 0.04;
	ctx.beginPath();
	for (let i = 0; i <= size; i++) {
		ctx.moveTo(i, 0);
		ctx.lineTo(i, size);
		ctx.moveTo(0, i);
		ctx.lineTo(size, i);
	}
	ctx.stroke();
	ctx.strokeStyle = aGridEdge;
	ctx.lineWidth = 0.06;
	ctx.strokeRect(0.02, 0.02, size - 0.04, size - 0.04);
}

function drawAltGlass(ctx) {
	const tiles = aView.tiles;
	const seg = aView.seg;
	const recv = aView.recv;
	const pad = 0.06;
	const size = 1 - pad * 2;
	const radius = 0.14;
	for (let r = 0; r < aN; r++) {
		for (let c = 0; c < aN; c++) {
			const border = r === 0 || c === 0 || r === aN - 1 || c === aN - 1;
			const x = c;
			const y = r;
			ctx.beginPath();
			ctx.roundRect(x + pad, y + pad, size, size, radius);
			if (border) {
				ctx.fillStyle = aBorderFill;
			} else {
				ctx.fillStyle = aGlassFill;
			}
			ctx.fill();
			ctx.strokeStyle = border ? aBorderEdge : aGlassEdge;
			ctx.lineWidth = 0.05;
			ctx.stroke();
			const i = r * aN + c;
			let lit = 0;
			if (border) {
				lit = recv[i];
			} else {
				const k = i * 4;
				lit = seg[k] | seg[k + 1] | seg[k + 2] | seg[k + 3];
			}
			if (lit) {
				// whole-cell glow under the beam, ported from the prototype drawCells
				ctx.globalCompositeOperation = 'lighter';
				ctx.fillStyle = aMask[lit];
				ctx.globalAlpha = border ? 0.24 : 0.1;
				ctx.beginPath();
				ctx.roundRect(x + pad * 0.4, y + pad * 0.4, 1 - pad * 0.8, 1 - pad * 0.8, radius);
				ctx.fill();
				ctx.globalAlpha = 1;
				ctx.globalCompositeOperation = 'source-over';
			}
			if (border) continue;
			if (r < aGlassOff || r >= aGlassOff + aGlass || c < aGlassOff || c >= aGlassOff + aGlass) continue;
			const t = tiles[(r - aGlassOff) * aGlass + (c - aGlassOff)];
			const mask = t & 7;
			if (!mask) continue;
			const inset = size * 0.16;
			let x1 = x + pad + inset;
			let y1 = y + pad + size - inset;
			let x2 = x + pad + size - inset;
			let y2 = y + pad + inset;
			if (t & aDiag) {
				y1 = y + pad + inset;
				y2 = y + pad + size - inset;
			}
			ctx.globalCompositeOperation = 'lighter';
			ctx.strokeStyle = aMask[mask];
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

// solid additive beams: wide glow, mid pass, thin core, per channel; the ray style drives only the thin core
function drawAltBeams(ctx, t) {
	const seg = aView.seg;
	if (!seg) return;
	const ex = aView.emitter + 0.5;
	const style = aRayStyles[aRay];
	ctx.globalCompositeOperation = 'lighter';
	for (let ch = 0; ch < 3; ch++) {
		ctx.beginPath();
		ctx.moveTo(ex, aN - 0.5);
		ctx.lineTo(ex, aN - 1.5);
		for (let i = 0; i < aN * aN; i++) {
			const r = (i / aN) | 0;
			const c = i - r * aN;
			const x = c + 0.5;
			const y = r + 0.5;
			for (let d = 0; d < 4; d++) {
				if (!(seg[i * 4 + d] >> ch & 1)) continue;
				ctx.moveTo(x, y);
				ctx.lineTo(x + aStepX[d], y + aStepY[d]);
			}
		}
		ctx.strokeStyle = aChannel[ch];
		ctx.globalAlpha = 0.12;
		ctx.lineWidth = 0.34;
		ctx.stroke();
		ctx.globalAlpha = 0.34;
		ctx.lineWidth = 0.12;
		ctx.stroke();
		if (style.dash) {
			ctx.setLineDash(style.dash);
			ctx.lineDashOffset = -((t * style.speed) % style.period);
		}
		ctx.globalAlpha = 0.95;
		ctx.lineWidth = 0.035;
		ctx.stroke();
		if (style.dash) {
			ctx.setLineDash([]);
			ctx.lineDashOffset = 0;
		}
	}
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-over';
}

function drawAltReceivers(ctx) {
	const recv = aView.recv;
	if (!recv) return;
	ctx.strokeStyle = aSlotDim;
	ctx.lineWidth = 0.05;
	for (let i = 1; i < aN - 1; i++) {
		drawAltSlot(ctx, 0, i, recv);
		drawAltSlot(ctx, aN - 1, i, recv);
		drawAltSlot(ctx, i, 0, recv);
		drawAltSlot(ctx, i, aN - 1, recv);
	}
}

function drawAltSlot(ctx, r, c, recv) {
	const x = c + 0.18;
	const y = r + 0.18;
	const bits = recv[r * aN + c];
	ctx.beginPath();
	ctx.roundRect(x, y, 0.64, 0.64, 0.1);
	if (!bits) {
		ctx.stroke();
		return;
	}
	ctx.globalCompositeOperation = 'lighter';
	for (let ch = 0; ch < 3; ch++) {
		if (!(bits >> ch & 1)) continue;
		ctx.fillStyle = aChannel[ch];
		ctx.fill();
	}
	ctx.globalCompositeOperation = 'source-over';
}

function drawAltLaser(ctx) {
	const w = 0.16;
	const start = aView.emitter;
	const x = start + 0.12;
	const width = 0.76;
	const y = aN - 0.5;
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

// shapes carry the meaning: diamond target, square current, dot discovery
function drawAltOverlays(ctx) {
	const o = aView.overlays;
	if (!o) return;
	ctx.globalCompositeOperation = 'source-over';
	if (o.targets) drawAltTargets(ctx, o.targets);
	if (o.current) drawAltCurrent(ctx, o.current);
	if (o.discoveries) drawAltDiscoveries(ctx, o.discoveries);
}

function altCell(i) {
	aPt.row = (i / aN) | 0;
	aPt.col = i - aPt.row * aN;
}

function drawAltTargets(ctx, req) {
	ctx.lineWidth = 0.07;
	for (let i = 0; i < req.length; i++) {
		const mask = req[i];
		if (!mask) continue;
		altCell(i);
		const cx = aPt.col + 0.5;
		const cy = aPt.row + 0.5;
		const r = 0.2;
		ctx.beginPath();
		ctx.moveTo(cx, cy - r);
		ctx.lineTo(cx + r, cy);
		ctx.lineTo(cx, cy + r);
		ctx.lineTo(cx - r, cy);
		ctx.closePath();
		if (mask === aAny) {
			ctx.strokeStyle = aInk;
			ctx.stroke();
		} else {
			ctx.fillStyle = aMask[mask];
			ctx.fill();
		}
	}
}

function drawAltCurrent(ctx, status) {
	ctx.lineWidth = 0.08;
	ctx.strokeStyle = aInk;
	for (let i = 0; i < status.length; i++) {
		const s = status[i];
		if (!s) continue;
		altCell(i);
		const c = aPt.col;
		const r = aPt.row;
		const cx = c + 0.5;
		const cy = r + 0.5;
		if (s === 2) {
			ctx.beginPath();
			ctx.roundRect(c + 0.12, r + 0.12, 0.76, 0.76, 0.1);
			ctx.fillStyle = aInk;
			ctx.fill();
			ctx.strokeStyle = '#04110a';
			ctx.beginPath();
			ctx.moveTo(cx - 0.14, cy + 0.02);
			ctx.lineTo(cx - 0.03, cy + 0.12);
			ctx.lineTo(cx + 0.16, cy - 0.12);
			ctx.stroke();
		} else if (s === 1) {
			ctx.beginPath();
			ctx.roundRect(c + 0.12, r + 0.12, 0.76, 0.76, 0.1);
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(cx, cy, 0.12, 0, Math.PI);
			ctx.fillStyle = aInk;
			ctx.fill();
		}
	}
}

function drawAltDiscoveries(ctx, disc) {
	for (let i = 0; i < disc.length; i++) {
		const s = disc[i];
		if (!s) continue;
		altCell(i);
		const c = aPt.col;
		const r = aPt.row;
		let dx = 0;
		let dy = 0;
		if (r === 0) dy = 0.2;
		else if (r === aN - 1) dy = -0.2;
		else if (c === 0) dx = 0.2;
		else dx = -0.2;
		const bx = c + 0.5 + dx;
		const by = r + 0.5 + dy;
		ctx.fillStyle = s === 2 ? aInk : aInkHalf;
		ctx.beginPath();
		ctx.arc(bx, by, 0.08, 0, aTa);
		ctx.fill();
	}
}

function drawAltSelection(ctx) {
	if (aSelRing < 0) return;
	ctx.globalCompositeOperation = 'source-over';
	ctx.strokeStyle = aSel;
	ctx.lineWidth = 0.08;
	if (aSelRing === 3) {
		ctx.beginPath();
		ctx.arc(aGlassOff + 3.5, aGlassOff + 3.5, 0.32, 0, aTa);
		ctx.stroke();
		return;
	}
	const side = aSide[aSelRing];
	const off = aGlassOff + (aGlass - side) / 2;
	ctx.beginPath();
	ctx.roundRect(off + 0.1, off + 0.1, side - 0.2, side - 0.2, 0.08);
	ctx.stroke();
}

function drawAltPreviewTag(ctx) {
	ctx.globalCompositeOperation = 'source-over';
	ctx.fillStyle = aInk;
	ctx.font = 'bold 1.1px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('PREVIEW', 7.5, 2);
}

if (typeof module !== 'undefined') module.exports = {
	aRimPad,
	aSpan,
	renderAltInit,
	renderAltStop,
	renderAltView,
	renderAltSetSelection,
	renderAltSetRay,
	renderAltPointToCell
};

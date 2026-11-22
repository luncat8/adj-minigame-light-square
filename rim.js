// owns: out-of-border rim items (boiler, lamp, neon billboard, crystal, detector, power cell, emitter rail) and receiver-to-item wiring
// edit for: rim item visuals, animations, wiring and contract-state reactions

const mBoard = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
const mGoal = typeof module !== 'undefined' && module.exports ? require('./contract.js') : null;

const mN = mBoard ? mBoard.BOARD_N : BOARD_N;
const mEMin = mBoard ? mBoard.EMITTER_MIN : EMITTER_MIN;
const mEMax = mBoard ? mBoard.EMITTER_MAX : EMITTER_MAX;
const mPartial = mGoal ? mGoal.CONTRACT_PARTIAL : CONTRACT_PARTIAL;
const mMatch = mGoal ? mGoal.CONTRACT_MATCH : CONTRACT_MATCH;
const mContractState = mGoal ? mGoal.contractState : contractState;

const RIM_CH = ['rgb(255,52,40)', 'rgb(64,255,72)', 'rgb(92,108,255)'];
const RIM_MASK = [null,
	'rgb(255,96,96)', 'rgb(96,255,96)', 'rgb(255,255,96)',
	'rgb(96,96,255)', 'rgb(255,96,255)', 'rgb(96,255,255)', 'rgb(224,228,236)'];
const RIM_PANEL = '#070a10';
const RIM_FILL = 'rgba(150,180,255,0.06)';
const RIM_EDGE = 'rgba(150,180,255,0.16)';
const RIM_DIM = 'rgba(150,160,180,0.4)';
const RIM_INK = 'rgba(236,240,248,0.9)';
const WATER_COOL = 'rgba(64,140,220,0.28)';
const WATER_WARM = 'rgba(72,196,255,0.4)';
const WATER_BOIL = 'rgba(116,238,255,0.56)';
const COIL_WARM = 'rgb(255,140,48)';
const COIL_HOT = 'rgb(255,214,102)';
const NEON_IDLE = 'rgba(140,155,180,0.34)';
const NEON_WARN = 'rgb(255,96,96)';
const NEON_TUNE = 'rgb(255,196,84)';
const NEON_MET = 'rgb(255,232,252)';
const NEON_HALO = 'rgba(255,64,196,0.48)';
const BAR_OK = 'rgb(72,255,148)';
const BAR_PART = 'rgb(96,220,255)';
const RIM_TAU = Math.PI * 2;

function activeRecvMask(recv) {
	let m = 0;
	for (let i = 1; i < mN - 1; i++) {
		m |= recv[i] | recv[(mN - 1) * mN + i] | recv[i * mN] | recv[i * mN + mN - 1];
	}
	return m;
}

// reads only contract evaluation + live receiver arrivals, never unlit target locations
function drawRimItems(ctx, res, recv, emitter, t) {
	const state = mContractState(res);
	const pct = res ? res.percent : 0;
	const forbid = !!(res && res.forbiddenLight);
	const mask = activeRecvMask(recv);
	drawBoiler(ctx, state, pct, t);
	drawLamp(ctx, state, mask, t);
	drawBillboard(ctx, state, mask, forbid, t);
	drawCrystal(ctx, state, mask, t);
	drawDetector(ctx, state, pct, forbid, t);
	drawEmitterRail(ctx, emitter);
	drawPowerCell(ctx, state, pct, forbid, t);
	drawWires(ctx, recv, state);
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
}

function drawBoiler(ctx, state, pct, t) {
	ctx.globalCompositeOperation = 'source-over';
	ctx.strokeStyle = RIM_DIM;
	ctx.lineWidth = 0.06;
	ctx.beginPath();
	ctx.moveTo(-0.36, 4.7);
	ctx.lineTo(0, 4.7);
	ctx.moveTo(-0.36, 10.3);
	ctx.lineTo(0, 10.3);
	ctx.stroke();
	ctx.fillStyle = RIM_PANEL;
	ctx.fillRect(-1.18, 4, 0.82, 7);
	const wy = 6.8 - 1.3 * (pct / 100);
	ctx.fillStyle = state === mMatch ? WATER_BOIL : state === mPartial ? WATER_WARM : WATER_COOL;
	ctx.fillRect(-1.12, wy, 0.7, 10.58 - wy);
	ctx.strokeStyle = state === mMatch ? COIL_HOT : state === mPartial ? COIL_WARM : RIM_DIM;
	ctx.lineWidth = 0.09;
	ctx.beginPath();
	ctx.moveTo(-1.06, 10.76);
	ctx.lineTo(-0.48, 10.76);
	ctx.stroke();
	ctx.strokeStyle = RIM_EDGE;
	ctx.lineWidth = 0.06;
	ctx.strokeRect(-1.18, 4, 0.82, 7);
	if (state) {
		const count = state === mMatch ? 7 : 4;
		const rate = state === mMatch ? 0.0015 : 0.0007;
		ctx.fillStyle = RIM_INK;
		for (let b = 0; b < count; b++) {
			const u = (t * rate + b * 0.23) % 1;
			const by = 10.45 - u * (10.35 - wy);
			const bx = -0.77 + Math.sin(t * 0.004 + b * 1.9) * 0.16;
			ctx.beginPath();
			ctx.arc(bx, by, state === mMatch ? 0.08 : 0.06, 0, RIM_TAU);
			ctx.fill();
		}
	}
	if (state !== mMatch) return;
	for (let s = 0; s < 3; s++) {
		const u = (t * 0.0009 + s / 3) % 1;
		ctx.globalAlpha = (1 - u) * 0.55;
		ctx.beginPath();
		ctx.arc(-0.77 + Math.sin(u * 5 + s) * 0.14, 3.85 - u * 1.25, 0.12 + u * 0.16, 0, RIM_TAU);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

function drawLamp(ctx, state, mask, t) {
	const cx = 2.2;
	const cy = -0.66;
	const col = RIM_MASK[mask || 7];
	ctx.globalCompositeOperation = 'source-over';
	ctx.fillStyle = RIM_DIM;
	ctx.fillRect(cx - 0.26, -0.24, 0.52, 0.2);
	if (state) {
		ctx.globalCompositeOperation = 'lighter';
		ctx.globalAlpha = state === mMatch ? 0.55 : 0.24;
		ctx.fillStyle = col;
		ctx.beginPath();
		ctx.arc(cx, cy, state === mMatch ? 0.54 : 0.42, 0, RIM_TAU);
		ctx.fill();
		ctx.globalAlpha = 1;
	}
	ctx.globalCompositeOperation = 'source-over';
	ctx.fillStyle = state ? col : RIM_FILL;
	ctx.globalAlpha = state === mMatch ? 0.9 : state === mPartial ? 0.42 : 1;
	ctx.beginPath();
	ctx.arc(cx, cy, 0.36, 0, RIM_TAU);
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.strokeStyle = state ? col : RIM_DIM;
	ctx.lineWidth = 0.06;
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(cx - 0.11, -0.36);
	ctx.lineTo(cx - 0.05, cy);
	ctx.lineTo(cx + 0.05, cy);
	ctx.lineTo(cx + 0.11, -0.36);
	ctx.stroke();
	if (state !== mMatch) return;
	const wob = Math.sin(t * 0.006) * 0.04;
	ctx.lineWidth = 0.055;
	for (let k = 0; k < 5; k++) {
		const a = -Math.PI + (k + 0.5) * (Math.PI / 5);
		ctx.beginPath();
		ctx.moveTo(cx + Math.cos(a) * 0.45, cy + Math.sin(a) * 0.45);
		ctx.lineTo(cx + Math.cos(a) * (0.6 + wob), cy + Math.sin(a) * (0.6 + wob));
		ctx.stroke();
	}
}

function drawBillboard(ctx, state, mask, forbid, t) {
	ctx.globalCompositeOperation = 'source-over';
	ctx.strokeStyle = RIM_DIM;
	ctx.lineWidth = 0.06;
	ctx.beginPath();
	ctx.moveTo(5.6, -0.16);
	ctx.lineTo(5.6, 0);
	ctx.moveTo(9.4, -0.16);
	ctx.lineTo(9.4, 0);
	ctx.stroke();
	ctx.fillStyle = RIM_PANEL;
	ctx.fillRect(4.6, -1.3, 5.8, 1.14);
	const tone = state === mMatch ? NEON_MET : state === mPartial ? (forbid ? NEON_WARN : NEON_TUNE) : NEON_IDLE;
	ctx.strokeStyle = state === mMatch ? NEON_HALO : tone;
	ctx.lineWidth = state === mMatch ? 0.1 : 0.06;
	ctx.strokeRect(4.6, -1.3, 5.8, 1.14);
	for (let ch = 0; ch < 3; ch++) {
		const on = (mask >> ch) & 1;
		ctx.fillStyle = on ? RIM_CH[ch] : NEON_IDLE;
		ctx.beginPath();
		ctx.arc(5.12, -1 + ch * 0.27, 0.09, 0, RIM_TAU);
		ctx.fill();
	}
	const label = state === mMatch ? '成功' : state === mPartial ? (forbid ? '过载' : '调光') : '待机';
	ctx.font = 'bold 0.66px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	if (state === mMatch) {
		ctx.globalCompositeOperation = 'lighter';
		ctx.fillStyle = NEON_HALO;
		ctx.fillText(label, 7.85, -0.72);
	}
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = state === mPartial ? 0.72 + Math.sin(t * 0.007) * 0.22 : 1;
	ctx.fillStyle = tone;
	ctx.fillText(label, 7.85, -0.72);
	ctx.globalAlpha = 1;
}

function drawCrystal(ctx, state, mask, t) {
	const cx = 12.8;
	const col = RIM_MASK[mask || 5];
	ctx.globalCompositeOperation = 'source-over';
	ctx.fillStyle = RIM_DIM;
	ctx.fillRect(cx - 0.52, -0.2, 1.04, 0.16);
	for (let s = -1; s <= 1; s++) {
		const bx = cx + s * 0.34;
		const tipX = bx + s * 0.08;
		const tipY = s === 0 ? -1.2 : -0.94;
		const lit = state === mMatch || (state === mPartial && s === 0);
		ctx.beginPath();
		ctx.moveTo(bx - 0.18, -0.2);
		ctx.lineTo(bx - 0.14, tipY + 0.26);
		ctx.lineTo(tipX, tipY);
		ctx.lineTo(bx + 0.14, tipY + 0.26);
		ctx.lineTo(bx + 0.18, -0.2);
		ctx.closePath();
		ctx.fillStyle = lit ? col : RIM_FILL;
		ctx.globalAlpha = state === mMatch ? 0.72 : lit ? 0.38 + Math.sin(t * 0.005) * 0.12 : 1;
		ctx.fill();
		ctx.globalAlpha = 1;
		ctx.strokeStyle = lit ? RIM_INK : RIM_EDGE;
		ctx.lineWidth = 0.05;
		ctx.stroke();
	}
	if (state !== mMatch) return;
	ctx.globalCompositeOperation = 'lighter';
	ctx.strokeStyle = col;
	ctx.lineWidth = 0.05;
	const arm = 0.14 + Math.sin(t * 0.008) * 0.04;
	ctx.beginPath();
	ctx.moveTo(cx - arm, -1.2);
	ctx.lineTo(cx + arm, -1.2);
	ctx.moveTo(cx, -1.2 - arm);
	ctx.lineTo(cx, -1.2 + arm);
	ctx.stroke();
}

function drawDetector(ctx, state, pct, forbid, t) {
	ctx.globalCompositeOperation = 'source-over';
	ctx.strokeStyle = RIM_DIM;
	ctx.lineWidth = 0.06;
	ctx.beginPath();
	ctx.moveTo(15, 5.3);
	ctx.lineTo(15.18, 5.3);
	ctx.moveTo(15, 9.7);
	ctx.lineTo(15.18, 9.7);
	ctx.stroke();
	ctx.fillStyle = RIM_PANEL;
	ctx.fillRect(15.18, 4.4, 1.12, 6.2);
	ctx.strokeStyle = RIM_EDGE;
	ctx.strokeRect(15.18, 4.4, 1.12, 6.2);
	const sx = 15.74;
	const sy = 5.22;
	const sigCol = state === mMatch ? BAR_OK : forbid ? NEON_WARN : BAR_PART;
	ctx.strokeStyle = state ? sigCol : RIM_DIM;
	ctx.beginPath();
	ctx.arc(sx, sy, 0.36, 0, RIM_TAU);
	ctx.stroke();
	if (state === mPartial) {
		const u = (t * 0.0014) % 1;
		ctx.globalAlpha = 1 - u;
		ctx.beginPath();
		ctx.arc(sx, sy, 0.08 + u * 0.28, 0, RIM_TAU);
		ctx.stroke();
		ctx.globalAlpha = 1;
	} else if (state === mMatch) {
		ctx.fillStyle = BAR_OK;
		ctx.beginPath();
		ctx.arc(sx, sy, 0.16, 0, RIM_TAU);
		ctx.fill();
	}
	const litBars = state === mMatch ? 5 : state === mPartial ? Math.max(1, Math.min(4, Math.ceil(pct / 20))) : 0;
	for (let b = 0; b < 5; b++) {
		const by = 9.72 - b * 0.78;
		if (b < litBars) {
			ctx.fillStyle = sigCol;
			ctx.fillRect(15.34, by, 0.8, 0.48);
		} else {
			ctx.strokeStyle = RIM_DIM;
			ctx.strokeRect(15.34, by, 0.8, 0.48);
		}
	}
}

function drawEmitterRail(ctx, emitter) {
	ctx.globalCompositeOperation = 'source-over';
	ctx.strokeStyle = RIM_DIM;
	ctx.lineWidth = 0.05;
	const x0 = mEMin + 0.5;
	const x1 = mEMax + 0.5;
	ctx.beginPath();
	ctx.moveTo(x0, 15.32);
	ctx.lineTo(x1, 15.32);
	ctx.moveTo(x0, 15.18);
	ctx.lineTo(x0, 15.46);
	ctx.moveTo(x1, 15.18);
	ctx.lineTo(x1, 15.46);
	ctx.stroke();
	ctx.fillStyle = RIM_INK;
	ctx.beginPath();
	ctx.arc(emitter + 0.5, 15.32, 0.1, 0, RIM_TAU);
	ctx.fill();
}

function drawPowerCell(ctx, state, pct, forbid, t) {
	ctx.globalCompositeOperation = 'source-over';
	ctx.fillStyle = RIM_PANEL;
	ctx.fillRect(6.3, 15.45, 2.4, 0.9);
	ctx.strokeStyle = RIM_EDGE;
	ctx.lineWidth = 0.06;
	ctx.strokeRect(6.3, 15.45, 2.4, 0.9);
	ctx.fillStyle = RIM_DIM;
	ctx.fillRect(7.35, 15.32, 0.3, 0.13);
	const litSeg = state === mMatch ? 5 : state === mPartial ? Math.max(1, Math.min(4, Math.ceil(pct / 20))) : 0;
	const segCol = state === mMatch ? BAR_OK : forbid ? NEON_WARN : BAR_PART;
	for (let s = 0; s < 5; s++) {
		const sx = 6.42 + s * 0.44;
		if (s < litSeg) {
			ctx.fillStyle = segCol;
			ctx.fillRect(sx, 15.57, 0.4, 0.66);
		} else {
			ctx.strokeStyle = RIM_DIM;
			ctx.strokeRect(sx, 15.57, 0.4, 0.66);
		}
	}
	if (state !== mMatch) return;
	ctx.globalCompositeOperation = 'lighter';
	ctx.globalAlpha = 0.35 + Math.sin(t * 0.006) * 0.15;
	ctx.fillStyle = BAR_OK;
	ctx.fillRect(6.3, 15.45, 2.4, 0.9);
	ctx.globalAlpha = 1;
}

function wireH(ctx, y, x0, x1, col) {
	ctx.strokeStyle = col;
	ctx.beginPath();
	ctx.moveTo(x0, y);
	ctx.lineTo(x1, y);
	ctx.stroke();
}

function wireV(ctx, x, y0, y1, col) {
	ctx.strokeStyle = col;
	ctx.beginPath();
	ctx.moveTo(x, y0);
	ctx.lineTo(x, y1);
	ctx.stroke();
}

// lit receivers only, so hidden targets never leak; each side buses to its item center
function drawWires(ctx, recv, state) {
	ctx.globalCompositeOperation = state === mMatch ? 'lighter' : 'source-over';
	ctx.lineWidth = 0.07;
	let lampMask = 0;
	let billMask = 0;
	let crysMask = 0;
	let leftMask = 0;
	let rightMask = 0;
	let botMask = 0;
	let lampMin = 99;
	let lampMax = -99;
	let billMin = 99;
	let billMax = -99;
	let crysMin = 99;
	let crysMax = -99;
	let leftMin = 99;
	let leftMax = -99;
	let rightMin = 99;
	let rightMax = -99;
	let botMin = 99;
	let botMax = -99;
	for (let c = 1; c < mN - 1; c++) {
		const bits = recv[c];
		if (!bits) continue;
		const x = c + 0.5;
		wireV(ctx, x, 0.18, -0.1, RIM_MASK[bits]);
		if (c <= 3) {
			lampMask |= bits;
			if (x < lampMin) lampMin = x;
			if (x > lampMax) lampMax = x;
		} else if (c <= 11) {
			billMask |= bits;
			if (x < billMin) billMin = x;
			if (x > billMax) billMax = x;
		} else {
			crysMask |= bits;
			if (x < crysMin) crysMin = x;
			if (x > crysMax) crysMax = x;
		}
	}
	for (let c = 1; c < mN - 1; c++) {
		const bits = recv[(mN - 1) * mN + c];
		if (!bits) continue;
		const x = c + 0.5;
		wireV(ctx, x, 14.82, 15.16, RIM_MASK[bits]);
		botMask |= bits;
		if (x < botMin) botMin = x;
		if (x > botMax) botMax = x;
	}
	for (let r = 1; r < mN - 1; r++) {
		const bits = recv[r * mN];
		if (!bits) continue;
		const y = r + 0.5;
		wireH(ctx, y, 0.18, -0.18, RIM_MASK[bits]);
		leftMask |= bits;
		if (y < leftMin) leftMin = y;
		if (y > leftMax) leftMax = y;
	}
	for (let r = 1; r < mN - 1; r++) {
		const bits = recv[r * mN + mN - 1];
		if (!bits) continue;
		const y = r + 0.5;
		wireH(ctx, y, 14.82, 15.09, RIM_MASK[bits]);
		rightMask |= bits;
		if (y < rightMin) rightMin = y;
		if (y > rightMax) rightMax = y;
	}
	if (lampMask) {
		if (2.2 < lampMin) lampMin = 2.2;
		if (2.2 > lampMax) lampMax = 2.2;
		wireH(ctx, -0.1, lampMin, lampMax, RIM_MASK[lampMask]);
		wireV(ctx, 2.2, -0.1, -0.66, RIM_MASK[lampMask]);
	}
	if (billMask) {
		if (7.5 < billMin) billMin = 7.5;
		if (7.5 > billMax) billMax = 7.5;
		wireH(ctx, -0.1, billMin, billMax, RIM_MASK[billMask]);
		wireV(ctx, 7.5, -0.1, -0.73, RIM_MASK[billMask]);
	}
	if (crysMask) {
		if (12.8 < crysMin) crysMin = 12.8;
		if (12.8 > crysMax) crysMax = 12.8;
		wireH(ctx, -0.1, crysMin, crysMax, RIM_MASK[crysMask]);
		wireV(ctx, 12.8, -0.1, -0.7, RIM_MASK[crysMask]);
	}
	if (leftMask) {
		if (7.5 < leftMin) leftMin = 7.5;
		if (7.5 > leftMax) leftMax = 7.5;
		wireV(ctx, -0.18, leftMin, leftMax, RIM_MASK[leftMask]);
		wireH(ctx, 7.5, -0.18, -0.77, RIM_MASK[leftMask]);
	}
	if (rightMask) {
		if (7.5 < rightMin) rightMin = 7.5;
		if (7.5 > rightMax) rightMax = 7.5;
		wireV(ctx, 15.09, rightMin, rightMax, RIM_MASK[rightMask]);
		wireH(ctx, 7.5, 15.09, 15.74, RIM_MASK[rightMask]);
	}
	if (botMask) {
		if (7.5 < botMin) botMin = 7.5;
		if (7.5 > botMax) botMax = 7.5;
		wireH(ctx, 15.16, botMin, botMax, RIM_MASK[botMask]);
		wireV(ctx, 7.5, 15.16, 15.9, RIM_MASK[botMask]);
	}
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
}

if (typeof module !== 'undefined') module.exports = { drawRimItems };

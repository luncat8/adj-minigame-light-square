// owns: pointer, wheel and keyboard input, ring/emitter selection and dragging
// edit for: controls, rebinding, gesture thresholds

let boardEl = null;
let drag = null; // { kind, side, slots, last, accum }

function clampEmitter(x) {
	return Math.max(1, Math.min(13, Math.round(x)));
}

// nearest ring slot index to the pointer, for drag accumulation
function slotUnder(slots, p, cell) {
	let best = 0;
	let bd = Infinity;
	for (let i = 0; i < slots.length; i++) {
		const c = slots[i];
		const cx = (c % 15 + 0.5) * cell;
		const cy = (Math.floor(c / 15) + 0.5) * cell;
		const dx = cx - p.cx, dy = cy - p.cy;
		const d = dx * dx + dy * dy;
		if (d < bd) { bd = d; best = i; }
	}
	return best;
}

function cellAt(ev) {
	const rect = boardEl.getBoundingClientRect();
	const cell = rect.width / 15;
	return { x: Math.floor((ev.clientX - rect.left) / cell), y: Math.floor((ev.clientY - rect.top) / cell), cell, cx: ev.clientX - rect.left, cy: ev.clientY - rect.top };
}

function onDown(ev) {
	if (game.previewActive) return;
	const p = cellAt(ev);
	if (p.x < 0 || p.x > 14 || p.y < 0 || p.y > 14) return;
	const side = ringSideOf(p.y * 15 + p.x);
	if (side) {
		const slots = ringSlots(side);
		drag = { kind: 'ring', side, slots, last: slotUnder(slots, p, p.cell), accum: 0 };
	} else if (p.y >= 11) {
		drag = { kind: 'emitter' };
		game.setEmitter(clampEmitter(p.x));
	} else {
		return;
	}
	boardEl.setPointerCapture(ev.pointerId);
	ev.preventDefault();
}

function onMove(ev) {
	const p = cellAt(ev);
	if (!drag) {
		const side = ringSideOf(p.y * 15 + p.x);
		if (side) game.selectRing(side);
		return;
	}
	if (drag.kind === 'ring') {
		const cur = slotUnder(drag.slots, p, p.cell);
		const len = drag.slots.length;
		let delta = cur - drag.last;
		if (delta > len / 2) delta -= len;
		if (delta < -len / 2) delta += len;
		drag.last = cur;
		drag.accum += delta;
		const stride = game.strideFor(drag.side);
		while (Math.abs(drag.accum) >= stride) {
			const dir = drag.accum > 0 ? 1 : -1;
			game.applyRingMove(drag.side, dir);
			drag.accum -= dir * stride;
		}
	} else {
		game.setEmitter(clampEmitter(p.x));
	}
}

function onUp(ev) {
	if (!drag) return;
	drag = null;
	try { boardEl.releasePointerCapture(ev.pointerId); } catch (e) { /* pointer already gone */ }
}

function onWheel(ev) {
	if (game.previewActive) return;
	const p = cellAt(ev);
	const side = ringSideOf(p.y * 15 + p.x);
	if (!side) return;
	game.selectRing(side);
	game.applyRingMove(side, ev.deltaY < 0 ? 1 : -1);
	ev.preventDefault();
}

function onKey(ev) {
	if (game.previewActive) return;
	if (ev.key === 'ArrowLeft') { game.setEmitter(game.pose.emitter - 1); ev.preventDefault(); }
	else if (ev.key === 'ArrowRight') { game.setEmitter(game.pose.emitter + 1); ev.preventDefault(); }
}

function bindControls() {
	boardEl = document.getElementById('canv');
	boardEl.addEventListener('pointerdown', onDown);
	boardEl.addEventListener('pointermove', onMove);
	boardEl.addEventListener('pointerup', onUp);
	boardEl.addEventListener('pointercancel', onUp);
	boardEl.addEventListener('wheel', onWheel, { passive: false });
	window.addEventListener('keydown', onKey);
}

if (typeof module !== 'undefined') module.exports = { bindControls };

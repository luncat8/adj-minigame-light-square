// owns: pointer, wheel, keyboard input
// edit for: key maps, drag thresholds, laser control

const Input = {
	canvas: null,
	renderer: null,
	handlers: null,
	dragging: false,
	dragRing: -1,
	dragAngle: 0,
	pointerId: -1,
	cursor: 'default',
	_p: { x: 0, y: 0 }
};

Input.init = function(canvas, renderer, handlers) {
	Input.canvas = canvas;
	Input.renderer = renderer;
	Input.handlers = handlers;
	canvas.addEventListener('pointerdown', Input.onDown);
	canvas.addEventListener('pointermove', Input.onMove);
	canvas.addEventListener('pointerup', Input.onUp);
	canvas.addEventListener('pointercancel', Input.onUp);
	canvas.addEventListener('wheel', Input.onWheel, { passive: false });
	window.addEventListener('keydown', Input.onKey);
};

Input.pointer = function(e) {
	const rect = Input.canvas.getBoundingClientRect();
	Input._p.x = e.clientX - rect.left;
	Input._p.y = e.clientY - rect.top;
	return Input._p;
};

Input.cellAt = function(x, y) {
	const r = Input.renderer;
	const col = Math.floor((x - r.ox) / r.cell);
	const row = Math.floor((y - r.oy) / r.cell);
	if (row < 0 || col < 0 || row >= r.n || col >= r.n) return -1;
	return row * r.n + col;
};

Input.ringAt = function(x, y) {
	const idx = Input.cellAt(x, y);
	if (idx < 0) return -1;
	const n = Input.renderer.n;
	return Input.handlers.ringAt(Math.floor(idx / n), idx % n);
};

Input.angle = function(x, y) {
	const r = Input.renderer;
	const cx = r.ox + r.n * 0.5 * r.cell;
	const cy = r.oy + r.n * 0.5 * r.cell;
	return Math.atan2(y - cy, x - cx);
};

Input.setCursor = function(cursor) {
	if (cursor === Input.cursor) return;
	Input.cursor = cursor;
	Input.canvas.style.cursor = cursor;
};

Input.onDown = function(e) {
	if (e.pointerType === 'mouse' && e.button !== 0) return;
	const p = Input.pointer(e);
	const ring = Input.ringAt(p.x, p.y);
	if (ring < 0) return;
	e.preventDefault();
	if (Input.handlers.ringSize(ring) === 1) {
		Input.handlers.rotate(ring, 1);
		return;
	}
	Input.dragging = true;
	Input.dragRing = ring;
	Input.dragAngle = Input.angle(p.x, p.y);
	Input.pointerId = e.pointerId;
	Input.canvas.setPointerCapture(e.pointerId);
	Input.setCursor('grabbing');
};

Input.onMove = function(e) {
	const p = Input.pointer(e);
	if (Input.dragging) {
		const a = Input.angle(p.x, p.y);
		let d = a - Input.dragAngle;
		if (d > Math.PI) d -= Math.PI * 2;
		if (d < -Math.PI) d += Math.PI * 2;
		if (Math.abs(d) >= 0.35) {
			Input.handlers.rotate(Input.dragRing, d > 0 ? 1 : -1);
			Input.dragAngle = a;
		}
		return;
	}
	const ring = Input.ringAt(p.x, p.y);
	Input.setCursor(ring >= 0 ? 'grab' : 'default');
	const n = Input.renderer.n;
	const col = Math.floor((p.x - Input.renderer.ox) / Input.renderer.cell);
	if (col >= 0 && col < n) Input.handlers.laser(col);
};

Input.onUp = function(e) {
	if (!Input.dragging || e.pointerId !== Input.pointerId) return;
	Input.dragging = false;
	Input.dragRing = -1;
	Input.dragAngle = 0;
	if (Input.canvas.hasPointerCapture(Input.pointerId)) Input.canvas.releasePointerCapture(Input.pointerId);
	Input.pointerId = -1;
	Input.setCursor('default');
};

Input.onWheel = function(e) {
	e.preventDefault();
	const p = Input.pointer(e);
	const ring = Input.ringAt(p.x, p.y);
	if (ring < 0) return;
	const delta = e.deltaY || e.deltaX;
	if (!delta) return;
	Input.handlers.rotate(ring, delta > 0 ? 1 : -1);
};

Input.onKey = function(e) {
	if (e.metaKey || e.ctrlKey || e.altKey) return;
	const code = e.code;
	if (code === 'ArrowLeft' || code === 'KeyA') {
		e.preventDefault();
		Input.handlers.moveLaser(-1);
		return;
	}
	if (code === 'ArrowRight' || code === 'KeyD') {
		e.preventDefault();
		Input.handlers.moveLaser(1);
		return;
	}
	if (code === 'KeyN' && !e.repeat) {
		e.preventDefault();
		Input.handlers.newGame();
	}
};

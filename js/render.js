// owns: canvas drawing, geometry, glow
// edit for: colors, cell look, beam style

const Renderer = {
	canvas: null,
	ctx: null,
	n: 15,
	w: 0,
	h: 0,
	cell: 24,
	ox: 0,
	oy: 0,
	dpr: 1,
	bg: null,
	colors: null,
	groupLabels: ['', '1', '2', '3']
};

Renderer.init = function(canvas, n) {
	Renderer.canvas = canvas;
	Renderer.ctx = canvas.getContext('2d');
	Renderer.n = n;
	Renderer.colors = ['#000000', '#ff3b30', '#34ff6a', '#ffe94d', '#3b7cff', '#ff4df0', '#4dfff0', '#ffffff'];
	Renderer.resize(window.innerWidth, window.innerHeight);
};

Renderer.resize = function(w, h) {
	const dpr = window.devicePixelRatio || 1;
	Renderer.dpr = dpr;
	Renderer.w = w;
	Renderer.h = h;
	const canvas = Renderer.canvas;
	canvas.width = Math.round(w * dpr);
	canvas.height = Math.round(h * dpr);
	canvas.style.width = w + 'px';
	canvas.style.height = h + 'px';
	const ctx = Renderer.ctx;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	const marginX = 32;
	const marginTop = 32;
	const marginBottom = 72;
	const availW = w - marginX * 2;
	const availH = h - marginTop - marginBottom;
	let cell = Math.floor(Math.min(availW / Renderer.n, availH / Renderer.n));
	if (cell < 8) cell = 8;
	Renderer.cell = cell;
	const size = cell * Renderer.n;
	Renderer.ox = Math.round((w - size) / 2);
	Renderer.oy = Math.round(marginTop + (availH - size) / 2);
	const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.7);
	g.addColorStop(0, '#0a1020');
	g.addColorStop(1, '#030408');
	Renderer.bg = g;
};

Renderer.draw = function(b, status, segments, segCount, solved, hints, preview) {
	const ctx = Renderer.ctx;
	const cell = Renderer.cell;
	const ox = Renderer.ox;
	const oy = Renderer.oy;
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	ctx.fillStyle = Renderer.bg;
	ctx.fillRect(0, 0, Renderer.w, Renderer.h);
	Renderer.drawGrid(ctx, ox, oy, cell);
	Renderer.drawCells(ctx, b, ox, oy, cell);
	Renderer.drawBeams(ctx, segments, segCount, ox, oy, cell);
	Renderer.drawTargets(ctx, b, ox, oy, cell, hints);
	Renderer.drawLaser(ctx, b, ox, oy, cell);
	Renderer.drawStatus(ctx, status, solved, preview);
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-over';
};

Renderer.drawGrid = function(ctx, ox, oy, cell) {
	const n = Renderer.n;
	const size = n * cell;
	ctx.strokeStyle = 'rgba(120,170,255,0.055)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let i = 0; i <= n; i++) {
		const p = i * cell;
		ctx.moveTo(ox + p, oy);
		ctx.lineTo(ox + p, oy + size);
		ctx.moveTo(ox, oy + p);
		ctx.lineTo(ox + size, oy + p);
	}
	ctx.stroke();
	ctx.strokeStyle = 'rgba(120,170,255,0.12)';
	ctx.strokeRect(ox, oy, size, size);
};

Renderer.drawCells = function(ctx, b, ox, oy, cell) {
	const n = b.n;
	const grid = b.grid;
	const colors = Renderer.colors;
	const pad = Math.max(1, cell * 0.07);
	const size = cell - pad * 2;
	const radius = cell * 0.15;
	for (let row = 0; row < n; row++) {
		for (let col = 0; col < n; col++) {
			const c = grid[row * n + col];
			if (c.kind === Board.EMPTY) continue;
			const x = ox + col * cell;
			const y = oy + row * cell;
			ctx.beginPath();
			ctx.roundRect(x + pad, y + pad, size, size, radius);
			if (c.kind === Board.BORDER) {
				ctx.fillStyle = '#0a0f1a';
				ctx.fill();
				ctx.strokeStyle = 'rgba(130,170,255,0.2)';
			} else {
				ctx.fillStyle = 'rgba(80,140,220,0.08)';
				ctx.fill();
				ctx.strokeStyle = 'rgba(130,190,255,0.22)';
			}
			ctx.lineWidth = 1;
			ctx.stroke();
			if (c.kind === Board.GLASS && c.type === Board.MIRROR) {
				const inset = size * 0.16;
				let x1;
				let y1;
				let x2;
				let y2;
				if (c.diag === 0) {
					x1 = x + pad + inset;
					y1 = y + pad + size - inset;
					x2 = x + pad + size - inset;
					y2 = y + pad + inset;
				} else {
					x1 = x + pad + inset;
					y1 = y + pad + inset;
					x2 = x + pad + size - inset;
					y2 = y + pad + size - inset;
				}
				ctx.globalCompositeOperation = 'lighter';
				ctx.strokeStyle = colors[c.mask];
				ctx.globalAlpha = 0.16;
				ctx.lineWidth = Math.max(2, cell * 0.18);
				ctx.beginPath();
				ctx.moveTo(x1, y1);
				ctx.lineTo(x2, y2);
				ctx.stroke();
				ctx.globalAlpha = 0.9;
				ctx.lineWidth = Math.max(1.5, cell * 0.055);
				ctx.beginPath();
				ctx.moveTo(x1, y1);
				ctx.lineTo(x2, y2);
				ctx.stroke();
				ctx.globalAlpha = 1;
				ctx.globalCompositeOperation = 'source-over';
			}
			if (c.light) {
				ctx.globalCompositeOperation = 'lighter';
				ctx.fillStyle = colors[c.light];
				ctx.globalAlpha = c.kind === Board.BORDER ? 0.24 : 0.1;
				ctx.beginPath();
				ctx.roundRect(x + pad * 0.4, y + pad * 0.4, cell - pad * 0.8, cell - pad * 0.8, radius);
				ctx.fill();
				ctx.globalAlpha = 1;
				ctx.globalCompositeOperation = 'source-over';
			}
		}
	}
};

Renderer.drawBeams = function(ctx, segments, segCount, ox, oy, cell) {
	if (!segments || segCount === 0) return;
	const colors = Renderer.colors;
	ctx.globalCompositeOperation = 'lighter';
	ctx.lineCap = 'round';
	for (let m = 1; m <= 7; m++) {
		let any = false;
		ctx.beginPath();
		for (let i = 0; i < segCount; i++) {
			const s = segments[i];
			if (s.mask !== m) continue;
			ctx.moveTo(ox + s.x1 * cell, oy + s.y1 * cell);
			ctx.lineTo(ox + s.x2 * cell, oy + s.y2 * cell);
			any = true;
		}
		if (!any) continue;
		ctx.strokeStyle = colors[m];
		ctx.globalAlpha = 0.1;
		ctx.lineWidth = Math.max(4, cell * 0.34);
		ctx.stroke();
		ctx.globalAlpha = 0.38;
		ctx.lineWidth = Math.max(2, cell * 0.11);
		ctx.stroke();
		ctx.globalAlpha = 0.95;
		ctx.lineWidth = Math.max(1.2, cell * 0.035);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-over';
};

Renderer.drawTargets = function(ctx, b, ox, oy, cell, hints) {
	const showTargets = !hints || hints.targets !== false;
	if (!showTargets) return;
	const showGood = !hints || hints.good !== false;
	const showFound = !hints || hints.found !== false;
	const colors = Renderer.colors;
	const labels = Renderer.groupLabels;
	const r = Math.max(2.5, cell * 0.11);
	const dot = Math.max(1.5, cell * 0.06);
	ctx.globalCompositeOperation = 'source-over';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	ctx.font = '10px monospace';
	for (let gi = 0; gi < b.groups.length; gi++) {
		const group = b.groups[gi];
		const label = labels[gi + 1];
		const color = group.exact ? null : '#ffffff';
		for (let ci = 0; ci < group.cells.length; ci++) {
			const t = group.cells[ci];
			const col = t.idx % b.n;
			const row = Math.floor(t.idx / b.n);
			const cx = ox + (col + 0.5) * cell;
			const cy = oy + (row + 0.5) * cell;
			const status = b.status ? b.status[t.idx] : 0;
			const fill = group.exact ? colors[t.mask] : color;
			ctx.globalAlpha = showGood && status === 2 ? 1 : 0.85;
			ctx.strokeStyle = fill;
			ctx.lineWidth = showGood && status === 2 ? 2.5 : 1.5;
			ctx.setLineDash(showGood && (status === 1 || status === 3) ? [3, 2] : []);
			if (showGood && status === 1) ctx.strokeStyle = '#ffd45e';
			if (showGood && status === 3) ctx.strokeStyle = '#ff5b5b';
			ctx.beginPath();
			ctx.moveTo(cx, cy - r);
			ctx.lineTo(cx + r, cy);
			ctx.lineTo(cx, cy + r);
			ctx.lineTo(cx - r, cy);
			ctx.closePath();
			if (showGood && status === 2) {
				ctx.fillStyle = fill;
				ctx.fill();
			}
			ctx.stroke();
			ctx.setLineDash([]);
			if (showGood && status === 2) {
				ctx.globalAlpha = 1;
				ctx.strokeStyle = '#04110a';
				ctx.lineWidth = Math.max(1.5, cell * 0.045);
				ctx.beginPath();
				ctx.moveTo(cx - r * 0.45, cy + r * 0.05);
				ctx.lineTo(cx - r * 0.08, cy + r * 0.42);
				ctx.lineTo(cx + r * 0.52, cy - r * 0.42);
				ctx.stroke();
			}
			if (showGood && status === 3) {
				ctx.globalAlpha = 0.9;
				ctx.strokeStyle = '#ff5b5b';
				ctx.lineWidth = Math.max(1.2, cell * 0.035);
				ctx.beginPath();
				ctx.moveTo(cx - r * 0.6, cy - r * 0.6);
				ctx.lineTo(cx + r * 0.6, cy + r * 0.6);
				ctx.stroke();
			}
			if (label) {
				ctx.globalAlpha = 0.9;
				ctx.fillStyle = fill;
				ctx.fillText(label, ox + col * cell + cell * 0.08, oy + row * cell + cell * 0.06);
			}
			if (showFound && b.found && b.found[t.idx]) {
				const dx = ox + (col + 1) * cell - cell * 0.16;
				const dy = oy + row * cell + cell * 0.16;
				ctx.globalAlpha = 1;
				ctx.fillStyle = showGood && status === 2 ? '#bff4ff' : 'rgba(120,220,255,0.45)';
				ctx.beginPath();
				ctx.arc(dx, dy, dot, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}
	ctx.globalAlpha = 1;
	ctx.setLineDash([]);
};

Renderer.drawLaser = function(ctx, b, ox, oy, cell) {
	const w = b.laserWidth;
	const start = b.laserStart;
	const x = ox + start * cell + cell * 0.12;
	const width = w * cell * 0.76;
	const y = oy + b.n * cell + cell * 0.5;
	const h = Math.max(6, cell * 0.16);
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
	ctx.moveTo(x + width * 0.5, y - cell * 0.34);
	ctx.lineTo(x + width * 0.32, y - h * 0.2);
	ctx.lineTo(x + width * 0.68, y - h * 0.2);
	ctx.closePath();
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-over';
};

Renderer.drawStatus = function(ctx, status, solved, preview) {
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	if (preview) {
		ctx.fillStyle = 'rgba(255,233,77,0.12)';
		ctx.fillRect(8, 6, Math.min(Renderer.w - 16, 360), 24);
	}
	ctx.font = '13px monospace';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'top';
	ctx.fillStyle = preview ? '#ffe94d' : solved ? '#7dffb0' : 'rgba(210,225,255,0.75)';
	ctx.fillText(status, 16, 14);
	ctx.fillStyle = 'rgba(160,190,255,0.35)';
	ctx.fillText('wheel/drag rotate   A/D laser   N new', 16, 32);
};

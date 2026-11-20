// owns: out-of-border margin items and their activation visuals
// edit for: item visuals, placement, activation rules

const BUBBLES = [0.08, 0.24, 0.4, 0.56, 0.72, 0.88]; // fractions along the tube
const LAMP_CELL = 14 * 15 + 1; // bottom border, near the left
const CRYSTAL_CELL = 3 * 15 + 14; // right border, upper
const ITEM_FONT = '13px ui-sans-serif, sans-serif';

function roundRectPath(x, y, w, h, r) {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
}

// long tube: bubbles rise with how many receivers are matched
function drawTube(v, level) {
	const x0 = v.side * 0.26, x1 = v.side * 0.74;
	const y = v.side * 0.9;
	const w = x1 - x0;
	const h = Math.max(6, v.cell * 0.5);
	roundRectPath(x0, y - h / 2, w, h, h / 2);
	ctx.fillStyle = '#0c1018';
	ctx.fill();
	ctx.strokeStyle = 'rgba(120,170,255,0.5)';
	ctx.lineWidth = 1.5;
	ctx.stroke();
	const r = Math.max(2, h * 0.18) * (0.4 + 0.6 * level);
	ctx.fillStyle = 'rgba(150,200,255,0.9)';
	ctx.globalAlpha = level * 0.85;
	for (const f of BUBBLES) {
		ctx.beginPath();
		ctx.arc(x0 + w * f, y, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

// lamp: glows in the color of the light reaching its receiver
function drawLamp(v, color) {
	const x = v.side * 0.13, y = v.side * 0.9;
	const r = Math.max(4, v.cell * 0.45);
	const on = color !== 0;
	ctx.globalAlpha = on ? 0.5 : 0.15;
	ctx.fillStyle = on ? MASK_RGB[color] : '#333a48';
	ctx.beginPath();
	ctx.arc(x, y, r * 1.7, 0, Math.PI * 2);
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.fillStyle = on ? MASK_RGB[color] : '#2a3140';
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = 'rgba(255,255,255,0.25)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.stroke();
}

// detector: bar and pulse track the contract progress
function drawDetector(v, level) {
	const x = v.side * 0.5, y = v.side * 0.07;
	const w = Math.max(10, v.cell * 1.4), h = Math.max(8, v.cell * 0.8);
	roundRectPath(x - w / 2, y - h / 2, w, h, h / 2);
	ctx.fillStyle = '#0c1018';
	ctx.fill();
	ctx.strokeStyle = 'rgba(120,200,160,0.6)';
	ctx.lineWidth = 1.5;
	ctx.stroke();
	const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
	ctx.globalAlpha = 0.35 + 0.5 * level * pulse;
	ctx.fillStyle = '#39d98a';
	ctx.fillRect(x - w / 2 + 2, y - h / 2 + 2, (w - 4) * level, h - 4);
	ctx.globalAlpha = 1;
}

// crystal: shards light up in the color reaching its receiver
function drawCrystal(v, color) {
	const x = v.side * 0.93, y = v.side * 0.5;
	const s = Math.max(5, v.cell * 0.55);
	const on = color !== 0;
	ctx.save();
	ctx.translate(x, y);
	ctx.globalAlpha = on ? 0.9 : 0.25;
	ctx.fillStyle = on ? MASK_RGB[color] : '#44506a';
	for (let i = 0; i < 3; i++) {
		ctx.save();
		ctx.rotate(i * Math.PI / 3);
		ctx.beginPath();
		ctx.moveTo(0, -s);
		ctx.lineTo(s * 0.6, s * 0.4);
		ctx.lineTo(-s * 0.6, s * 0.4);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}
	ctx.restore();
	if (on) {
		ctx.globalAlpha = 0.4;
		ctx.fillStyle = MASK_RGB[color];
		ctx.beginPath();
		ctx.arc(x, y, s * 1.6, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

// neon billboard: success glyph once the contract is won
function drawBillboard(v, won) {
	const x = v.side * 0.86, y = v.side * 0.07;
	const w = Math.max(14, v.cell * 1.6), h = Math.max(12, v.cell * 1.0);
	roundRectPath(x - w / 2, y - h / 2, w, h, 4);
	ctx.fillStyle = won ? '#10243a' : '#0c1018';
	ctx.fill();
	ctx.strokeStyle = won ? '#39d98a' : 'rgba(110,168,255,0.5)';
	ctx.lineWidth = 1.5;
	ctx.stroke();
	ctx.fillStyle = won ? '#7dffcb' : '#6f7688';
	ctx.font = ITEM_FONT;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(won ? '成功' : '·', x, y);
}

// items reflect the active trace: the live pose, or the witness while previewing
function drawItems(game, view) {
	const preview = game.previewActive;
	const trace = preview ? game.previewTrace : game.trace;
	const ev = preview ? game.previewEvaluation : game.evaluation;
	const hits = trace.hits;
	const quota = game.puzzle.contract.quota;
	drawTube(view, Math.min(1, ev.matches / quota));
	drawLamp(view, hits[LAMP_CELL]);
	drawDetector(view, preview ? 1 : ev.progress / 100);
	drawCrystal(view, hits[CRYSTAL_CELL]);
	drawBillboard(view, preview || game.solved);
}

if (typeof module !== 'undefined') module.exports = { drawItems };

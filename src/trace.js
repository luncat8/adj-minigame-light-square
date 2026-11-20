// owns: RGB light transport and receiver hits
// edit for: tracing and reflection rules

function traceLight(pose, seed) {
	const seen = new Uint8Array(225 * 4);
	const hits = new Uint8Array(225);
	const segments = new Uint8Array(225 * 4);
	const queue = [seed || { cell: 13 * 15 + pose.emitter, direction: 0, mask: 7 }];
	const dx = [0, 1, 0, -1];
	const dy = [-1, 0, 1, 0];
	for (let head = 0; head < queue.length; head++) {
		const ray = queue[head];
		const key = ray.cell * 4 + ray.direction;
		const bits = ray.mask & ~seen[key];
		if (!bits) continue;
		seen[key] |= bits;
		const x = ray.cell % 15;
		const y = Math.floor(ray.cell / 15);
		if (x === 0 || x === 14 || y === 0 || y === 14) {
			hits[ray.cell] |= bits;
			continue;
		}
		const reflected = bits & pose.mask[ray.cell];
		const straight = bits & ~pose.mask[ray.cell];
		if (straight) {
			segments[key] |= straight;
			queue.push({ cell: ray.cell + dy[ray.direction] * 15 + dx[ray.direction], direction: ray.direction, mask: straight });
		}
		if (reflected) {
			const direction = pose.diagonal[ray.cell] ? [3, 2, 1, 0][ray.direction] : [1, 0, 3, 2][ray.direction];
			segments[ray.cell * 4 + direction] |= reflected;
			queue.push({ cell: ray.cell + dy[direction] * 15 + dx[direction], direction, mask: reflected });
		}
	}
	return { hits, segments };
}

if (typeof module !== 'undefined') module.exports = { traceLight };

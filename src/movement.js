// owns: board poses and legal ring moves
// edit for: movement rules and pose copying

const BOARD_SIZE = 15;
const BOARD_CELLS = 225;

function ringSlots(side) {
	if (side === 1) return [112];
	const lo = (BOARD_SIZE - side) / 2;
	const hi = lo + side - 1;
	const slots = [];
	for (let x = lo; x < hi; x++) slots.push(lo * BOARD_SIZE + x);
	for (let y = lo; y < hi; y++) slots.push(y * BOARD_SIZE + hi);
	for (let x = hi; x > lo; x--) slots.push(hi * BOARD_SIZE + x);
	for (let y = hi; y > lo; y--) slots.push(y * BOARD_SIZE + lo);
	return slots;
}

function copyPose(pose) {
	return { diagonal: pose.diagonal.slice(), mask: pose.mask.slice(), emitter: pose.emitter };
}

function moveRing(pose, side, direction, mode, corners) {
	const slots = ringSlots(side);
	if (side === 1) {
		if (pose.mask[112]) pose.diagonal[112] ^= 1;
		return;
	}
	const stride = mode === 'quarter' ? side - 1 : 1;
	const diagonal = pose.diagonal.slice();
	const mask = pose.mask.slice();
	for (let i = 0; i < slots.length; i++) {
		let position = i;
		let flips = 0;
		for (let step = 0; step < stride; step++) {
			const edge = direction > 0 ? position : (position + slots.length - 1) % slots.length;
			if (corners && edge % (side - 1) === 0) flips ^= 1;
			position = (position + direction + slots.length) % slots.length;
		}
		pose.mask[slots[position]] = mask[slots[i]];
		pose.diagonal[slots[position]] = diagonal[slots[i]] ^ (mask[slots[i]] ? flips : 0);
	}
}

if (typeof module !== 'undefined') module.exports = { BOARD_SIZE, BOARD_CELLS, ringSlots, copyPose, moveRing };

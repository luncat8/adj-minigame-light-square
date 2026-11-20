// Exercise the actual movement implementation on labeled rings.
const assert = require('assert');
const { ringSlots, moveRing } = require('../src/movement');

for (const side of [7, 5, 3, 1]) {
	const slots = ringSlots(side);
	assert.strictEqual(slots.length, side === 1 ? 1 : 4 * (side - 1));
	for (const corners of [false, true]) for (const mode of ['single', 'quarter']) {
		const pose = { diagonal: new Uint8Array(225), mask: new Uint8Array(225) };
		slots.forEach((cell, i) => { pose.mask[cell] = i + 1; pose.diagonal[cell] = i % 2; });
		const original = { mask: pose.mask.slice(), diagonal: pose.diagonal.slice() };
		moveRing(pose, side, 1, mode, corners);
		moveRing(pose, side, -1, mode, corners);
		assert.deepStrictEqual(pose, original);
		if (side === 1) continue;
		const quarter = { mask: original.mask.slice(), diagonal: original.diagonal.slice() };
		const single = { mask: original.mask.slice(), diagonal: original.diagonal.slice() };
		moveRing(quarter, side, 1, 'quarter', corners);
		for (let i = 0; i < side - 1; i++) moveRing(single, side, 1, 'single', corners);
		assert.deepStrictEqual(quarter, single);
	}
}
console.log('movement invariants passed');

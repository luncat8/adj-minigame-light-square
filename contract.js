// owns: secret contracts, scoring and per-puzzle discovery history
// edit for: quota, exact colors, forbidden hits and progress feedback

const CONTRACT_ANY = 8;
const CONTRACT_NONE = 0;
const CONTRACT_PARTIAL = 1;
const CONTRACT_MATCH = 2;

function createContract(targets, quota, forbidOutside) {
	const board = typeof module !== 'undefined' && module.exports ? require('./board.js') : null;
	const n = board ? board.BOARD_N : BOARD_N;
	if (!Number.isInteger(quota) || quota < 1 || quota > targets.length) throw new RangeError('invalid quota');
	const requirements = new Uint8Array(n * n);
	for (const target of targets) {
		const cell = target.cell;
		const mask = target.mask;
		if (!Number.isInteger(cell) || cell < 0 || cell >= n * n) throw new RangeError('invalid receiver');
		const row = Math.floor(cell / n);
		const col = cell % n;
		const edgeRow = row === 0 || row === n - 1;
		const edgeCol = col === 0 || col === n - 1;
		if (edgeRow === edgeCol || requirements[cell]) throw new RangeError('receiver must be a unique reachable border cell');
		if (!Number.isInteger(mask) || mask < 0 || mask > 7) throw new RangeError('invalid color mask');
		requirements[cell] = mask || CONTRACT_ANY;
	}
	return { requirements, quota, forbidOutside: !!forbidOutside };
}

function createStrictContract(targets) {
	if (targets.some(target => !target.mask)) throw new RangeError('strict targets require exact colors');
	return createContract(targets, targets.length, true);
}

function evaluateContract(contract, recv) {
	if (recv.length !== contract.requirements.length) throw new RangeError('receiver buffer size mismatch');
	const status = new Uint8Array(recv.length);
	let matches = 0;
	let extras = 0;
	let wrong = 0;
	let unlit = 0;
	for (let cell = 0; cell < recv.length; cell++) {
		const required = contract.requirements[cell];
		const light = recv[cell];
		if (!required) {
			if (contract.forbidOutside && light) extras++;
			continue;
		}
		if (!light) {
			unlit++;
			continue;
		}
		if (required === CONTRACT_ANY || required === light) {
			status[cell] = CONTRACT_MATCH;
			matches++;
		} else {
			status[cell] = CONTRACT_PARTIAL;
			wrong++;
		}
	}
	const unmet = matches < contract.quota;
	return {
		status,
		matches,
		extras,
		percent: Math.floor(100 * Math.min(matches, contract.quota) / (contract.quota + extras)),
		won: !unmet && extras === 0,
		wrongColor: unmet && wrong > 0,
		missingLight: unmet && unlit > 0,
		forbiddenLight: extras > 0
	};
}

function createContractProgress(contract) {
	return { contract, result: null, discoveries: new Uint8Array(contract.requirements.length) };
}

function updateContractProgress(progress, recv) {
	const result = evaluateContract(progress.contract, recv);
	for (let cell = 0; cell < result.status.length; cell++) {
		if (result.status[cell] > progress.discoveries[cell]) progress.discoveries[cell] = result.status[cell];
	}
	progress.result = result;
	return result;
}

function contractState(result) {
	if (!result) return CONTRACT_NONE;
	if (result.won) return CONTRACT_MATCH;
	if (result.matches > 0 || result.wrongColor) return CONTRACT_PARTIAL;
	return CONTRACT_NONE;
}

if (typeof module !== 'undefined') module.exports = {
	CONTRACT_ANY,
	CONTRACT_NONE,
	CONTRACT_PARTIAL,
	CONTRACT_MATCH,
	createContract,
	createStrictContract,
	evaluateContract,
	contractState,
	createContractProgress,
	updateContractProgress
};

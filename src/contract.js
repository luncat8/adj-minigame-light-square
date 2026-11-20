// owns: secret contract evaluation
// edit for: receiver matching and progress

function evaluateContract(contract, hits) {
	let matches = 0;
	let extras = 0;
	const statuses = new Uint8Array(225);
	for (let i = 0; i < hits.length; i++) {
		const requirement = contract.targets[i];
		if (requirement && hits[i]) {
			statuses[i] = requirement === 8 || requirement === hits[i] ? 2 : 1;
			if (statuses[i] === 2) matches++;
		} else if (!requirement && hits[i] && contract.forbidOutside) extras++;
	}
	return { matches, extras, statuses, won: matches >= contract.quota && extras === 0,
		progress: Math.floor(100 * Math.min(matches, contract.quota) / (contract.quota + extras)) };
}

if (typeof module !== 'undefined') module.exports = { evaluateContract };

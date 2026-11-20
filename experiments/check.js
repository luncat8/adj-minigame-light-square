// owns: assertion counters shared by experiment fixtures
// edit for: assertion helpers

let pass = 0;
let fail = 0;

function ok(cond, msg) {
	if (cond) {
		pass++;
		return;
	}
	fail++;
	console.log('FAIL ' + msg);
}

function eq(got, want, msg) {
	ok(got === want, msg + ' got=' + got + ' want=' + want);
}

function same(arr, want, msg) {
	let h = true;
	const n = want.length;
	for (let i = 0; i < n; i++) {
		if (arr[i] !== want[i]) {
			h = false;
			break;
		}
	}
	ok(h, msg);
}

function report(name) {
	console.log(name + ' pass=' + pass + ' fail=' + fail);
	if (fail) process.exit(1);
}

module.exports = { ok, eq, same, report };

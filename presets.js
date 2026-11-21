// owns: compact count-preserving fallback templates (white mirrors only)
// edit for: template decoding; catalog data is rebuilt by experiments/build_presets.js

// key order: mode (quarter, single) × corner (hold, flip) × mirror count 1…cells.
// code = ceil(cells/3) digits of three 2-bit cells (0 clear, 1 '/', 2 '\'),
// one hex witness emitter, then forward scramble letters from PRESET_MOVES
const PRESET_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PRESET_MOVES = 'aAbBcCdDeE';
const PRESET_CODES = [
	'AAAAAABAAAAAAAAAA8cB', 'CAAACAAAAAAAAAAAAaAc', 'AAAAAAAAAAAgEAABA4Ba', 'AAAEAACEAAABAAAAA6cB', 'AgAQAAgAAAAQAEAAA8bb', 'AAAAACABAEAAQIQAA9BB', 'AQABAAAACAAEEAAQB6BD',
	'AEAAAQBACAQABIBAA8cB', 'AgAEBEAAACCIBACAA5Bc', 'ACBAAAQAIACAEBEoA8ba', 'SBEBICABgACAAQAAA7BC', 'AAIBAgABogIEBAoAA6aD', 'EBEEEAAAQQAYACEhA8cA', 'AgEkAACAhAQUEASQA8AC',
	'AAJCkAARAQAEEUmAA5ca', 'SgAAgBBgAZAAKAoQC6BA', 'gAgIBBYAghSAIIgIC6aD', 'iARBBhAEAEQgGAJSA6cb', 'QGoQEFIBIGgABQQBA9CC', 'QKggAkBQIAKGoECBB9bc', 'ASSUkAgCCKGQIBRAB7AC',
	'CJIAACQBEVQikEViA7aC', 'hBBWBAoFSIIGQAoIC8Ac', 'BYgQBgClFAIiSYBkC5Da', 'EYKFKIWEEAYAiUYGA6ac', 'QooqQiYhBCCApBIkC6aC', 'ABIgoliKApAYVYKVAaDa', 'IgIgApkVUGoGaoECB8ab',
	'WChYikpUGIAFYgYoA4Ca', 'phEoUEKggYSQhUlYC5ba', 'IKEKZhVIGCBkIGZVC6ac', 'KUGGJmlRBIRgFiUSC9AC', 'iRoQCgapBlVpihFFAaCa', 'pRgYZJRkmSaJVAhQBaAc', 'YYoCaGQQkWVJZhWUC7Cb',
	'mmYKaFFqoSEYIpVKA7DA', 'WhhAKoUWWhkKVWqJC6Cb', 'YEmSYVJoRGKmVpFqC4cD', 'YRpoapWpamaGUBGgB7bD', 'qqqVJqZSKWkQJlElC4cB', 'YZqUaZCmUqaUZZlEB6BA', 'ahqBWWWqpUpoVZqoA6Ab',
	'ZVkUlVIWVmaUVqWGB9ca', 'VZaqmqoVoaaomWEWB8aD', 'kpCWmZqmqZaapmVRC6CA', 'lqaWllpJZmaZWVKZA5BA', 'VmUVolmpZaWqaqqWCaBa', 'lZpZpmqlaZVUlWWZB4aB', 'mWpZmVZWaaZqaWpWB8ac',
	'AAAAAAAAAAAAAAgAA4cA', 'ACAAAAAAgAAAAAAAA7DB', 'AAAAAgAAAEAAAQAAA6bc', 'CAAAIIAAAAQAAAAAA4bA', 'AACAAACAAIAAAAAiA5aa', 'AkAIAIAAAAgAIAAAA7Ab', 'AABAABSAAAAIIAAgAaCb',
	'gEIAQAAQAAABACAIA4aB', 'IIAAAAAAEECiAIAEA8ac', 'YAAQAAAAIZCICAAAA8aB', 'ABAQAAAAAYRAJAgBB8aB', 'QEFABIIEAAABABACC5AB', 'AQhgAIKQAAASQIQAA4DC', 'AAJBVAYAAAASGAJAA6BD',
	'KBlggESCAIAgAAAACaCA', 'AFQAREAQREBFAiAIAaAA', 'EEGCgAIABggAIopCA7aD', 'EEAAQAAFFgFJRIUIA7BA', 'VgAWIQBgBUEGAEAgA4ca', 'AEYQEkGACCZBAQQlA7Ac', 'SAGQEEAKYACkaYBABaaC',
	'WSZhEKQIAAKBACAKB4Ba', 'EWCQqAAhaBUIYIQEAaac', 'EYQAhAaASYSIimgCCaDb', 'QKgkYIgQBgoVJUJIA8Ab', 'ERBKoiJhBKGACYiECaaC', 'lpEoCiAEGlaUgAQYA7cA', 'AkAkUSVZkaiBSgAaA6BD',
	'qGJQYSAFQiVKiBBUB6Ac', 'gKigiJGRoRhUiSCGB7Ac', 'VJEYmFRBgJgRBqYhC9ca', 'CJFpJKhZJAJqpSgkA9CA', 'lkEVioJaYBaqAoREB6aD', 'ZqQipKgWQkmSWChCCaDA', 'UJGQaiYVGYgqKYpUCaAc',
	'FWikGCpCgRZYZoZVB4Ac', 'IoUYQFWpBGapalZiB8cA', 'KAZhhapqlVYGaJYoC4AB', 'mqpmKmqmpoRSCBUkC6Ab', 'WaEqlVRmCKqWihpkB7Ca', 'YRRFVqVYVkaVUlaUB6AB', 'pUmlpkkVaVaqZkElA4AD',
	'kmJJUqClqVWpalZaB8aa', 'iaVYVoVmVqaVJRZWB6AB', 'mGmVqZmZliRpUaVmB4Ca', 'allZJFmlqmpmhlZlB8CA', 'qmFqplZqllqZVVpKB6Cb', 'ppWaZplVlqmpqplGCaBa', 'qVqaqqVaaVaWpqZmC7Ba',
	'AAABAAAAAAAAAAAAA5bC', 'AAAAQAAAAAAACAAAA4Ab', 'EAAAQAAAAAAABAAAA5bb', 'gAAABACAAAAAAAQAA6Ca', 'ACAQAgAAAgAAgAAAA8Ba', 'AAAAAAoAAIAAAGQAA6AD', 'EBARAIAAAAAAAIAAC5AA',
	'IQBAAhACCAAAAAAEA4aC', 'AAACSggQAAAAAICIA8Da', 'QQQIIAQgEgAAAAAAC7ba', 'BAAAEFBKIAgAAAiAA4AB', 'IIAVQEgQCABAAAQAA5cb', 'ABCgAJBoAgQAAUQAA6Ab', 'AAREFBAEJAAEQAAGB6Cb',
	'AQIAAgSogSAFBCIAA6ba', 'AEAAAiEWBREAYAQgBaAD', 'AACFoIAgBogEIIAiCaDC', 'EIgAIFIZZIAgIAAiA5ba', 'KAQUBIQBhICUACChA6Cb', 'iIACABIIZBAQEkGoC8Ab', 'AJigAoEiigCCWQgACaAB',
	'AGAmgUABKAaSgRJBA8ba', 'AYGSGRKiQAgEEGhEA8BA', 'gARJBFCpAFSRBIgKB4AC', 'IGESgIQZBQoBIZIFB6bA', 'SEYlGaEIAJiCWABBB5Ca', 'BmCIkCYBKBQoRaRRAacA', 'maGAUQZAJgKIiFGQC9Ab',
	'YWkSAGEmpASlRKEEA7BA', 'GoJEAApWmhIkqqEiA4DA', 'IoRRkRkqlRAFKAmhC5bA', 'hSYGZgYhCCapmggiB5cA', 'kKVYmgIlilAkQZFiC4aD', 'WEWlSWmoBFSEJIWRA8bb', 'CmWQhEqiaKFimhhZAaCb',
	'qhkZKVYBZZFqEUKQC5aa', 'hmZkgWmaIgWhBVlUC8CD', 'kFqQaGpgmWkmEaqKC6BB', 'QlphGYGGoqFVJqqaB7Ab', 'aoCamSKkppUlZpFJC4Db', 'RqZZaqhGFUqEpVFWC8DB', 'amEKlFaampUSkpVaC6AC',
	'aRmJmlJSimWaiaaaC9aD', 'WImloVZZZWWqpalFA8CA', 'qUqpVqlqGklqWqGpB6aB', 'VGalZlpZlpWqmomWA7BC', 'SmZpZqlmmWlVZpYmB5AC', 'lVlWYqlqWVWlVZZqC6Ab', 'allVVmlWqpWZVlZZC8bA',
	'AAAAAACAAAAAAAAAA7Ac', 'gAAAAAACAAAAAAAAA6Ba', 'AABAAAAACAABAAAAA9Db', 'ABAAAAAAAAAgAEgAA8BC', 'gAAAIAgQAgAAAAAAA4aa', 'BAEAAAAAAIAEEAAAB4bA', 'AAASAgAACASAAAAQA9ba',
	'AAgAIEQAAUAAgAAgA9AA', 'AAIAAAgIAACEIAgJA5aB', 'AkGIEAABgAAAIAIAA5bA', 'CIBABARACAACEIQAA4Ca', 'EUQhgaEAAAAAQAAAA6bD', 'AIEhBAgAUAQAIoACA7aC', 'QABJBIBghACkACAAA9ac',
	'AQACIRiIBAgQAhIIA6Ba', 'gAIZBAAYAgJKECAIA8Ac', 'AgAQgQIAVZFIIgEAAacB', 'ASIFKZhCKAAAAUAIA4ab', 'IFYAAAIYgGAACmRICaAB', 'JgYIIIgSACGooQEAA7cc', 'AQiUkKoChABUAKASA6ac',
	'JIICEZEBgiigQhAEBaDA', 'ogikYBUGAAQJiIKCA7aa', 'gBURESEIoQRgAZmEAaaB', 'YCSCgSaSAIAigqSYA7bC', 'KgImBFVGEgUIRGCEAabb', 'SSAKZACGSiJYYREKA6BD', 'ZGJBVIhhIUoAEkCoC8DB',
	'USopagICQJKKQFRCB6aC', 'RBRIQKVpSCiWSEIZA9bA', 'KllmAkIAgZmBRKkGC7AC', 'aESWWRgQUKFAFJloB8CC', 'kZFiBmRSUYSpiFgCB4ab', 'ilkKJYkISohohKkqC7Ac', 'VqYhRCKSVaGaEhYEB4ca',
	'SlUlqAmqKFKZoKQRB5BC', 'FFhhpSJKaplKSBYlB9bA', 'BUiGkpKRiZqaVlpgC9cD', 'JVaGaWZaFqVAJFakAaAb', 'ppVFpRmiFIUlaKlUC7DA', 'WpialZUIpVmJUkmhC9CA', 'VRqapVlZkoWKhaYaA9Da',
	'qqJhYqYamlqRFVqlCaDa', 'qpiRoZlVaUZVmFlpB6aB', 'mVmJZpqZVKaVZGRpB6aD', 'ZVaZpplmGmZSlYlZCaAb', 'aWmZllqoopaamaalC6ca', 'WWmmamWqqqVkalVlB6AA', 'ZmWmplZppmampWqVB6aD'
];

function presetIndex(mode, corner, count, cells) {
	return (mode * 2 + (corner ? 1 : 0)) * cells + count - 1;
}

// fills tiles with the witness glass; returns the witness emitter and forward action ids
function presetTemplate(mode, corner, count, tiles) {
	const code = PRESET_CODES[presetIndex(mode, corner, count, tiles.length)];
	for (let i = 0; i < tiles.length; i++) {
		const cell = (PRESET_DIGITS.indexOf(code[(i / 3) | 0]) >> (2 * (i % 3))) & 3;
		tiles[i] = cell ? 7 | (cell === 2 ? 8 : 0) : 0;
	}
	const head = Math.ceil(tiles.length / 3);
	const forward = [];
	for (let k = head + 1; k < code.length; k++) forward.push(PRESET_MOVES.indexOf(code[k]));
	return { emitter: parseInt(code[head], 16), forward };
}

if (typeof module !== 'undefined') module.exports = {
	PRESET_DIGITS,
	PRESET_MOVES,
	PRESET_CODES,
	presetIndex,
	presetTemplate
};

#!/usr/bin/env node
/*
 * Tests for iban.mjs. No dependencies: run `node scripts/test.mjs`.
 *
 * REGISTRY holds, for every supported country, the IBAN length, BBAN structure,
 * electronic-format example and print-format example published in the SWIFT
 * IBAN Registry, Release 103 (September 2026). Each example must validate, must
 * round-trip through `build`, and each broken variant of it must fail at the
 * expected check.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildIban, countryList, findCountry, formatIban, validateIban } from './iban.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, 'iban.mjs');
const skillDir = dirname(here);

// [code, IBAN length, BBAN structure, IBAN electronic format example, IBAN print format example]
const REGISTRY = [
  ['AD', 24, '4!n4!n12!c', 'AD1200012030200359100100', 'AD12 0001 2030 2003 5910 0100'],
  ['AE', 23, '3!n16!n', 'AE070331234567890123456', 'AE07 0331 2345 6789 0123 456'],
  ['AL', 28, '8!n16!c', 'AL47212110090000000235698741', 'AL47 2121 1009 0000 0002 3569 8741'],
  ['AT', 20, '5!n11!n', 'AT611904300234573201', 'AT61 1904 3002 3457 3201'],
  ['BA', 20, '3!n3!n8!n2!n', 'BA391290079401028494', 'BA39 1290 0794 0102 8494'],
  ['BE', 16, '3!n7!n2!n', 'BE68539007547034', 'BE68 5390 0754 7034'],
  ['BG', 22, '4!a4!n2!n8!c', 'BG80BNBG96611020345678', 'BG80 BNBG 9661 1020 3456 78'],
  ['CH', 21, '5!n12!c', 'CH9300762011623852957', 'CH93 0076 2011 6238 5295 7'],
  ['CY', 28, '3!n5!n16!c', 'CY17002001280000001200527600', 'CY17 0020 0128 0000 0012 0052 7600'],
  ['CZ', 24, '4!n16!n', 'CZ6508000000192000145399', 'CZ65 0800 0000 1920 0014 5399'],
  ['DE', 22, '8!n10!n', 'DE89370400440532013000', 'DE89 3704 0044 0532 0130 00'],
  ['DK', 18, '4!n9!n1!n', 'DK5000400440116243', 'DK50 0040 0440 1162 43'],
  ['EE', 20, '2!n14!n', 'EE382200221020145685', 'EE38 2200 2210 2014 5685'],
  ['ES', 24, '4!n4!n1!n1!n10!n', 'ES9121000418450200051332', 'ES91 2100 0418 4502 0005 1332'],
  ['FI', 18, '3!n11!n', 'FI2112345600000785', 'FI21 1234 5600 0007 85'],
  ['FR', 27, '5!n5!n11!c2!n', 'FR1420041010050500013M02606', 'FR14 2004 1010 0505 0001 3M02 606'],
  ['GB', 22, '4!a6!n8!n', 'GB29NWBK60161331926819', 'GB29 NWBK 6016 1331 9268 19'],
  ['GR', 27, '3!n4!n16!c', 'GR1601101250000000012300695', 'GR16 0110 1250 0000 0001 2300 695'],
  ['HR', 21, '7!n10!n', 'HR1210010051863000160', 'HR12 1001 0051 8630 0016 0'],
  ['HU', 28, '3!n4!n1!n15!n1!n', 'HU42117730161111101800000000', 'HU42 1177 3016 1111 1018 0000 0000'],
  ['IE', 22, '4!a6!n8!n', 'IE29AIBK93115212345678', 'IE29 AIBK 9311 5212 3456 78'],
  ['IS', 26, '4!n2!n6!n10!n', 'IS140159260076545510730339', 'IS14 0159 2600 7654 5510 7303 39'],
  ['IT', 27, '1!a5!n5!n12!c', 'IT60X0542811101000000123456', 'IT60 X054 2811 1010 0000 0123 456'],
  ['LI', 21, '5!n12!c', 'LI21088100002324013AA', 'LI21 0881 0000 2324 013A A'],
  ['LT', 20, '5!n11!n', 'LT121000011101001000', 'LT12 1000 0111 0100 1000'],
  ['LU', 20, '3!n13!c', 'LU280019400644750000', 'LU28 0019 4006 4475 0000'],
  ['LV', 21, '4!a13!c', 'LV80BANK0000435195001', 'LV80 BANK 0000 4351 9500 1'],
  ['MC', 27, '5!n5!n11!c2!n', 'MC5811222000010123456789030', 'MC58 1122 2000 0101 2345 6789 030'],
  ['ME', 22, '3!n13!n2!n', 'ME25505000012345678951', 'ME25 5050 0001 2345 6789 51'],
  ['MT', 31, '4!a5!n18!c', 'MT84MALT011000012345MTLCAST001S', 'MT84 MALT 0110 0001 2345 MTLC AST0 01S'],
  ['NL', 18, '4!a10!n', 'NL91ABNA0417164300', 'NL91 ABNA 0417 1643 00'],
  ['NO', 15, '4!n6!n1!n', 'NO9386011117947', 'NO93 8601 1117 947'],
  ['PL', 28, '8!n16!n', 'PL61109010140000071219812874', 'PL61 1090 1014 0000 0712 1981 2874'],
  ['PT', 25, '4!n4!n11!n2!n', 'PT50000201231234567890154', 'PT50 0002 0123 1234 5678 9015 4'],
  ['RO', 24, '4!a16!c', 'RO49AAAA1B31007593840000', 'RO49 AAAA 1B31 0075 9384 0000'],
  ['RS', 22, '3!n13!n2!n', 'RS35260005601001611379', 'RS35 2600 0560 1001 6113 79'],
  ['SA', 24, '2!n18!c', 'SA0380000000608010167519', 'SA03 8000 0000 6080 1016 7519'],
  ['SE', 24, '3!n16!n1!n', 'SE4550000000058398257466', 'SE45 5000 0000 0583 9825 7466'],
  ['SI', 19, '5!n8!n2!n', 'SI56263300012039086', 'SI56 2633 0001 2039 086'],
  ['SK', 24, '4!n6!n10!n', 'SK3112000000198742637541', 'SK31 1200 0000 1987 4263 7541'],
  ['SM', 27, '1!a5!n5!n12!c', 'SM86U0322509800000000270100', 'SM86 U032 2509 8000 0000 0270 100'],
];

/* The registry's separate BBAN example for Bosnia and Herzegovina differs from its IBAN example. */
const EXTRA_BBANS = [['BA', '1990440001200279']];

const NATIONAL = ['AL', 'BA', 'BE', 'EE', 'ES', 'FI', 'FR', 'HU', 'IT', 'MC', 'ME', 'NO', 'PL', 'PT', 'RS', 'SI', 'SM'];

/* ---------- helpers, written independently of iban.mjs ---------- */

function referenceMod97(text) {
  let remainder = 0;
  for (const char of text) {
    const value = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

/* Recompute the IBAN check digits so that only a national check can fail. */
function withFreshCheckDigits(code, bban) {
  const digits = String(98 - referenceMod97(`${bban}${code}00`)).padStart(2, '0');
  return `${code}${digits}${bban}`;
}

function classesOf(structure) {
  let out = '';
  for (const [, count, kind] of structure.matchAll(/(\d+)!([nac])/g)) out += kind.repeat(Number(count));
  return out;
}

function replaceAt(text, index, char) {
  return text.slice(0, index) + char + text.slice(index + 1);
}

function otherOfSameClass(char) {
  if (/[0-9]/.test(char)) return String((Number(char) + 1) % 10);
  return char === 'Z' ? 'A' : String.fromCharCode(char.charCodeAt(0) + 1);
}

function statusOf(result, check) {
  return result.checks.find((c) => c.check === check)?.status;
}

function run(...args) {
  const child = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { status: child.status, json: child.stdout.trim().startsWith('{') || child.stdout.trim().startsWith('[') ? JSON.parse(child.stdout) : null, stdout: child.stdout };
}

/* ---------- country data against the registry ---------- */

test('the script covers exactly the registry rows listed here', () => {
  assert.deepEqual(
    countryList().map((c) => c.code).sort(),
    REGISTRY.map(([code]) => code).sort(),
  );
});

for (const [code, length, structure, example, printed] of REGISTRY) {
  test(`${code}: data matches the registry`, () => {
    const country = countryList().find((c) => c.code === code);
    assert.equal(country.length, length, 'IBAN length');
    assert.equal(country.bbanPattern, structure, 'BBAN structure');
    assert.equal(country.layout.replace(/\s/g, '').length, length, 'layout length');
    assert.equal(country.fields.reduce((sum, f) => sum + f.length, 0), length - 4, 'fields add up to the BBAN');
    assert.equal(classesOf(structure).length, length - 4, 'structure adds up to the BBAN');
    assert.equal(country.example, printed, 'example in print format');
    assert.equal(Boolean(country.nationalCheck), NATIONAL.includes(code), 'national check present');
    const classes = classesOf(structure);
    let offset = 0;
    for (const field of country.fields) {
      assert.equal(new Set(classes.slice(offset, offset + field.length)).size, 1, `${field.name} has one character type`);
      offset += field.length;
    }
  });

  test(`${code}: registry example is valid`, () => {
    for (const input of [example, printed, printed.toLowerCase(), `IBAN ${printed}`]) {
      const result = validateIban(input);
      assert.equal(result.valid, true, `${input}: ${JSON.stringify(result.checks)}`);
      assert.equal(result.failed, null);
      assert.equal(result.iban, example);
      assert.equal(result.formatted, printed);
      assert.equal(result.fields.map((f) => f.value).join(''), example.slice(4));
      for (const check of ['country', 'length', 'characters', 'mod97']) assert.equal(statusOf(result, check), 'pass', check);
      assert.equal(statusOf(result, 'national'), NATIONAL.includes(code) ? 'pass' : 'not-applicable');
    }
  });

  test(`${code}: registry example round-trips through build`, () => {
    const { fields } = validateIban(example);
    const country = findCountry(code);
    const values = fields.map((f, i) => (country.fields[i].kind === 'c' ? f.value.replace(/^0+(?=.)/, '') : f.value));
    const built = buildIban(code, values);
    assert.equal(built.ok, true, JSON.stringify(built));
    assert.equal(built.iban, example);
    const whole = buildIban(code.toLowerCase(), [example.slice(4)]);
    assert.equal(whole.ok, true, JSON.stringify(whole));
    assert.equal(whole.iban, example);
  });

  test(`${code}: broken variants fail at the expected check`, () => {
    const bban = example.slice(4);
    const classes = classesOf(structure);
    const expectFailure = (input, check, label) => {
      const result = validateIban(input);
      assert.equal(result.valid, false, `${label}: ${input} should be invalid`);
      assert.equal(result.failed, check, `${label}: ${input} failed ${result.failed}, expected ${check}`);
      const index = result.checks.findIndex((c) => c.check === check);
      assert.ok(result.checks[index].detail, `${label}: failure has a detail`);
      for (const later of result.checks.slice(index + 1)) {
        if (check !== 'country') assert.equal(later.status, 'skipped', `${label}: ${later.check} skipped`);
      }
      return result;
    };

    // country
    expectFailure(`1${example.slice(1)}`, 'country', 'digit in country code');
    const unknown = expectFailure(`ZZ${example.slice(2)}`, 'country', 'unknown country');
    assert.equal(statusOf(unknown, 'country'), 'unsupported');

    // length
    expectFailure(example.slice(0, -1), 'length', 'one character short');
    expectFailure(`${example}0`, 'length', 'one character long');

    // characters
    expectFailure(`${code}AB${bban}`, 'characters', 'letters as check digits');
    const wrong = { n: 'A', a: '1', c: '*' };
    for (const kind of new Set(classes)) {
      const index = classes.indexOf(kind);
      expectFailure(`${code}${example.slice(2, 4)}${replaceAt(bban, index, wrong[kind])}`, 'characters', `bad ${kind} at ${index}`);
    }

    // mod97
    const next = String((Number(example.slice(2, 4)) - 1) % 97 + 2).padStart(2, '0');
    expectFailure(`${code}${next}${bban}`, 'mod97', 'changed check digits');
    for (const digits of ['00', '01', '99']) expectFailure(`${code}${digits}${bban}`, 'mod97', `check digits ${digits}`);
    // a digit that the structure allows to be any other digit
    const isDigit = (i) => classes[i] !== 'a' && /[0-9]/.test(bban[i]);
    const digitAt = [...bban].findIndex((char, i) => isDigit(i));
    expectFailure(`${example.slice(0, 4)}${replaceAt(bban, digitAt, otherOfSameClass(bban[digitAt]))}`, 'mod97', 'one digit changed');
    const swapAt = [...bban].findIndex(
      (char, i) => i + 1 < bban.length && isDigit(i) && isDigit(i + 1) && bban[i] !== bban[i + 1],
    );
    if (swapAt >= 0) {
      const swapped = bban.slice(0, swapAt) + bban[swapAt + 1] + bban[swapAt] + bban.slice(swapAt + 2);
      expectFailure(`${example.slice(0, 4)}${swapped}`, 'mod97', 'neighbouring digits swapped');
    }

    // national: change a national check character, keep the IBAN check digits consistent
    const country = findCountry(code);
    for (const field of country.fields.filter((f) => f.kind === 'x')) {
      const changed = replaceAt(bban, field.start, otherOfSameClass(bban[field.start]));
      const input = withFreshCheckDigits(code, changed);
      const result = expectFailure(input, 'national', `national check at ${field.start}`);
      assert.equal(statusOf(result, 'mod97'), 'pass');
    }
  });
}

/* ---------- national checks against independent reference implementations ---------- */

/* Deterministic pseudo-random numbers (mulberry32), so failures can be reproduced. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sumWeighted = (digits, weights) => [...digits].reduce((sum, d, i) => sum + Number(d) * weights[i], 0);
const tenComplement = (sum) => (sum % 10 === 0 ? 0 : 10 - (sum % 10));
const mod97Key = (digits) => String(98 - referenceMod97(`${digits}00`)).padStart(2, '0');
const RIB_LETTERS = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const CIN_CHARS = '0123456789';
const CIN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CIN_ODD_LIST = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
const spain = (digits, weights) => {
  const r = sumWeighted(digits, weights) % 11;
  return r === 0 ? 0 : r === 1 ? 1 : 11 - r;
};

/*
 * Each entry fills in the national check characters of a BBAN whose other
 * characters are random, or returns null when no valid check exists.
 */
const REFERENCE = {
  AL: (b) => b.slice(0, 7) + tenComplement(sumWeighted(b.slice(0, 7), [9, 7, 3, 1, 9, 7, 3])) + b.slice(8),
  BA: (b) => b.slice(0, 14) + mod97Key(b.slice(0, 14)),
  BE: (b) => {
    const r = Number(b.slice(0, 10)) % 97;
    return b.slice(0, 10) + String(r === 0 ? 97 : r).padStart(2, '0');
  },
  EE: (b) => b.slice(0, 15) + tenComplement(sumWeighted(b.slice(2, 15), [7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7])),
  ES: (b) => b.slice(0, 8) + spain(b.slice(0, 8), [4, 8, 5, 10, 9, 7, 3, 6]) + spain(b.slice(10), [1, 2, 4, 8, 5, 10, 9, 7, 3, 6]) + b.slice(10),
  FI: (b) => {
    const sum = [...b.slice(0, 13)].reduce((acc, d, i) => {
      const product = Number(d) * (i % 2 === 0 ? 2 : 1);
      return acc + Math.floor(product / 10) + (product % 10);
    }, 0);
    return b.slice(0, 13) + tenComplement(sum);
  },
  FR: (b) => {
    const numeric = [...b.slice(0, 21)].map((c) => RIB_LETTERS[c] ?? c).join('');
    return b.slice(0, 21) + String(97 - referenceMod97(`${numeric}00`)).padStart(2, '0');
  },
  HU: (b) => {
    const first = tenComplement(sumWeighted(b.slice(0, 7), [9, 7, 3, 1, 9, 7, 3]));
    const second = tenComplement(sumWeighted(b.slice(8, 23), [9, 7, 3, 1, 9, 7, 3, 1, 9, 7, 3, 1, 9, 7, 3]));
    return b.slice(0, 7) + first + b.slice(8, 23) + second;
  },
  IT: (b) => {
    const body = b.slice(1);
    let sum = 0;
    for (let k = 0; k < 22; k++) {
      let i = CIN_CHARS.indexOf(body[k]);
      if (i < 0) i = CIN_LETTERS.indexOf(body[k]);
      sum += k % 2 === 0 ? CIN_ODD_LIST[i] : i;
    }
    return CIN_LETTERS[sum % 26] + body;
  },
  ME: (b) => b.slice(0, 16) + mod97Key(b.slice(0, 16)),
  NO: (b) => {
    const r = sumWeighted(b.slice(0, 10), [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]) % 11;
    const digit = r === 0 ? 0 : 11 - r;
    return digit === 10 ? null : b.slice(0, 10) + digit;
  },
  PL: (b) => b.slice(0, 7) + tenComplement(sumWeighted(b.slice(0, 7), [3, 9, 7, 1, 3, 9, 7])) + b.slice(8),
  PT: (b) => b.slice(0, 19) + mod97Key(b.slice(0, 19)),
  RS: (b) => b.slice(0, 16) + mod97Key(b.slice(0, 16)),
  SI: (b) => (b.startsWith('01') ? null : b.slice(0, 13) + mod97Key(b.slice(0, 13))),
};
REFERENCE.MC = REFERENCE.FR;
REFERENCE.SM = REFERENCE.IT;

test('reference implementations cover every national check', () => {
  assert.deepEqual(Object.keys(REFERENCE).sort(), [...NATIONAL].sort());
});

for (const code of NATIONAL) {
  test(`${code}: national check agrees with a reference implementation on random accounts`, () => {
    const next = random(code.charCodeAt(0) * 256 + code.charCodeAt(1));
    const classes = classesOf(REGISTRY.find(([c]) => c === code)[2]);
    const country = findCountry(code);
    const alphabet = { n: '0123456789', a: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', c: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' };
    let checked = 0;
    while (checked < 200) {
      const draft = [...classes].map((kind) => alphabet[kind][Math.floor(next() * alphabet[kind].length)]).join('');
      const bban = REFERENCE[code](draft);
      if (bban === null) continue;
      assert.equal(bban.length, classes.length);
      const result = validateIban(withFreshCheckDigits(code, bban));
      assert.equal(result.valid, true, `${code} ${bban}: ${JSON.stringify(result.checks)}`);
      assert.equal(statusOf(result, 'national'), 'pass');
      for (const field of country.fields.filter((f) => f.kind === 'x')) {
        const changed = replaceAt(bban, field.start, otherOfSameClass(bban[field.start]));
        assert.equal(validateIban(withFreshCheckDigits(code, changed)).failed, 'national', `${code} ${changed}`);
      }
      checked += 1;
    }
  });
}

test('NO: an account with no possible check digit is rejected for every digit', () => {
  // The first ten-digit number whose weighted sum leaves 1 would need the check digit 10.
  let base = null;
  for (let n = 0; base === null; n++) {
    const digits = String(n).padStart(10, '0');
    if (sumWeighted(digits, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]) % 11 === 1) base = digits;
  }
  for (let d = 0; d <= 9; d++) {
    assert.equal(validateIban(withFreshCheckDigits('NO', `${base}${d}`)).failed, 'national', `${base}${d}`);
  }
});

/* ---------- other cases ---------- */

test('registry BBAN example for Bosnia and Herzegovina builds and passes the national check', () => {
  for (const [code, bban] of EXTRA_BBANS) {
    const built = buildIban(code, [bban]);
    assert.equal(built.ok, true, JSON.stringify(built));
    assert.equal(statusOf(validateIban(built.iban), 'national'), 'pass');
  }
});

test('Slovenian bank code 01 is exempt from the national check', () => {
  const result = validateIban(withFreshCheckDigits('SI', '010000000000000'));
  assert.equal(result.valid, true, JSON.stringify(result.checks));
  assert.equal(statusOf(result, 'national'), 'not-applicable');
});

test('unsupported country still gets a characters and mod-97 check', () => {
  const good = validateIban(withFreshCheckDigits('TR', '0006100519786457841326'));
  assert.equal(good.failed, 'country');
  assert.equal(statusOf(good, 'characters'), 'pass');
  assert.equal(statusOf(good, 'mod97'), 'pass');
  const bad = validateIban('TR000006100519786457841326');
  assert.equal(statusOf(bad, 'mod97'), 'fail');
});

test('empty and non-IBAN input fail the country check', () => {
  assert.equal(validateIban('').failed, 'country');
  assert.equal(validateIban('   ').failed, 'country');
  assert.equal(validateIban('12345').failed, 'country');
});

test('build reports problems with the fields', () => {
  assert.equal(buildIban('XX', ['1']).ok, false);
  const count = buildIban('DE', ['37040044']);
  assert.equal(count.ok, false);
  assert.match(count.error, /bank code, account number/);
  assert.equal(buildIban('DE', ['3704004', '532013000']).ok, false, 'bank code too short');
  assert.equal(buildIban('DE', ['37040044', '12345678901']).ok, false, 'account number too long');
  assert.match(buildIban('DE', ['37040044', '5320*13000']).error, /only letters and digits/);
  assert.equal(buildIban('DE', ['3704004A', '532013000']).failed, 'characters');
  const national = buildIban('BE', ['539', '0075470', '35']);
  assert.equal(national.ok, false);
  assert.equal(national.failed, 'national');
  assert.equal(buildIban('BE', ['539-0075470-34']).iban, 'BE68539007547034', 'separators in a whole BBAN');
  assert.equal(buildIban('NO', ['8601.11.17947']).iban, 'NO9386011117947');
});

test('formatIban groups by four', () => {
  assert.equal(formatIban('NO9386011117947'), 'NO93 8601 1117 947');
});

/* ---------- command line ---------- */

test('command line: exit status and JSON output', () => {
  const ok = run('validate', 'DE89', '3704', '0044', '0532', '0130', '00');
  assert.equal(ok.status, 0);
  assert.equal(ok.json.valid, true);
  const bad = run('validate', 'DE89370400440532013001');
  assert.equal(bad.status, 1);
  assert.equal(bad.json.failed, 'mod97');
  assert.equal(run('validate').status, 2);
  assert.equal(run('nonsense').status, 2);
  assert.equal(run().status, 2);
  assert.equal(run('help').status, 0);
  const built = run('build', 'DE', '37040044', '532013000');
  assert.equal(built.status, 0);
  assert.equal(built.json.iban, 'DE89370400440532013000');
  assert.equal(run('build', 'DE', '1').status, 1);
  assert.equal(run('countries').json.length, REGISTRY.length);
  assert.equal(run('countries', 'de').json.code, 'DE');
  assert.equal(run('countries', 'XX').status, 1);
});

test('command line: runs through a symlinked skill directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'iban-skill-'));
  try {
    const link = join(dir, 'iban');
    symlinkSync(skillDir, link, 'dir');
    const child = spawnSync(process.execPath, [join(link, 'scripts', 'iban.mjs'), 'validate', 'NO9386011117947'], {
      encoding: 'utf8',
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).valid, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ---------- SKILL.md ---------- */

test('SKILL.md front matter, size and country table match the script', () => {
  const text = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
  const lines = text.split('\n');
  assert.ok(lines.length < 500, `SKILL.md has ${lines.length} lines`);
  const front = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(front, 'front matter');
  assert.match(front[1], /^name: iban$/m);
  const description = front[1].match(/^description: (.+)$/m)[1];
  assert.ok(description.length <= 1024, 'description length');
  assert.match(description, new RegExp(`${NATIONAL.length} countries`));
  assert.match(description, new RegExp(`${REGISTRY.length} countries`));

  const rows = lines
    .filter((line) => /^\| [A-Z]{2} \|/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  assert.equal(rows.length, REGISTRY.length, 'one table row per country');
  for (const [code, name, length, layout, national] of rows) {
    const country = countryList().find((c) => c.code === code);
    assert.ok(country, `${code} in the script`);
    assert.equal(name, country.name, `${code} name`);
    assert.equal(Number(length), country.length, `${code} length`);
    assert.equal(layout, `\`${country.layout}\``, `${code} layout`);
    assert.equal(national !== '–', Boolean(country.nationalCheck), `${code} national check`);
  }
});

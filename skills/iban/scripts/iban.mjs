#!/usr/bin/env node
/*
 * Offline IBAN validator, explainer and builder.
 * No dependencies and no network access. Requires Node.js 18 or later.
 *
 *   node iban.mjs validate <iban>               check an IBAN and split it into its fields
 *   node iban.mjs build <country> <field>...    assemble an IBAN from national account details
 *   node iban.mjs countries [<country>]         list the countries and their layouts
 *
 * Every command prints JSON on stdout. Exit status: 0 = valid / built / listed,
 * 1 = the IBAN or the fields failed a check, 2 = the command was used wrongly.
 *
 * Country data: IBAN lengths and BBAN layouts as used by Holyheld's IBAN
 * calculator; character patterns and example IBANs from the SWIFT IBAN
 * Registry, Release 103 (September 2026).
 */

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * Layout letters, after the country code and the check digits (kk):
 *   b bank code, s branch code, c account number, x national check digit,
 *   t account type, i identity number.
 * The BBAN pattern uses the registry notation: 8!n = exactly 8 digits,
 * 4!a = 4 capital letters, 12!c = 12 letters or digits.
 */
// [code, name, IBAN length, layout, BBAN pattern, registry example]
const COUNTRY_ROWS = [
  ['AD', 'Andorra', 24, 'ADkk bbbb ssss cccc cccc cccc', '4!n4!n12!c', 'AD1200012030200359100100'],
  ['AE', 'United Arab Emirates', 23, 'AEkk bbbc cccc cccc cccc ccc', '3!n16!n', 'AE070331234567890123456'],
  ['AL', 'Albania', 28, 'ALkk bbbs sssx cccc cccc cccc cccc', '8!n16!c', 'AL47212110090000000235698741'],
  ['AT', 'Austria', 20, 'ATkk bbbb bccc cccc cccc', '5!n11!n', 'AT611904300234573201'],
  ['BA', 'Bosnia and Herzegovina', 20, 'BAkk bbbs sscc cccc ccxx', '3!n3!n8!n2!n', 'BA391290079401028494'],
  ['BE', 'Belgium', 16, 'BEkk bbbc cccc ccxx', '3!n7!n2!n', 'BE68539007547034'],
  ['BG', 'Bulgaria', 22, 'BGkk bbbb ssss ttcc cccc cc', '4!a4!n2!n8!c', 'BG80BNBG96611020345678'],
  ['CH', 'Switzerland', 21, 'CHkk bbbb bccc cccc cccc c', '5!n12!c', 'CH9300762011623852957'],
  ['CY', 'Cyprus', 28, 'CYkk bbbs ssss cccc cccc cccc cccc', '3!n5!n16!c', 'CY17002001280000001200527600'],
  ['CZ', 'Czech Republic', 24, 'CZkk bbbb ssss sscc cccc cccc', '4!n16!n', 'CZ6508000000192000145399'],
  ['DE', 'Germany', 22, 'DEkk bbbb bbbb cccc cccc cc', '8!n10!n', 'DE89370400440532013000'],
  ['DK', 'Denmark', 18, 'DKkk bbbb cccc cccc cc', '4!n9!n1!n', 'DK5000400440116243'],
  ['EE', 'Estonia', 20, 'EEkk bbss cccc cccc cccx', '2!n14!n', 'EE382200221020145685'],
  ['ES', 'Spain', 24, 'ESkk bbbb ssss xxcc cccc cccc', '4!n4!n1!n1!n10!n', 'ES9121000418450200051332'],
  ['FI', 'Finland', 18, 'FIkk bbbc cccc cccc cx', '3!n11!n', 'FI2112345600000785'],
  ['FR', 'France', 27, 'FRkk bbbb bsss sscc cccc cccc cxx', '5!n5!n11!c2!n', 'FR1420041010050500013M02606'],
  ['GB', 'United Kingdom', 22, 'GBkk bbbb ssss sscc cccc cc', '4!a6!n8!n', 'GB29NWBK60161331926819'],
  ['GR', 'Greece', 27, 'GRkk bbbs sssc cccc cccc cccc ccc', '3!n4!n16!c', 'GR1601101250000000012300695'],
  ['HR', 'Croatia', 21, 'HRkk bbbb bbbc cccc cccc c', '7!n10!n', 'HR1210010051863000160'],
  ['HU', 'Hungary', 28, 'HUkk bbbs sssx cccc cccc cccc cccx', '3!n4!n1!n15!n1!n', 'HU42117730161111101800000000'],
  ['IE', 'Ireland', 22, 'IEkk bbbb ssss sscc cccc cc', '4!a6!n8!n', 'IE29AIBK93115212345678'],
  ['IS', 'Iceland', 26, 'ISkk bbbb sscc cccc iiii iiii ii', '4!n2!n6!n10!n', 'IS140159260076545510730339'],
  ['IT', 'Italy', 27, 'ITkk xbbb bbss sssc cccc cccc ccc', '1!a5!n5!n12!c', 'IT60X0542811101000000123456'],
  ['LI', 'Liechtenstein', 21, 'LIkk bbbb bccc cccc cccc c', '5!n12!c', 'LI21088100002324013AA'],
  ['LT', 'Lithuania', 20, 'LTkk bbbb bccc cccc cccc', '5!n11!n', 'LT121000011101001000'],
  ['LU', 'Luxembourg', 20, 'LUkk bbbc cccc cccc cccc', '3!n13!c', 'LU280019400644750000'],
  ['LV', 'Latvia', 21, 'LVkk bbbb cccc cccc cccc c', '4!a13!c', 'LV80BANK0000435195001'],
  ['MC', 'Monaco', 27, 'MCkk bbbb bsss sscc cccc cccc cxx', '5!n5!n11!c2!n', 'MC5811222000010123456789030'],
  ['ME', 'Montenegro', 22, 'MEkk bbbc cccc cccc cccc xx', '3!n13!n2!n', 'ME25505000012345678951'],
  ['MT', 'Malta', 31, 'MTkk bbbb ssss sccc cccc cccc cccc ccc', '4!a5!n18!c', 'MT84MALT011000012345MTLCAST001S'],
  ['NL', 'Netherlands', 18, 'NLkk bbbb cccc cccc cc', '4!a10!n', 'NL91ABNA0417164300'],
  ['NO', 'Norway', 15, 'NOkk bbbb cccc ccx', '4!n6!n1!n', 'NO9386011117947'],
  ['PL', 'Poland', 28, 'PLkk bbbs sssx cccc cccc cccc cccc', '8!n16!n', 'PL61109010140000071219812874'],
  ['PT', 'Portugal', 25, 'PTkk bbbb ssss cccc cccc cccx x', '4!n4!n11!n2!n', 'PT50000201231234567890154'],
  ['RO', 'Romania', 24, 'ROkk bbbb cccc cccc cccc cccc', '4!a16!c', 'RO49AAAA1B31007593840000'],
  ['RS', 'Serbia', 22, 'RSkk bbbc cccc cccc cccc xx', '3!n13!n2!n', 'RS35260005601001611379'],
  ['SA', 'Saudi Arabia', 24, 'SAkk bbcc cccc cccc cccc cccc', '2!n18!c', 'SA0380000000608010167519'],
  ['SE', 'Sweden', 24, 'SEkk bbbc cccc cccc cccc cccc', '3!n16!n1!n', 'SE4550000000058398257466'],
  ['SI', 'Slovenia', 19, 'SIkk bbss sccc cccc cxx', '5!n8!n2!n', 'SI56263300012039086'],
  ['SK', 'Slovakia', 24, 'SKkk bbbb ssss sscc cccc cccc', '4!n6!n10!n', 'SK3112000000198742637541'],
  ['SM', 'San Marino', 27, 'SMkk xbbb bbss sssc cccc cccc ccc', '1!a5!n5!n12!c', 'SM86U0322509800000000270100'],
];

const FIELD_NAMES = {
  b: 'bank code',
  s: 'branch code',
  c: 'account number',
  x: 'national check digit',
  t: 'account type',
  i: 'identity number',
};

const CLASS_NAMES = { n: 'digits', a: 'capital letters', c: 'letters and digits' };
const CLASS_TESTS = { n: /^[0-9]$/, a: /^[A-Z]$/, c: /^[A-Z0-9]$/ };

/* ---------- arithmetic ---------- */

/* Letters count as 10..35 (A = 10), per ISO 13616. */
function toNumeric(value) {
  let out = '';
  for (const char of value) {
    out += /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
  }
  return out;
}

/* ISO 7064 mod 97-10, digit by digit, so the number never leaves integer range. */
function mod97(numeric) {
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

function ibanCheckDigits(countryCode, bban) {
  return String(98 - mod97(toNumeric(`${bban}${countryCode}00`))).padStart(2, '0');
}

/* (10 - weighted sum mod 10) mod 10, weights repeating from the left. */
function weightedMod10(digits, weights) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[i]) * weights[i % weights.length];
  }
  return (10 - (sum % 10)) % 10;
}

/* Spain: 11 - weighted sum mod 11, where 11 becomes 0 and 10 becomes 1. */
function spanishDigit(tenDigits) {
  const weights = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(tenDigits[i]) * weights[i];
  const digit = 11 - (sum % 11);
  return digit === 11 ? 0 : digit === 10 ? 1 : digit;
}

/* Luhn over a string whose last digit is the check digit. */
function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let value = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
  }
  return sum % 10 === 0;
}

/* France and Monaco: letters in the account number map to 1..9 (A, J -> 1; B, K, S -> 2; ...). */
function ribDigits(value) {
  let out = '';
  for (const char of value) {
    if (/[0-9]/.test(char)) {
      out += char;
      continue;
    }
    const index = char.charCodeAt(0) - 65;
    out += String(index <= 8 ? index + 1 : index <= 17 ? index - 8 : index - 16);
  }
  return out;
}

/* Italy and San Marino: the CIN letter over bank code, branch code and account number. */
const CIN_ODD = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];

function cinLetter(value) {
  let sum = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const index = /[0-9]/.test(char) ? Number(char) : char.charCodeAt(0) - 65;
    sum += i % 2 === 0 ? CIN_ODD[index] : index;
  }
  return String.fromCharCode(65 + (sum % 26));
}

/*
 * National check digits, for the countries whose layout marks them (x).
 * Each check receives the BBAN split into fields: f.b, f.s, f.c and f.x (an
 * array, in layout order). It returns true when the digits match.
 */
const BBAN_MOD97 = {
  algorithm: 'ISO 7064 mod 97-10 over the whole BBAN',
  check: (f, bban) => mod97(bban) === 1,
};
const RIB_KEY = {
  algorithm: 'RIB key: 97 minus (89 x bank code + 15 x branch code + 3 x account number) mod 97',
  check: (f) => {
    const sum = 89 * Number(f.b) + 15 * Number(f.s) + 3 * Number(ribDigits(f.c));
    return 97 - (sum % 97) === Number(f.x[0]);
  },
};
const CIN = {
  algorithm: 'CIN letter: odd/even character table, mod 26, over bank code, branch code and account number',
  check: (f) => cinLetter(f.b + f.s + f.c) === f.x[0],
};

const NATIONAL_CHECKS = {
  AL: {
    algorithm: 'weighted mod 10 (weights 9, 7, 3, 1) over bank and branch code',
    check: (f) => weightedMod10(f.b + f.s, [9, 7, 3, 1]) === Number(f.x[0]),
  },
  BA: BBAN_MOD97,
  BE: {
    algorithm: 'mod 97 of bank code and account number (a remainder of 0 is written 97)',
    check: (f) => {
      const remainder = Number(f.b + f.c) % 97;
      return (remainder === 0 ? 97 : remainder) === Number(f.x[0]);
    },
  },
  EE: {
    algorithm: 'weighted mod 10 (weights 7, 3, 1 from the right) over the account number',
    check: (f) => weightedMod10([...(f.s + f.c)].reverse().join(''), [7, 3, 1]) === Number(f.x[0]),
  },
  ES: {
    algorithm:
      'mod 11 (weights 1, 2, 4, 8, 5, 10, 9, 7, 3, 6): first digit over bank and branch code, second over the account number',
    check: (f) => `${spanishDigit(`00${f.b}${f.s}`)}${spanishDigit(f.c)}` === f.x[0],
  },
  FI: {
    algorithm: 'Luhn mod 10 over the whole BBAN',
    check: (f, bban) => luhnValid(bban),
  },
  FR: RIB_KEY,
  HU: {
    algorithm:
      'weighted mod 10 (weights 9, 7, 3, 1): first digit over bank and branch code, second over the account number',
    check: (f) =>
      weightedMod10(f.b + f.s, [9, 7, 3, 1]) === Number(f.x[0]) &&
      weightedMod10(f.c, [9, 7, 3, 1]) === Number(f.x[1]),
  },
  IT: CIN,
  MC: RIB_KEY,
  ME: BBAN_MOD97,
  NO: {
    algorithm: 'mod 11 (weights 5, 4, 3, 2, 7, 6, 5, 4, 3, 2) over bank code and account number',
    check: (f) => {
      const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
      const digits = f.b + f.c;
      let sum = 0;
      for (let i = 0; i < 10; i++) sum += Number(digits[i]) * weights[i];
      const remainder = sum % 11;
      const expected = remainder === 0 ? 0 : 11 - remainder; // 10 means no valid number exists
      return expected === Number(f.x[0]);
    },
  },
  PL: {
    algorithm: 'weighted mod 10 (weights 3, 9, 7, 1) over bank and branch code',
    check: (f) => weightedMod10(f.b + f.s, [3, 9, 7, 1]) === Number(f.x[0]),
  },
  PT: BBAN_MOD97,
  RS: BBAN_MOD97,
  SI: {
    ...BBAN_MOD97,
    // Published Slovenian IBANs at bank code 01 do not follow the national rule.
    exempt: (f) => (f.b === '01' ? 'Accounts at bank code 01 do not use the national check digits.' : null),
  },
  SM: CIN,
};

/* ---------- country data ---------- */

function parseLayout(layout) {
  const body = layout.replace(/\s/g, '').slice(4);
  const segments = [];
  for (const kind of body) {
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) {
      last.length += 1;
    } else {
      segments.push({ kind, length: 1 });
    }
  }
  return segments;
}

/* '4!a6!n8!n' -> one class letter per BBAN position. */
function expandPattern(pattern) {
  let classes = '';
  for (const [, count, kind] of pattern.matchAll(/(\d+)!([nac])/g)) {
    classes += kind.repeat(Number(count));
  }
  return classes;
}

function segmentName(segment, classes) {
  if (segment.kind === 'x') {
    if (classes === 'a') return 'national check character';
    return segment.length > 1 ? 'national check digits' : 'national check digit';
  }
  return FIELD_NAMES[segment.kind] ?? 'unknown field';
}

/* "The national check digit does not" / "The national check digits do not" */
function nationalSubject(country) {
  const checks = country.fields.filter((field) => field.kind === 'x');
  const plural = checks.length > 1 || checks[0].length > 1;
  return `The ${plural ? 'national check digits do' : `${checks[0].name} does`} not match the other fields`;
}

const COUNTRIES = COUNTRY_ROWS.map(([code, name, length, layout, bbanPattern, example]) => {
  const segments = parseLayout(layout);
  const classes = expandPattern(bbanPattern);
  let offset = 0;
  const fields = segments.map((segment) => {
    const span = new Set(classes.slice(offset, offset + segment.length));
    const field = {
      name: segmentName(segment, [...span].join('')),
      kind: segment.kind,
      start: offset,
      length: segment.length,
      characters: span.size === 1 ? CLASS_NAMES[[...span][0]] : 'letters and digits',
    };
    offset += segment.length;
    return field;
  });
  return { code, name, length, layout, bbanPattern, classes, example, fields, national: NATIONAL_CHECKS[code] ?? null };
});

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

export function countryList() {
  return COUNTRIES.map(describeCountry);
}

export function describeCountry(country) {
  return {
    code: country.code,
    name: country.name,
    length: country.length,
    layout: country.layout,
    bbanPattern: country.bbanPattern,
    fields: country.fields.map(({ name, length, characters }) => ({ name, length, characters })),
    nationalCheck: country.national ? country.national.algorithm : null,
    example: formatIban(country.example),
  };
}

export function findCountry(code) {
  return BY_CODE.get(String(code ?? '').trim().toUpperCase()) ?? null;
}

/* ---------- validate ---------- */

export function formatIban(iban) {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

export function normalizeIban(input) {
  let value = String(input ?? '').replace(/\s+/g, '').toUpperCase();
  if (value.startsWith('IBAN')) value = value.replace(/^IBAN:?/, '');
  return value;
}

function splitFields(country, bban) {
  const parts = { b: '', s: '', c: '', t: '', i: '', x: [] };
  const fields = country.fields.map((field) => {
    const value = bban.slice(field.start, field.start + field.length);
    if (field.kind === 'x') parts.x.push(value);
    else parts[field.kind] += value;
    return { name: field.name, value };
  });
  return { fields, parts };
}

function characterProblem(country, iban) {
  if (!/^[0-9]{2}$/.test(iban.slice(2, 4))) {
    return 'Characters 3 and 4 are the check digits and must both be digits.';
  }
  const bban = iban.slice(4);
  for (let i = 0; i < bban.length; i++) {
    const kind = country.classes[i];
    if (!CLASS_TESTS[kind].test(bban[i])) {
      const field = country.fields.find((f) => i >= f.start && i < f.start + f.length);
      return `Character ${i + 5} ('${bban[i]}') is in the ${field.name}, which takes ${CLASS_NAMES[kind]} at that position.`;
    }
  }
  return null;
}

/**
 * Checks an IBAN in order: country, length, characters, mod-97, national
 * check digit. The first failing check is named in `failed`; later checks
 * are reported as skipped.
 */
export function validateIban(input) {
  const iban = normalizeIban(input);
  const result = {
    input: String(input ?? ''),
    iban,
    formatted: formatIban(iban),
    valid: false,
    failed: null,
    country: null,
    checkDigits: null,
    bban: null,
    fields: null,
    checks: [],
  };
  const order = ['country', 'length', 'characters', 'mod97', 'national'];
  const record = (check, status, detail, extra = {}) => {
    result.checks.push({ check, status, ...extra, ...(detail ? { detail } : {}) });
    if ((status === 'fail' || status === 'unsupported') && !result.failed) result.failed = check;
  };
  const skipRest = () => {
    for (const check of order.slice(result.checks.length)) result.checks.push({ check, status: 'skipped' });
  };

  if (!/^[A-Z]{2}/.test(iban)) {
    record('country', 'fail', iban ? 'An IBAN starts with a two-letter country code.' : 'No IBAN was given.');
    skipRest();
    return result;
  }

  const code = iban.slice(0, 2);
  const country = BY_CODE.get(code);
  if (!country) {
    record(
      'country',
      'unsupported',
      `${code} is not one of the ${COUNTRIES.length} countries in this script's data. ` +
        'The IBAN may still be valid; only its characters and mod-97 check digits can be checked here.',
    );
    record('length', 'skipped');
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(iban)) {
      record('characters', 'fail', 'An IBAN is two letters, two digits and up to 30 letters or digits.');
      skipRest();
      return result;
    }
    record('characters', 'pass');
    const ok = mod97(toNumeric(iban.slice(4) + iban.slice(0, 4))) === 1;
    result.checks.push({ check: 'mod97', status: ok ? 'pass' : 'fail' });
    record('national', 'skipped');
    return result;
  }

  result.country = { code: country.code, name: country.name };
  record('country', 'pass');

  if (iban.length !== country.length) {
    record(
      'length',
      'fail',
      `IBANs from ${country.name} have ${country.length} characters; this one has ${iban.length}.`,
      { expected: country.length, actual: iban.length },
    );
    skipRest();
    return result;
  }
  record('length', 'pass', null, { expected: country.length, actual: iban.length });

  const problem = characterProblem(country, iban);
  if (problem) {
    record('characters', 'fail', problem);
    skipRest();
    return result;
  }
  record('characters', 'pass');

  const bban = iban.slice(4);
  const { fields, parts } = splitFields(country, bban);
  result.checkDigits = iban.slice(2, 4);
  result.bban = bban;
  result.fields = fields;

  const digits = Number(result.checkDigits);
  if (digits < 2 || digits > 98) {
    record('mod97', 'fail', `Check digits ${result.checkDigits} are never issued; they run from 02 to 98.`);
    skipRest();
    return result;
  }
  if (mod97(toNumeric(bban + iban.slice(0, 4))) !== 1) {
    record(
      'mod97',
      'fail',
      'The check digits do not match the rest of the IBAN. Usually a character was mistyped or two were swapped.',
    );
    skipRest();
    return result;
  }
  record('mod97', 'pass');

  const national = country.national;
  if (!national) {
    record('national', 'not-applicable', `No national check digit is checked for ${country.name}.`);
  } else {
    const exemption = national.exempt ? national.exempt(parts) : null;
    if (exemption) {
      record('national', 'not-applicable', exemption);
    } else if (national.check(parts, bban)) {
      record('national', 'pass', national.algorithm);
    } else {
      record(
        'national',
        'fail',
        `${nationalSubject(country)} (${national.algorithm}). The IBAN check digits are consistent, ` +
          `so the account details themselves are not valid for ${country.name}; ` +
          'usually the IBAN was made from a mistyped account number.',
      );
      return result;
    }
  }

  result.valid = true;
  return result;
}

/* ---------- build ---------- */

/** Spaces, hyphens, dots and slashes are common separators in national account numbers. */
function cleanField(value) {
  return String(value ?? '').replace(/[\s.\-/]+/g, '').toUpperCase();
}

/**
 * Builds an IBAN from the fields of a country's layout, in layout order.
 * The account number may be given short; it is padded with leading zeros.
 * A single argument as long as the whole BBAN is split by the layout.
 */
export function buildIban(countryArg, values) {
  const country = findCountry(countryArg);
  if (!country) {
    return {
      ok: false,
      error: `Unknown country code "${countryArg ?? ''}". Run "countries" for the ${COUNTRIES.length} supported codes.`,
    };
  }

  const expected = country.fields.map(({ name, length, characters }) => ({ name, length, characters }));
  let inputs = values.map(cleanField);
  const bbanLength = country.length - 4;

  if (inputs.length === 1 && inputs[0].length === bbanLength) {
    inputs = country.fields.map((field) => inputs[0].slice(field.start, field.start + field.length));
  }

  if (inputs.length !== country.fields.length) {
    return {
      ok: false,
      error:
        `${country.name} takes ${country.fields.length} fields in this order: ` +
        `${country.fields.map((f) => f.name).join(', ')}; got ${inputs.length}. ` +
        `The whole ${bbanLength}-character BBAN as one field also works.`,
      fields: expected,
    };
  }

  const parts = [];
  for (const [index, field] of country.fields.entries()) {
    const raw = inputs[index];
    if (raw.length === 0) {
      return { ok: false, error: `The ${field.name} is empty.`, field: field.name, fields: expected };
    }
    if (!/^[A-Z0-9]+$/.test(raw)) {
      return { ok: false, error: `The ${field.name} may contain only letters and digits.`, field: field.name };
    }
    const value = field.kind === 'c' ? raw.padStart(field.length, '0') : raw;
    if (value.length !== field.length) {
      const limit = field.kind === 'c' ? `at most ${field.length}` : `${field.length}`;
      return {
        ok: false,
        error: `The ${field.name} in ${country.name} has ${limit} characters; got ${raw.length}.`,
        field: field.name,
        fields: expected,
      };
    }
    parts.push(value);
  }

  const bban = parts.join('');
  const iban = `${country.code}${ibanCheckDigits(country.code, bban)}${bban}`;
  const check = validateIban(iban);

  if (!check.valid) {
    const failure = check.checks.find((c) => c.check === check.failed);
    const error =
      check.failed === 'national'
        ? `${nationalSubject(country)} (${country.national.algorithm}). Check the account details against their source.`
        : failure.detail;
    return { ok: false, error, failed: check.failed, fields: expected };
  }

  return {
    ok: true,
    iban,
    formatted: formatIban(iban),
    country: check.country,
    checkDigits: check.checkDigits,
    fields: check.fields,
    checks: check.checks,
  };
}

/* ---------- command line ---------- */

const USAGE = [
  'node iban.mjs validate <iban>',
  'node iban.mjs build <country> <field>...',
  'node iban.mjs countries [<country>]',
];

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function main(argv) {
  const [command, ...rest] = argv;

  if (command === 'validate') {
    if (rest.length === 0) {
      print({ error: 'validate needs an IBAN.', usage: USAGE });
      return 2;
    }
    const result = validateIban(rest.join(' '));
    print(result);
    return result.valid ? 0 : 1;
  }

  if (command === 'build') {
    if (rest.length < 2) {
      print({ error: 'build needs a country code and the account fields.', usage: USAGE });
      return 2;
    }
    const result = buildIban(rest[0], rest.slice(1));
    print(result);
    return result.ok ? 0 : 1;
  }

  if (command === 'countries') {
    if (rest.length === 0) {
      print(countryList());
      return 0;
    }
    const country = findCountry(rest[0]);
    if (!country) {
      print({ error: `Unknown country code "${rest[0]}".`, codes: COUNTRIES.map((c) => c.code) });
      return 1;
    }
    print(describeCountry(country));
    return 0;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(`${USAGE.join('\n')}\n`);
    return 0;
  }

  print({ error: command ? `Unknown command "${command}".` : 'No command given.', usage: USAGE });
  return 2;
}

/* Run as a command, also when started through a symlink (skills installers link skill folders). */
function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  process.exitCode = main(process.argv.slice(2));
}

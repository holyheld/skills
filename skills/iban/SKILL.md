---
name: iban
description: Validates, explains and builds IBANs offline with a dependency-free Node.js script. Checks the country code, length, character pattern and ISO 7064 mod-97 check digits, plus the national check digit for 17 countries; splits an IBAN into bank code, branch code and account number; builds an IBAN from national account details for 41 countries. Use when a user shares an IBAN, asks whether one is valid or what its parts mean, needs an IBAN made from a bank code and account number, or wants a typo caught before a payment.
license: Apache-2.0
compatibility: Requires Node.js 18 or later. Makes no network requests.
metadata:
  author: Holyheld Labs AG
  version: "1.0.0"
---

# IBAN

Validate, explain and build International Bank Account Numbers (ISO 13616) with
`scripts/iban.mjs`. The script has no dependencies, runs offline and prints JSON.
Paths here are relative to this skill's directory.

## When to use

- A user pastes an IBAN and asks whether it is right, or an IBAN is about to go
  into a payment, an invoice or a form.
- A user asks what the parts of an IBAN are: bank code, branch code, account number.
- A user has a national bank code and account number and needs the IBAN.
- A user asks how long an IBAN is in some country, or how it is laid out.

## Validate

```bash
node scripts/iban.mjs validate "DE89 3704 0044 0532 0130 00"
```

Spaces, lower case and a leading `IBAN` label are accepted. Exit status is 0 when
the IBAN is valid, 1 when a check fails, 2 when the command is used wrongly.

```json
{
  "iban": "DE89370400440532013000",
  "formatted": "DE89 3704 0044 0532 0130 00",
  "valid": true,
  "failed": null,
  "country": { "code": "DE", "name": "Germany" },
  "checkDigits": "89",
  "bban": "370400440532013000",
  "fields": [
    { "name": "bank code", "value": "37040044" },
    { "name": "account number", "value": "0532013000" }
  ],
  "checks": [
    { "check": "country", "status": "pass" },
    { "check": "length", "status": "pass", "expected": 22, "actual": 22 },
    { "check": "characters", "status": "pass" },
    { "check": "mod97", "status": "pass" },
    { "check": "national", "status": "not-applicable", "detail": "No national check digit is checked for Germany." }
  ]
}
```

The checks run in this order. The first one that fails is named in `failed`, its
`detail` says what is wrong, and the checks after it are `skipped`.

| Check | Fails when | What to tell the user |
| --- | --- | --- |
| `country` | The IBAN does not start with two letters. | It is not an IBAN. |
| `length` | The length differs from the country's fixed length. | A character is missing or extra; `detail` gives both lengths. |
| `characters` | A character has the wrong type for its position, such as the letter O where the country requires digits. | Name the character and position from `detail`. |
| `mod97` | The check digits do not match the rest, or they are 00, 01 or 99. | A character was mistyped or two were swapped; the IBAN needs re-checking at its source. |
| `national` | The country's own check digit does not match its bank code and account number. | The account details were wrong before the IBAN was made. |

Two other statuses:

- `country` is `unsupported` when the country code is not one of the 41 countries
  below. The IBAN may still be valid. The script still checks the characters and the
  mod-97 check digits, but not the length or layout; say so instead of calling the
  IBAN invalid.
- `national` is `not-applicable` when the country has no national check digit in
  the data, or the account is at a bank known not to use one (Slovenian bank code 01).

### Do not repair a failing IBAN

When a check fails, do not change characters or recompute check digits until it
passes. A mod-97 failure shows that something is wrong, not where: an IBAN with
recomputed check digits passes the check and can still point at the wrong account.
Ask the user to re-copy the IBAN from its source (the invoice, the recipient, the
statement).

## Explain

`fields` splits the BBAN (the national part after the first four characters) into
named parts, in the order they appear:

- `bank code` identifies the bank. In GB, IE, BG, LV, MT, NL and RO it is four
  letters, usually the first four letters of the bank's BIC.
- `branch code` identifies the branch. In GB and IE it is the sort code.
- `account number` is the account at that bank, padded with leading zeros.
- `national check digit(s)` (`national check character` in IT and SM) is the
  country's own check on the bank code and account number.
- `account type` (Bulgaria) and `identity number` (Iceland: the account holder's
  national ID number) appear in those countries only.

The script does not contain a bank directory, so it cannot name the bank behind a
bank code.

## Build

List a country's fields first, then pass them in that order:

```bash
node scripts/iban.mjs countries DE
node scripts/iban.mjs build DE 37040044 532013000
```

```json
{
  "ok": true,
  "iban": "DE89370400440532013000",
  "formatted": "DE89 3704 0044 0532 0130 00",
  "country": { "code": "DE", "name": "Germany" },
  "checkDigits": "89",
  "fields": [
    { "name": "bank code", "value": "37040044" },
    { "name": "account number", "value": "0532013000" }
  ]
}
```

The result also carries `checks`, the same five checks that `validate` runs.

- The account number may be given without its leading zeros; the script pads it.
  Every other field must have its exact length.
- Spaces, hyphens, dots and slashes inside a field are ignored.
- A national account number that is already the whole BBAN can be passed as one
  field, for example `build BE 539-0075470-34` or `build NO 8601.11.17947`.
- The national check digit is an input. The script verifies it but never invents
  it; a mismatch fails with `"failed": "national"`.
- On any failure the result is `"ok": false` with an `error` and the expected
  `fields`, and the exit status is 1.

Leading-zero padding is how most countries write short account numbers in an IBAN,
but not all. Finnish account numbers get their zeros inside the number, and 16-digit
Hungarian account numbers get eight zeros at the end. For those, build from the full
BBAN as one field.

A browser IBAN calculator built on the same country data is at
https://holyheld.com/iban-calculator.

## IBAN structure

An IBAN has three parts, written without spaces in electronic form and in groups of
four characters in print:

1. Country code: two letters (ISO 3166-1 alpha-2).
2. Check digits: two digits, 02 to 98.
3. BBAN: the national account number, letters and digits, with a fixed length and
   layout per country (at most 30 characters).

The check digits follow ISO 7064 mod 97-10. To verify, move the first four
characters to the end, replace each letter with two digits (A = 10 … Z = 35), and
take the number mod 97: a valid IBAN leaves 1. To compute them, put `00` in place of
the check digits, do the same, and subtract the remainder from 98. The check catches
every single mistyped digit and every swap of two neighbouring digits.

The layouts below use these letters after the country code:

| Letter | Meaning |
| --- | --- |
| `kk` | IBAN check digits |
| `b` | bank code |
| `s` | branch code |
| `c` | account number |
| `x` | national check digit or character |
| `t` | account type |
| `i` | identity number |

`node scripts/iban.mjs countries` prints the same data as JSON, including each
field's length and character type and the SWIFT IBAN Registry example IBAN.

## What a valid result does not prove

A valid result means the IBAN is well-formed: the right length and character
pattern for its country, with check digits that agree with the rest. It does not
show that the account exists, that it is open, that it can receive a given
currency, or that it belongs to the person or company named on an invoice. A name
check offered by the sending bank or payment service, or confirmation from the
recipient through a separate channel, is what ties an IBAN to its holder.

## Countries

| Code | Country | Length | Layout | National check |
| --- | --- | --- | --- | --- |
| AD | Andorra | 24 | `ADkk bbbb ssss cccc cccc cccc` | – |
| AE | United Arab Emirates | 23 | `AEkk bbbc cccc cccc cccc ccc` | – |
| AL | Albania | 28 | `ALkk bbbs sssx cccc cccc cccc cccc` | weighted mod 10 |
| AT | Austria | 20 | `ATkk bbbb bccc cccc cccc` | – |
| BA | Bosnia and Herzegovina | 20 | `BAkk bbbs sscc cccc ccxx` | mod 97-10 |
| BE | Belgium | 16 | `BEkk bbbc cccc ccxx` | mod 97 |
| BG | Bulgaria | 22 | `BGkk bbbb ssss ttcc cccc cc` | – |
| CH | Switzerland | 21 | `CHkk bbbb bccc cccc cccc c` | – |
| CY | Cyprus | 28 | `CYkk bbbs ssss cccc cccc cccc cccc` | – |
| CZ | Czech Republic | 24 | `CZkk bbbb ssss sscc cccc cccc` | – |
| DE | Germany | 22 | `DEkk bbbb bbbb cccc cccc cc` | – |
| DK | Denmark | 18 | `DKkk bbbb cccc cccc cc` | – |
| EE | Estonia | 20 | `EEkk bbss cccc cccc cccx` | weighted mod 10 |
| ES | Spain | 24 | `ESkk bbbb ssss xxcc cccc cccc` | mod 11 |
| FI | Finland | 18 | `FIkk bbbc cccc cccc cx` | Luhn |
| FR | France | 27 | `FRkk bbbb bsss sscc cccc cccc cxx` | RIB key |
| GB | United Kingdom | 22 | `GBkk bbbb ssss sscc cccc cc` | – |
| GR | Greece | 27 | `GRkk bbbs sssc cccc cccc cccc ccc` | – |
| HR | Croatia | 21 | `HRkk bbbb bbbc cccc cccc c` | – |
| HU | Hungary | 28 | `HUkk bbbs sssx cccc cccc cccc cccx` | weighted mod 10 |
| IE | Ireland | 22 | `IEkk bbbb ssss sscc cccc cc` | – |
| IS | Iceland | 26 | `ISkk bbbb sscc cccc iiii iiii ii` | – |
| IT | Italy | 27 | `ITkk xbbb bbss sssc cccc cccc ccc` | CIN |
| LI | Liechtenstein | 21 | `LIkk bbbb bccc cccc cccc c` | – |
| LT | Lithuania | 20 | `LTkk bbbb bccc cccc cccc` | – |
| LU | Luxembourg | 20 | `LUkk bbbc cccc cccc cccc` | – |
| LV | Latvia | 21 | `LVkk bbbb cccc cccc cccc c` | – |
| MC | Monaco | 27 | `MCkk bbbb bsss sscc cccc cccc cxx` | RIB key |
| ME | Montenegro | 22 | `MEkk bbbc cccc cccc cccc xx` | mod 97-10 |
| MT | Malta | 31 | `MTkk bbbb ssss sccc cccc cccc cccc ccc` | – |
| NL | Netherlands | 18 | `NLkk bbbb cccc cccc cc` | – |
| NO | Norway | 15 | `NOkk bbbb cccc ccx` | mod 11 |
| PL | Poland | 28 | `PLkk bbbs sssx cccc cccc cccc cccc` | weighted mod 10 |
| PT | Portugal | 25 | `PTkk bbbb ssss cccc cccc cccx x` | mod 97-10 |
| RO | Romania | 24 | `ROkk bbbb cccc cccc cccc cccc` | – |
| RS | Serbia | 22 | `RSkk bbbc cccc cccc cccc xx` | mod 97-10 |
| SA | Saudi Arabia | 24 | `SAkk bbcc cccc cccc cccc cccc` | – |
| SE | Sweden | 24 | `SEkk bbbc cccc cccc cccc cccc` | – |
| SI | Slovenia | 19 | `SIkk bbss sccc cccc cxx` | mod 97-10 |
| SK | Slovakia | 24 | `SKkk bbbb ssss sscc cccc cccc` | – |
| SM | San Marino | 27 | `SMkk xbbb bbss sssc cccc cccc ccc` | CIN |

A dash means the script checks no national digit for that country; some of these
countries have one that the layout does not mark.

## Tests

`node scripts/test.mjs` checks every country's data and example IBAN against the
SWIFT IBAN Registry (Release 103), and checks that broken variants of each example
fail at the expected step.

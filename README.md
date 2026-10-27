# Holyheld skills

Agent Skills from [Holyheld](https://holyheld.com). Each skill is a folder under
`skills/` with a `SKILL.md` in the [Agent Skills](https://agentskills.io) format, so
it works with any agent that loads that format.

| Skill | What it does |
| --- | --- |
| [`iban`](skills/iban) | Validates, explains and builds IBANs offline with a dependency-free Node.js script: 41 countries, national check digits for 17 of them. |

## Install

With the [`skills`](https://github.com/vercel-labs/skills) CLI:

```bash
npx skills add holyheld/skills --skill iban
```

`npx skills add holyheld/skills --list` lists the skills in this repository. Add `-g`
to install for your user instead of the current project, and `-a <agent>` to pick
the agents to install for.

To install by hand, copy `skills/iban` into your agent's skills directory, for
example `~/.claude/skills/iban` for Claude Code.

The `iban` skill runs `node scripts/iban.mjs` and needs Node.js 18 or later. It makes
no network requests.

## Tests

```bash
node skills/iban/scripts/test.mjs
```

The test checks each country's data and example IBAN against the SWIFT IBAN
Registry and checks that broken variants fail at the expected step.

## Licence

Apache License 2.0, see [LICENSE](LICENSE). Copyright 2026 Holyheld Labs AG.

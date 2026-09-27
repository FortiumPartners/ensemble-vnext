# Functional Verification Report: verification-md-setup

**Source PRD**: docs/plan/verification-md-setup.investigation.md
**Success definition**: .trd-state/verification-md-setup/success-definition.md
**Outcome**: Satisfied (no full-environment run declared)
**Reason**: no gaps remain — every criterion is met or not verifiable here
**Criteria**: 19 total — 19 met, 0 not met, 0 not verifiable, 0 unbuilt
**Coverage**: 19 of 19 proven — uncovered: none

## Met

| ID | Statement | Artifact | Proven at |
|----|-----------|----------|-----------|
| FS-1 | A skill named `verification-setup` exists at `packages/skills/verification-setup/SKILL.md`. It is prompts only, with no executable code in its directory. It is a skill, not a command: `packages/core/commands/` has no `verification-setup` command | .trd-state/verification-md-setup/evidence/FS-1.txt | 1 |
| FS-2 | Invoked in a project whose `verification.md` is still the unfilled template, the skill reads the current file or the template, runs the existing detectors, asks one topic at a time, offers the value it detected from the repo as the default in each question, and writes `.claude/rules/verification.md` | .trd-state/verification-md-setup/evidence/FS-2.txt | 1 |
| FS-3 | Re-run on a filled `verification.md`, the skill asks only about what is missing or out of date, including a coverage floor when the file declares none | .trd-state/verification-md-setup/evidence/FS-3.txt | 1 |
| FS-4 | Running the skill counts as the owner's approval to write. After the questions it writes the file with no separate yes/no confirmation step, then prints a one-screen summary of what it changed | .trd-state/verification-md-setup/evidence/FS-4.txt | 2 |
| FS-5 | The skill records credentials as LOCATIONS only, never values. When the owner's answer includes a credential value, the file records where that credential lives and does not contain the value | .trd-state/verification-md-setup/evidence/FS-5.txt | 1 |
| FS-6 | No autonomous run writes `verification.md`. No command or workflow chains into or invokes the skill. Commands may point the owner at it (FS-14, FS-15), but none runs it, and no command or workflow code writes to `.claude/rules/verification.md` | .trd-state/verification-md-setup/evidence/FS-6.txt | 1 |
| FS-7 | The skill asks the owner for a coverage floor, described as the share of success-definition criteria that must be proven before a run may report satisfied. It recommends a value (or "none", per FS-9) and gives the reason in one line | .trd-state/verification-md-setup/evidence/FS-7.txt | 3 |
| FS-8 | Where past runs exist, the recommended floor comes from `.trd-state/*/verification-state.json`, using the same rule `coverageOf()` uses to count proven criteria. It is a multiple of 5%, and it is at or below the proven share of every past run that ended `satisfied`, so those runs would still pass | .trd-state/verification-md-setup/evidence/FS-8.txt | 1 |
| FS-9 | Where no past runs exist, the skill recommends no floor and says a floor can be added after the first runs | .trd-state/verification-md-setup/evidence/FS-9.txt | 1 |
| FS-10 | The `verification.md` template has a Coverage floor section between §5 ("What CANNOT be verified here") and §6 ("Multi-repo") | .trd-state/verification-md-setup/evidence/FS-10.txt | 1 |
| FS-11 | The template's header no longer says an agent never writes the file. It says the owner governs the file and that the skill is how it is written | .trd-state/verification-md-setup/evidence/FS-11.txt | 1 |
| FS-12 | A project whose `verification.md` is still an untouched copy of the previous template (before this change) is still reported as unfilled, and so is an untouched copy of the new template. The previous template's digest is recognised, and there is a fixture and a test for it | .trd-state/verification-md-setup/evidence/FS-12.txt | 2 |
| FS-13 | For a filled `verification.md` written to an older template shape, detection names each of the three sections it lacks: resource capacity §1a, the `Loop may WRITE data?` column, and the fast/full refresh split. For a filled file in the current shape, it names none. Detection works on structure, so it applies to filled files, which never match a stored digest | .trd-state/verification-md-setup/evidence/FS-13.txt | 1 |
| FS-14 | When a filled `verification.md` has the older template shape, both the `/implement-trd` §3.6a readout and the `/verify-build` §2 readout name the missing sections and point the owner at the skill | .trd-state/verification-md-setup/evidence/FS-14-FS-15.txt | 1 |
| FS-15 | Each of the 3 places that tells the owner `verification.md` is unfilled or out of date names the skill as the fix: the `/implement-trd` §3.6a readout, `/verify-build` §2, and `/init-project`, which offers the skill after it writes `stack.md` | .trd-state/verification-md-setup/evidence/FS-14-FS-15.txt | 1 |
| FS-16 | A coverage floor declared in `verification.md` reaches the verification loop from both dispatch sites: `/implement-trd` §8.1a and `/verify-build` step 3c each read it and pass it to the `verify-functional` workflow as `coverageFloor`, and the Judge's decide-next payload carries it. A run whose proven share falls below that floor exits `insufficient-coverage` | .trd-state/verification-md-setup/evidence/FS-16.txt | 2 |
| FS-17 | The verification readout states the floor in force, or "none declared" when the file declares none. With no floor declared, the argument stays optional and the loop behaves as before, with no relabel | .trd-state/verification-md-setup/evidence/FS-17.txt | 1 |
| FS-18 | The skill ships to every project through the one framework-skill list, with role `support`. After scaffolding, a project has `.claude/skills/verification-setup/SKILL.md` and can run it as `/verification-setup` | .trd-state/verification-md-setup/evidence/FS-18-FS-19.txt | 1 |
| FS-19 | The skill can never be chosen as a verification check. Whatever lists the selectable check skills does not include `verification-setup` | .trd-state/verification-md-setup/evidence/FS-19.txt | 1 |

## Not Met

_None._

## Not Verifiable

_None._


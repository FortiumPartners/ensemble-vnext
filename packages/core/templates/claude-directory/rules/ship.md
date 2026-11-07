# Release policy

**Owner-governed, like `verification.md`. It changes only when the owner runs `/ship-setup`,
which asks, then writes; running it is the approval. No autonomous run edits this file.** The
file is committed: it holds no credential, only the commands that use one.

`/ship-build` reads this file to learn what shipping means for this project: a list of
*primitives* (single shipping actions such as `push`, `open-pr`, `merge`, `release`), run in
order. A primitive that publishes outward (merge, release, `run`) is authorized by this file
alone, and only when its step is listed here. **No step under `## Ship` means no policy:**
`/ship-build` then only pushes the branch and says how to set this up.

Line format: `N. <primitive> key=value key="quoted value"`. A `repeat` takes indented
`- <primitive> ...` lines, no nesting. `run` takes the rest of the line as the command.

## Ship

## After shipping

## Examples (not run)

Nothing under this heading is read. Copy a string above and edit it, or run `/ship-setup`.

The default string, which `/ship-setup` offers first (replace `identity` with a command that
prints the commit the deployed environment runs):

```
## Ship
1. push
2. open-pr
3. repeat until=clean rounds=2
   - push
   - request-review tool=coderabbit
   - wait-ci
   - collect-findings
   - fix-findings
4. merge
5. release env=production identity="<command that prints the deployed commit>"

## After shipping
1. sync-design
2. close-issue
3. file-followups
```

Commit and push only:

```
1. push
```

Submit a PR and wait for a human review:

```
1. push
2. open-pr base=main
3. await-approval
```

PR to `develop`, iterate until CI passes, merge:

```
1. push
2. open-pr base=develop
3. repeat rounds=3
   - push
   - wait-ci
   - collect-findings
   - fix-findings
4. merge method=merge
```

Merge to `main` and deploy to production:

```
1. push
2. open-pr base=main
3. repeat
   - push
   - wait-ci
   - collect-findings
   - fix-findings
4. merge
5. release env=production identity="<command that prints the deployed commit>"
```

PR, CodeRabbit, fix what matters, merge when green, deploy (a bare `release` runs only where
`verification.md` section 2 declares exactly one full-deploy command):

```
1. push
2. open-pr
3. repeat
   - push
   - request-review tool=coderabbit
   - wait-ci
   - collect-findings
   - fix-findings
4. merge
5. release identity="<command that prints the deployed commit>"
```

Release and platform steps are `run` lines, not primitives:

```
1. run npm version patch
2. run git tag v$(node -p "require('./package.json').version")
3. run npm publish
4. run npx changelogen --release
5. run bundle exec fastlane ios beta
6. run bundle exec fastlane ios submit_review
7. run npx eas update --branch production
8. run curl -s https://example.com/version
```

The last line checks which build a deployed environment runs; the `identity=` command of
`release` does the same and is what the deploy check reads.

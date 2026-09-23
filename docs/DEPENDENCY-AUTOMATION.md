# Dependency Automation

The repository uses GitHub Dependabot plus CI-gated automatic merging for routine direct npm dependency maintenance, with a narrow exception for verified lockfile-only transitive security fixes.

## Routine package.json-only policy

Routine automated maintenance is intentionally limited to dependencies declared directly in the root `package.json`.

Example:

```text
package.json -> dependency A -> transitive dependency B
```

Dependabot may propose a routine version update for **A** because A is a direct project dependency. It must not independently maintain **B** merely because a newer B exists.

`package-lock.json` is still expected to change when an approved direct dependency update requires a different resolved dependency tree. Those lockfile changes are part of updating A; they do not grant routine permission to maintain B independently.

The routine policy is enforced in multiple layers:

- `.github/dependabot.yml` configures only the `npm` ecosystem
- `allow: dependency-type: direct` excludes independent transitive version updates
- `versioning-strategy: increase` requires routine direct version updates to be represented in the manifest requirement
- direct automated dependency PRs must modify `package.json`
- non-npm Dependabot PRs are outside policy, labeled `dependency-policy-blocked` + `dependency-hold`, and closed
- auto-merge requires an eligible dependency label + `automerge-safe` and exact-head CI success

GitHub Actions versions are **not** maintained automatically by Dependabot in this repository. Workflow action upgrades are deliberate manual maintenance changes and must pass normal CI review.

## Transitive security exception

Dependabot security updates may legitimately need to update a vulnerable transitive dependency without changing `package.json`. Because routine indirect updates are already excluded by `.github/dependabot.yml`, a Dependabot PR that `fetch-metadata` verifies as `indirect` is accepted only when its changed-file set is exactly:

```text
package-lock.json
```

Such a PR is labeled `dependency-security`. It does not receive `dependency-direct`.

This exception does **not** permit general lockfile maintenance:

- the PR must be owned by `dependabot[bot]`
- `dependabot/fetch-metadata@v3` must verify it as an npm indirect dependency update
- it must modify only `package-lock.json`
- patch/minor updates may receive `automerge-safe`
- major/unknown updates remain manual
- `dependency-hold` still blocks automatic merge
- exact-head CI success is still mandatory

An indirect PR that changes any file other than `package-lock.json` is labeled `dependency-indirect-blocked` + `dependency-hold` and closed.

## Schedule

Routine dependency maintenance runs every Monday at **03:00 Asia/Bangkok** for direct npm dependencies only.

Dependabot groups eligible minor and patch version updates so routine maintenance creates fewer pull requests. Major updates remain separate and require manual review.

Dependabot security updates are event-driven by vulnerability detection and are not governed by the routine weekly schedule.

## Merge policy

A Dependabot pull request is classified using `dependabot/fetch-metadata@v3`.

- direct patch update that changes `package.json`: `dependency-direct` + `automerge-safe`
- direct minor update that changes `package.json`: `dependency-direct` + `automerge-safe`
- direct major/unknown update that changes `package.json`: `dependency-direct` + `dependency-major`, manual review required
- verified indirect lockfile-only patch/minor update: `dependency-security` + `automerge-safe`
- verified indirect lockfile-only major/unknown update: `dependency-security` + `dependency-major`, manual review required
- indirect update that changes anything besides `package-lock.json`: blocked and closed
- non-npm Dependabot update: blocked and closed

Automatic merge only happens when the existing `CI` workflow finishes successfully for the exact current PR head SHA. The merge workflow independently verifies that the PR:

1. comes from a `dependabot/*` branch
2. is owned by `dependabot[bot]`
3. targets `main`
4. still has the same head SHA that passed CI
5. has either `dependency-direct` or `dependency-security`
6. has `automerge-safe`
7. does not have `dependency-indirect-blocked`
8. does not have `dependency-policy-blocked`
9. does not have `dependency-hold`

Eligible updates are squash-merged into `main`.

## Field freeze

Before a competition or during a field-approved freeze, add the `dependency-hold` label to any pending dependency PR that must not merge automatically. The policy workflow never clears this label automatically. Remove it manually when maintenance may resume.

Major direct dependency updates and major/unknown transitive security updates should always be reviewed and field-tested before merge because they may contain breaking changes.

# Dependency Automation

The repository uses GitHub Dependabot plus CI-gated automatic merging for **direct npm dependencies declared in `package.json` only**.

## Package.json-only policy

Automated maintenance is intentionally limited to dependencies declared directly in the root `package.json`.

Example:

```text
package.json -> dependency A -> transitive dependency B
```

Dependabot may propose an update for **A** because A is a direct project dependency. It must not independently propose or automatically merge an update for **B** just because a newer B exists.

`package-lock.json` is still expected to change when an approved direct dependency update requires a different resolved dependency tree. Those lockfile changes are part of updating A; they do not grant permission to maintain B independently.

The policy is enforced in multiple layers:

- `.github/dependabot.yml` configures only the `npm` ecosystem
- `allow: dependency-type: direct` excludes independent transitive version updates
- `versioning-strategy: increase` requires routine version updates to be represented in the manifest requirement
- the policy workflow accepts only `npm` metadata with `direct:production` or `direct:development`
- an automated dependency PR must actually modify `package.json`; lockfile-only PRs are closed
- indirect/transitive npm PRs are labeled `dependency-indirect-blocked` + `dependency-hold` and closed
- non-npm Dependabot PRs are outside policy, labeled `dependency-policy-blocked` + `dependency-hold`, and closed
- auto-merge requires `dependency-direct` + `automerge-safe` and exact-head CI success

GitHub Actions versions are **not** maintained automatically by Dependabot in this repository. Workflow action upgrades are deliberate manual maintenance changes and must pass normal CI review.

## Schedule

Routine dependency maintenance runs every Monday at **03:00 Asia/Bangkok** for direct npm dependencies only.

Dependabot groups eligible minor and patch version updates so routine maintenance creates fewer pull requests. Major updates remain separate and require manual review.

## Merge policy

A Dependabot pull request is classified using `dependabot/fetch-metadata@v3`.

- direct patch update that changes `package.json`: `dependency-direct` + `automerge-safe`
- direct minor update that changes `package.json`: `dependency-direct` + `automerge-safe`
- direct major/unknown update that changes `package.json`: `dependency-direct` + `dependency-major`, manual review required
- indirect/transitive npm update: blocked and closed
- lockfile-only update: blocked and closed
- non-npm Dependabot update: blocked and closed

Automatic merge only happens when the existing `CI` workflow finishes successfully for the exact current PR head SHA. The merge workflow independently verifies that the PR:

1. comes from a `dependabot/*` branch
2. is owned by `dependabot[bot]`
3. targets `main`
4. still has the same head SHA that passed CI
5. has the `dependency-direct` label
6. has the `automerge-safe` label
7. does not have `dependency-indirect-blocked`
8. does not have `dependency-policy-blocked`
9. does not have `dependency-hold`

Eligible updates are squash-merged into `main`.

## Field freeze

Before a competition or during a field-approved freeze, add the `dependency-hold` label to any pending direct dependency PR that must not merge automatically. Remove the label when routine dependency maintenance may resume.

Major direct dependency updates should always be reviewed and field-tested before merge because they may contain breaking changes.

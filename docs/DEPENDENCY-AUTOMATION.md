# Dependency Automation

The repository uses GitHub Dependabot plus CI-gated automatic merging.

## Direct-only policy

For npm, automated maintenance is limited to dependencies declared directly in `package.json`.

Example:

```text
package.json -> dependency A -> transitive dependency B
```

Dependabot may propose an update for **A** because A is a direct project dependency. It must not independently propose or automatically merge an update for **B** just because a newer B exists.

`package-lock.json` is still expected to change when an approved direct dependency update requires a different resolved dependency tree. Those lockfile changes are treated as part of updating A, not as permission to maintain B independently.

The npm configuration therefore uses:

- `allow: dependency-type: direct`
- `versioning-strategy: increase`, so routine npm version updates are reflected in the manifest requirement
- a policy workflow that closes npm PRs whose Dependabot metadata is not `direct:production` or `direct:development`
- an auto-merge workflow that requires the `dependency-direct` label in addition to `automerge-safe`

Indirect/transitive npm PRs receive `dependency-indirect-blocked` and `dependency-hold` and are closed automatically.

## Schedule

Routine dependency maintenance runs during the overnight maintenance window in Thailand:

- npm direct dependencies: every Monday at 03:00 Asia/Bangkok
- GitHub Actions: every Monday at 03:15 Asia/Bangkok

This keeps dependency PR creation, CI, and eligible automatic merges away from normal daytime field operation. Dependabot groups minor and patch version updates so routine maintenance creates fewer pull requests. Major updates remain separate.

## Merge policy

A Dependabot pull request is classified using `dependabot/fetch-metadata@v3`.

- direct patch update: `dependency-direct` + `automerge-safe`
- direct minor update: `dependency-direct` + `automerge-safe`
- direct major/unknown update: `dependency-direct` + `dependency-major`, manual review required
- indirect/transitive npm update: blocked and closed

Automatic merge only happens when the existing `CI` workflow finishes successfully for the exact current PR head SHA. The merge workflow independently verifies that the PR:

1. comes from a `dependabot/*` branch
2. is owned by `dependabot[bot]`
3. targets `main`
4. still has the same head SHA that passed CI
5. has the `dependency-direct` label
6. has the `automerge-safe` label
7. does not have the `dependency-indirect-blocked` label
8. does not have the `dependency-hold` label

Eligible updates are squash-merged into `main`.

## Field freeze

Before a competition or during a field-approved freeze, add the `dependency-hold` label to any pending Dependabot PR that must not merge automatically. Remove the label when routine dependency maintenance may resume.

Major dependency updates should always be reviewed and field-tested before merge because they may contain breaking changes.

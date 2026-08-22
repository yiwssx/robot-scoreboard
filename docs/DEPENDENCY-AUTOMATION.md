# Dependency Automation

The repository uses GitHub Dependabot plus CI-gated automatic merging.

## Schedule

- npm dependencies: every Monday at 09:00 Asia/Bangkok
- GitHub Actions: every Monday at 09:15 Asia/Bangkok

Dependabot groups minor and patch version updates so routine maintenance creates fewer pull requests. Major updates remain separate.

## Merge policy

A Dependabot pull request is classified using `dependabot/fetch-metadata@v3`.

- patch update: `automerge-safe`
- minor update: `automerge-safe`
- major/unknown update: `dependency-major`, manual review required

Automatic merge only happens when the existing `CI` workflow finishes successfully for the exact current PR head SHA. The merge workflow independently verifies that the PR:

1. comes from a `dependabot/*` branch
2. is owned by `dependabot[bot]`
3. targets `main`
4. still has the same head SHA that passed CI
5. has the `automerge-safe` label
6. does not have the `dependency-hold` label

Eligible updates are squash-merged into `main`.

## Field freeze

Before a competition or during a field-approved freeze, add the `dependency-hold` label to any pending Dependabot PR that must not merge automatically. Remove the label when routine dependency maintenance may resume.

Major dependency updates should always be reviewed and field-tested before merge because they may contain breaking changes.

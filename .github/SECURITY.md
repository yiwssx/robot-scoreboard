# Security Policy

## Supported versions

Security fixes are applied to the current `main` branch and the latest published release. Older releases may require upgrading before a fix can be provided.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub Security Advisories for this repository. Do not open a public issue for an unpatched vulnerability.

When reporting, include:

- a clear description of the issue and its potential impact;
- affected version, commit, or deployment context;
- minimal reproduction steps or a proof of concept when safe to provide;
- any known mitigations or prerequisites.

Reports will be triaged as soon as practical. Acknowledgement is targeted within 7 days, followed by remediation or mitigation based on severity and exploitability. Details should remain private until a fix or coordinated disclosure is ready.

## Security update process

Security-relevant dependency updates and code changes must pass the repository CI, dependency review, CodeQL analysis, and Windows field validation before merge. High-severity dependency audit findings are treated as merge blockers.

# Dependency Audit Policy

## Cadence

- Automated audits run weekly via GitHub Actions.
- Audits also run on demand before release promotion.

## Scope

- Bun/NPM dependency graph (`bun audit`).
- Rust dependency graph (`cargo audit`).
- GitHub Actions dependency updates via Dependabot.

## SLA

- Critical/High vulnerabilities: triage within 24 hours, patch within 7 days.
- Moderate vulnerabilities: triage within 5 business days.
- Low vulnerabilities: triage in normal dependency maintenance cycle.

## Exceptions

Any deferred vulnerability requires:

1. Risk justification.
2. Compensating controls.
3. Expiration date for exception review.

# Strict Policy

Apply this policy in debugging, production fixes, regression investigation, and execution-heavy tasks.

## 1. Evidence first
Do not conclude root cause without evidence.
Use:
- logs
- traces
- command output
- test failures
- reproduction steps

## 2. No unbounded changes
Do not expand scope unless clearly justified.
Do not mix:
- bug fix
- refactor
- cleanup
- redesign
in a single pass without explicit reason.

## 3. Validate before claiming success
Do not say "done", "fixed", or equivalent unless validation exists.
Validation should be concrete, such as:
- passing test
- successful command output
- reproduced issue no longer occurs
- screenshot or artifact evidence

## 4. Prefer the smallest safe fix
When multiple options exist, prefer the smallest fix that is:
- understandable
- testable
- reversible

## 5. Escalate uncertainty explicitly
If evidence is insufficient, say so directly.
Do not fabricate certainty.

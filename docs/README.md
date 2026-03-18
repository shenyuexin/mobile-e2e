# Docs Index (Public)

This directory now keeps only public-facing architecture and delivery references.

## Public sections

- `architecture/` — reference architecture, capability model, platform/adapter design, governance/security
- `delivery/roadmap.md` — public roadmap and phase-level delivery direction
- `delivery/npm-release-and-git-tagging.zh-CN.md` — release/tagging operational guide
- `delivery/p0-p2-execution-plan.zh-CN.md` — phased execution plan for trust/value-positioning improvements
- `showcase/` — reproducible demo evidence, recordings, and run reports
  - `showcase/README.md` — showcase entry with reproducible scripts and canonical video assets
  - `showcase/demo-playbook.zh-CN.md` — verified happy-path and interruption-recovery demo scripts
- `templates/` — reusable templates for ADR, review, evidence, and planning artifacts

## Publication boundary

The following document classes are intentionally not kept in public docs:

- Dated execution snapshots and one-off trial records
- Internal checklists used for temporary rollout waves
- In-flight phase/program tracking files tied to mutable internal ownership

If a delivery process becomes stable and reusable, promote it into `architecture/` or a durable `delivery/` document.

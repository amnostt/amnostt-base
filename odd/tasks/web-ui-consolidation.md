# Web UI Consolidation

> **Estado histórico:** tracker archivado; sus referencias a `docs/UI.md` describen la unidad documental ya completada y no son instrucciones vigentes.

## Objective

Inventory the implemented Web UI and consolidate `docs/UI.md` into the canonical, evidence-based UI contract without changing application behavior.

## Problem

`docs/UI.md` mixes implemented behavior with future intent and contains sidebar details that have drifted from the agreed product decision. The current UI also has documented gaps and architectural nuances that must not be presented as implemented capabilities.

## Why

A single accurate contract will give future UI work a reliable baseline, prevent planned behavior from being mistaken for existing behavior, and make the next source or artifact change reviewable.

## Scope

- Record the verified Web UI inventory and its evidence in the task history.
- Establish the canonical UI foundations: shadcn/ui, Base UI, Vega, neutral CSS variables, Lucide, and Inter.
- Consolidate `docs/UI.md` around the feature-first architecture and the behavior currently supported by the application.
- Document the canonical Sidebar as responsive, collapsible, and cookie-persisted.
- Distinguish implemented behavior, known gaps, and future intent, including the current English UI copy versus the Spanish documentation language.
- Preserve the accurate architecture boundary: Auth uses Store + Repository; Tasks has a repository, but orchestration remains local to `TaskListPage`.

## Out of scope

- Any application source, UI component, styling token, route, or runtime behavior change.
- Implementing missing shared primitives or replacing ad hoc task query controls.
- Extending dirty-form confirmation to Sheet overlay or Escape dismissal.
- Creating the absent `docs/FRONTEND_ARCHITECTURE.md`.
- Reorganizing feature code, adding tests, changing copy in the application, or performing remote operations.
- No commit, push, pull request, or remote operation is part of this work.

## Constraints

- This implementation unit changes only `docs/UI.md` and this tracker.
- The canonical contract remains in neutral professional Spanish; application copy remains English and unchanged.
- No claim may exceed the verified inventory. Future intent must be labeled as future intent.
- The first source or artifact write after this tracker was `docs/UI.md`; no application source was changed.
- Each implementation task is a separate, reviewable work unit and remains below the advisory ~400 authored changed-line heuristic.

## Authorized scope

The user authorized inventory of the current Web UI and consolidation of `docs/UI.md` into the canonical contract. This unit used that authorization only for `docs/UI.md` and this tracker; no application source or UI behavior was edited.

## Tasks

### T-WUI-01 — Complete and preserve the Web UI inventory

**Status:** Complete

- [x] **WUI-001** Capture the current documentation, configuration, tokens, shared components, feature screens, and behavioral-test inventory.
- [x] **WUI-002** Record the evidence boundary so implementation claims can be checked against repository files rather than product plans.

**Evidence:** Inventory covered `docs/UI.md`, `apps/web` configuration and tokens, shared UI components, feature screens, and behavioral tests. The verified findings are recorded in the feature context supplied for this task.

### T-WUI-02 — Decide the canonical Sidebar contract

**Status:** Complete

- [x] **WUI-003** Resolve sidebar drift in favor of a responsive, collapsible, cookie-persisted Sidebar.
- [x] **WUI-004** Mark this decision as the contract to carry into `docs/UI.md`, without implementing behavior in this unit.

**Evidence:** The user explicitly selected the responsive, collapsible, cookie-persisted Sidebar as canonical. No source change is required or permitted for this tracker.

### T-WUI-03 — Consolidate `docs/UI.md`

**Status:** Complete

- [x] **WUI-005** Rewrite `docs/UI.md` as the canonical contract, leading with implemented behavior and separating future intent.
- [x] **WUI-006** Document the canonical foundations, feature-first structure, accurate Auth and Tasks architecture boundaries, Sidebar decision, and known gaps.
- [x] **WUI-007** Preserve the distinction between the English UI copy and the Spanish documentation currently present; do not change application copy.

**Evidence:** `docs/UI.md` now contains one neutral-professional-Spanish contract with purpose, evidence legend, contributor path, verified foundations, feature-first boundaries, canonical Sidebar, implemented behavior, gaps, future intent, and a repository-relative evidence map. The diff is documentation-only.

### T-WUI-04 — Verify the consolidated contract

**Status:** Complete

- [x] **WUI-008** Read `docs/UI.md` back and confirm every implemented claim is supported by the inventory.
- [x] **WUI-009** Confirm planned behavior is labeled as future intent and the Sidebar contract has no conflicting variant.
- [x] **WUI-010** Run documentation-oriented checks and record exact results, including a clean diff check and confirmation that source files were untouched.

**Evidence:** Structural readback succeeded after formatting; the contract separates implemented behavior, known gaps, and future intent, and contains no competing Sidebar variant. Final Prettier check and `git diff --check` passed. `git status --short` showed only ` M docs/UI.md` and `?? odd/`; no application source path appeared. The requested diff-stat command reported only the tracked `docs/UI.md` diff because the tracker remains untracked.

## Acceptance criteria

- [x] **AC-01** `docs/UI.md` is the canonical UI contract and no longer conflates implemented behavior with future intent.
- [x] **AC-02** The contract names shadcn/ui, Base UI, Vega, neutral CSS variables, Lucide, and Inter as the verified foundations.
- [x] **AC-03** The contract describes feature-first organization and does not claim Store + Repository is uniform: Auth uses it; Tasks retains local orchestration in `TaskListPage` despite having a repository.
- [x] **AC-04** The Sidebar is described exactly as responsive, collapsible, and cookie-persisted, with no stale competing behavior.
- [x] **AC-05** Known gaps are explicit, including missing shared primitives, ad hoc task query controls, and incomplete dirty-form confirmation for Sheet overlay/Escape dismissal.
- [x] **AC-06** The documentation accurately accounts for English UI copy and Spanish `docs/UI.md` content without changing application source.
- [x] **AC-07** Verification evidence shows only the authorized documentation paths changed; no source behavior, remote, commit, or PR operation is part of this unit.

## Applicable checks

- Read back `odd/tasks/web-ui-consolidation.md`: **passed after completion updates**.
- `pnpm --filter @amnostt/web exec prettier --check ../../docs/UI.md`: **passed** (`All matched files use Prettier code style!`). The initial check failed, so the authorized normalizer `pnpm --filter @amnostt/web exec prettier --write ../../docs/UI.md` was run before the final checks.
- `git diff --check`: **passed** with no output.
- `git status --short`: **observed** ` M docs/UI.md` and `?? odd/`; no `apps/web` source or test path appeared.
- `git diff --stat -- docs/UI.md odd/tasks/web-ui-consolidation.md`: **observed** `docs/UI.md | 167 +++++++++++++++++++++++++++++++------------------------------` and `1 file changed, 86 insertions(+), 81 deletions(-)`; the untracked tracker is not included in Git diff statistics.
- Runtime, unit, integration, and end-to-end checks: **N/A for this docs-only unit; source behavior was not changed.**

## Progress, evidence, and next step

**Current status:** Complete. Inventory, Sidebar decision, documentation consolidation, and verification are complete.

**Completed evidence:** `T-WUI-01` and `T-WUI-02` contain the verified inventory boundary and explicit Sidebar decision; the `docs/UI.md` focused diff, 129-line structural readback, final formatting check, clean diff check, status output, and untouched-source confirmation are recorded above.

**Next step:** None for this authorized unit. Future UI changes must update the contract and its evidence without treating the listed gaps or future intent as implemented.

## TDD mode

**N/A for this docs-only unit.** Source behavior was not changed, so no tests were added or modified. The documentation consolidation required structural/readback verification rather than behavioral TDD.

## Rollback boundary

This unit rolls back by restoring the pre-consolidation contents of `docs/UI.md` and removing only the feature-tracker additions represented by `odd/tasks/web-ui-consolidation.md`. It must not revert, delete, or alter application source, configuration, tests, generated files, or unrelated work. No runtime behavior is included in the rollback boundary.

## Delivery note

The user later explicitly authorized a local commit. Commit `ea72d3f` on branch `docs/web-ui-contract` contains the documentation consolidation. No push or pull request was requested or performed.

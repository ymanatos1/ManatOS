# Manual GitHub setup — Phase 1 (independent repository)

## A. Create the control repository (does NOT change ManatOS source)

1. In GitHub, use **+ → New repository**. Name it `ManatOS.DevOps`, preferably **Private**; choose your usual owner. Initialize an empty `main` branch (README optional).
2. Extract `ManatOS.DevOps_Standalone_Phase1.zip` locally. In the **new DevOps repository**, use **Add file → Upload files** to upload the extracted **files and directories** (not the ZIP itself), retaining `.github/workflows/`, `scripts/`, `docs/` and `README.md`.
3. If browser upload fails to preserve `.github`, use **Add file → Create new file**, name it `.github/workflows/manatos-ci.yml` (and similarly `.github/workflows/devops-self-test.yml`), then paste the file contents.
4. Save/commit these files **in the new DevOps repository's `main` branch only**. GitHub Actions requires committed workflow YAML files on the default branch. You do NOT have to commit anything to ManatOS's application repository now.

## B. Configure GitHub manually

In `ManatOS.DevOps` open **Settings → Secrets and variables → Actions → Variables** and create:

| Name | Value | Purpose |
|---|---|---|
| `MANATOS_SOURCE_REPOSITORY` | `OWNER/ManatOS` (replace with the actual full GitHub repository name) | The existing application repo |
| `MANATOS_SOURCE_REF` | `main` (or the actual default branch name) | Default application branch |
| `AUTO_CI_ENABLED` | `false` | Automatic scheduled verification OFF initially |
| `AUTO_CI_ALL` | `true` | When automatic mode is enabled, full CI is selected |
| `AUTO_CI_API` | `false` | Optional additional scheduled family run |
| `AUTO_CI_UIS` | `false` | Optional additional scheduled family run |
| `AUTO_CI_NG1` | `false` | Optional targeted diagnostics |
| `AUTO_CI_EJS1` | `false` | Optional targeted diagnostics |

If the application repository is **private**, add a fine-grained personal access token in **Settings → Secrets and variables → Actions → Secrets**:

| Name | Permissions |
|---|---|
| `MANATOS_SOURCE_READ_TOKEN` | Fine-grained PAT, **only** the application repository, **Contents: Read-only**, no extra access |

Create the PAT in your GitHub account **Settings → Developer settings → Personal access tokens → Fine-grained tokens**. Select the application repository, not all repositories. Treat token expiration/rotation as a normal maintenance task. For an application repository that is publicly readable, the secret is not needed. For organization repositories, approval/policy restrictions may apply. Long-term alternative: a dedicated GitHub App with installation-scoped read access.

In **Settings → Actions → General**, allow only necessary approved actions and set default `GITHUB_TOKEN` permissions to **read-only** where possible. The workflow explicitly requests `contents: read` and does not write to the application repository.

## C. First run

1. `ManatOS.DevOps` → **Actions → DevOps Configuration Self-test → Run workflow**. Confirm it passes (30 combinations, no application checkout).
2. **Actions → ManatOS CI → Run workflow**; choose `all`, `verify`, leave `source_ref` blank → **Run workflow**.
3. Open the run, follow the `plan` and `ci` jobs, and inspect the step logs and the **Summary** tab.
4. Download `manatos-ci-...` from **Artifacts** for detailed step logs, `result.json` and `summary.md`.

**Any failure must be fixed based on the actual log; a simulated validation is not a real GitHub run.**

## D. Enable scheduled checks later (optional)

Change `AUTO_CI_ENABLED` to `true` and leave `AUTO_CI_ALL=true`. This enables scheduled CI checks approximately every six hours, subject to GitHub Actions scheduling delays. Manual **Run workflow** remains available regardless of the automatic switch.

**Important:** Because CI lives in a different repository, pushes to ManatOS do not automatically trigger it. Immediate source-push CI requires an integration (e.g. GitHub App or a small dispatch workflow in the source repo). We deliberately do not modify ManatOS in Phase 1. Manual runs and optional schedules work independently today.

## E. Keep a source archive under the application project's `devops/` folder

Use the separate `ManatOS_devops_ProjectReference_Phase1.zip` package when you are ready to include an archival copy in a later ManatOS project commit. The root `devops/` directory is documentation/history **only**: GitHub Actions runs the workflow from the separate repository's root `.github/workflows/`, NOT the nested archived copies.

**Do not upload either ZIP as a single file to GitHub. Extract first.**

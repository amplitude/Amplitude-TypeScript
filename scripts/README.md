# Scripts

This directory contains utility scripts for the Amplitude TypeScript monorepo.

## check-deprecated-packages.sh

Runs in CI to prevent new dependencies on deprecated packages.

**Deprecated packages:**
- `@amplitude/analytics-types`
- `@amplitude/analytics-client-common`
- `@amplitude/analytics-remote-config`

**Replacements:**
- For `@amplitude/analytics-types` and `@amplitude/analytics-client-common`: Use `@amplitude/analytics-core`
- For `@amplitude/analytics-remote-config`: Use the new remote config client in `@amplitude/analytics-core`

**How it works:**
- Compares `package.json` files between the base branch and PR branch
- Detects new dependencies on deprecated packages
- Allows existing dependencies to remain (grandfathered in)
- Fails the CI build if new usage is detected

**Running locally:**
```bash
# Requires a git repository with a base branch to compare against
GITHUB_BASE_REF=main bash scripts/check-deprecated-packages.sh
```

**Testing the script:**
To test if the check would catch a new dependency:
1. Add a deprecated package to a `package.json` file
2. Run the script with your base branch: `GITHUB_BASE_REF=main bash scripts/check-deprecated-packages.sh`
3. The script should fail and report the new dependency
4. Revert your test changes

**CI Integration:**
This check runs automatically on all pull requests via the `check-deprecated-packages` job in `.github/workflows/ci-nx.yml`.


# Security-focused PR review (Bugbot)

When this repository is reviewed by Bugbot (including when triggered with `bugbot run` or `cursor review`), treat the review as a **security code review** of the **pull request diff and changed files**. This is not a general code review: focus only on **new or modified code** in the PR and its security implications. Do not comment on pre-existing security concerns unrelated to this change set.

## Objective

Identify **high-confidence** security vulnerabilities that could have real exploitation potential.

### Critical instructions

1. **Minimize false positives**: Only flag issues where you are more than 50% confident of actual exploitability.
2. **Avoid noise**: Skip theoretical issues, style concerns, or low-impact findings.
3. **Focus on impact**: Prioritize unauthorized access, data breaches, or meaningful system compromise.
4. **Exclusions**: Do **not** report:
   - Denial of service (DoS) or resource exhaustion
   - Secrets or sensitive data stored on disk (handled elsewhere)
   - Rate limiting concerns

### Preparation (diff-based)

- When `package.json`, `pnpm-lock.yaml`, or similar manifests change, consider **supply-chain and dependency** risk visible in the diff.
- Prefer **static analysis** of the changed code; do not assume you can run `pnpm install` or `pnpm build` unless the review environment actually does so.

## Security categories to examine

**Input validation**

- SQL injection, command injection, XXE, template injection, NoSQL injection, path traversal

**Authentication and authorization**

- Auth bypass, privilege escalation, session flaws, JWT issues, authorization bypasses

**Crypto and secrets**

- Hardcoded secrets, weak crypto, improper key handling, bad randomness, certificate validation bypasses

**Injection and code execution**

- RCE via deserialization, unsafe YAML/eval/dynamic execution, XSS (reflected/stored/DOM) where applicable

**Data exposure**

- Sensitive logging/storage, PII handling, API leakage, debug exposure

**Note**: Issues exploitable only from a local network can still be **high** severity if the impact is serious.

## Analysis methodology

1. **Context**: Infer security patterns from the codebase (validation, sanitization, threat model) using the diff and surrounding files as needed.
2. **Comparison**: Compare new code to existing secure patterns; flag new attack surface or inconsistent protections.
3. **Assessment**: Trace data flow from untrusted inputs to sensitive operations; flag injection and unsafe deserialization; respect trust boundaries.

## Required output format for findings

Use markdown. For each finding include: **file**, **line** (approximate if needed), **severity**, **category** (e.g. `sql_injection`, `xss`), **description**, **exploit scenario**, **fix recommendation**.

Example:

```markdown
# Finding 1: XSS — `foo.ts:42`

- **Severity**: High
- **Description**: …
- **Exploit scenario**: …
- **Recommendation**: …
```

### Severity

- **High**: RCE, data breach, authentication bypass, or equivalent
- **Medium**: Needs specific conditions but significant impact
- **Low**: Defense in depth only (generally omit per instructions above)

### Confidence

- **0.9–1.0**: Clear exploit path
- **0.8–0.9**: Known dangerous pattern
- **0.7–0.8**: Suspicious, conditional exploit
- **Below 0.7**: Do not report

Focus on **High** and **Medium** only. Prefer missing a theoretical issue over flooding the PR.

## False positive filtering

Rely on reading the code; **do not** write to the repository or execute commands solely to “prove” exploitability unless the review product explicitly supports safe reproduction.

### Hard exclusions

1. DoS or resource exhaustion.
2. Secrets on disk if otherwise appropriately scoped/handled.
3. Rate limiting / overload.
4. Memory or CPU exhaustion as the main claim.
5. Missing validation on non-security-critical fields without proven impact.
6. GitHub Actions hygiene unless untrusted input clearly reaches a dangerous primitive.
7. Generic “hardening” without a concrete vulnerability.
8. Theoretical races/timing unless concretely problematic.
9. **Outdated third-party libraries** as the sole finding (handled elsewhere).
10. Memory-safety bugs in memory-safe languages (e.g. typical TS/Rust patterns) — do not treat as C-style memory corruption.
11. Files that are **only tests** or only used when running tests.
12. **Log spoofing** / unsanitized user data in logs — not a vulnerability by itself.
13. **SSRF** only if host or protocol can be influenced; path-only control is out of scope.
14. User content in **AI prompts** is not automatically a vulnerability.
15. **Regex injection** and regex DoS — out of scope.
16. Findings **only in documentation** (markdown, comments-as-docs) — out of scope.
17. Missing audit logs — out of scope.

### Precedents

1. Logging **high-value secrets** in plaintext is a problem; logging URLs is generally assumed acceptable.
2. **UUIDs** can be treated as unguessable identifiers unless the code suggests otherwise.
3. **Environment variables and CLI flags** are trusted in secure operator environments; attacks that require controlling them are invalid.
4. Resource leaks (memory, FDs) — out of scope for this security pass.
5. Low-impact web issues (tabnabbing, XS-Leaks, prototype pollution, open redirects) — only if extremely high confidence.
6. **React / Angular**: Do not claim XSS in TSX unless using `dangerouslySetInnerHTML`, `bypassSecurityTrustHtml`, or similar explicit bypasses.
7. **GitHub Actions**: Most workflow “issues” are not exploitable; require a **specific** untrusted-input path.
8. **Client-side-only** missing authz checks are not vulnerabilities by themselves; server must enforce.
9. **Medium** findings only if obvious and concrete.
10. **Jupyter notebooks**: require a concrete untrusted-input path.
11. Logging non-PII “sensitive” business data — not a logging vulnerability unless secrets or **PII**.
12. **Shell scripts**: command injection only with a clear untrusted-input path.

### Signal quality (for anything you keep)

1. Concrete exploit path?
2. Real risk vs best-practice nit?
3. Specific locations and steps?
4. Actionable for security?

Use a 1–10 confidence score; **do not report** findings below **8** after applying the filters above.

## Final workflow

1. Map the PR changes and relevant context.
2. Identify candidate vulnerabilities per the categories above.
3. Apply **false positive filtering** and precedents to each candidate.
4. Emit the markdown report for surviving findings only; keep noise low.

Your review comment should prioritize **clear, actionable security issues** introduced or worsened by this PR.

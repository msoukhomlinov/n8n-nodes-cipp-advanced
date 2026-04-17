# M365 Security Alignment Review — securityPosture + becInvestigation

**Date:** 2026-04-17  
**Scope:** `composite-executor.ts` — `securityPosture` and `becInvestigation` functions  
**Focus:** Alignment with Microsoft M365 best practices, Secure Score ecosystem, MDCA/BEC community patterns  
**Method:** Implementation review + Microsoft Graph API research + CIPP OpenAPI inventory + community tooling (HAWK)

## Summary

| Area | Status | Key Issue |
|------|--------|-----------|
| Secure Score alignment | ⚠️ Partial | We compute signals that Secure Score already measures — not integrated |
| Security posture signals | ⚠️ Gaps | Missing anti-phishing, admin MFA split, risky users count |
| Score weighting | ❌ Arbitrary | Our -5/-20/-15/-10/-15 deductions have no basis in Microsoft methodology |
| BEC forwarding detection | ✅ Fixed | Using `ListMailboxRules` + external address filtering — correct |
| BEC: sign-in analysis | ⚠️ Shallow | No `riskDetections` (per-detection type), no impossible travel |
| BEC: OAuth app analysis | ⚠️ Incomplete | Checks risk level + AllPrincipals but not high-risk scopes |
| BEC: CIPP native tools | ⚠️ Underused | `ListMailboxForwarding` endpoint not used |
| Hidden inbox rules | ℹ️ Known gap | EXO PowerShell `-IncludeHidden` only — no API surface |
| Security alerts | ⚠️ Missing | `GET /security/alerts_v2` (MDCA BEC alerts) not checked |

**Total findings:** 2 High, 4 Medium, 3 Info/Low  
See [findings.md](./findings.md) for full detail.

## Files

- [Findings](./findings.md) — ranked by severity
- [Recommendations](./recommendations.md) — prioritized action items
- [CIPP Security Endpoint Inventory](./cipp-security-endpoints.md)

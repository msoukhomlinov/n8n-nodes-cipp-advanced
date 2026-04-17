# CIPP Security Endpoint Inventory

Security-relevant endpoints from `docs/openapi-20260416.json`. Cross-referenced against our composite usage.

## Used by Composites

| Endpoint | Used In | Notes |
|----------|---------|-------|
| `GET /api/ListMFAUsers` | securityPosture step 1 | ✅ Correct |
| `GET /api/ListBasicAuth` | securityPosture step 2 | ✅ Correct |
| `GET /api/ListConditionalAccessPolicies` | securityPosture step 3 | ✅ Correct |
| `GET /api/ListDefenderState` | securityPosture step 4 | ✅ Correct |
| `GET /api/ListSignIns` | becInvestigation step 1 | ✅ Correct |
| `GET /api/ListMailboxRules` | becInvestigation step 2 (no userId) | ✅ Fixed — live pull |
| `GET /api/ListUserMailboxRules` | becInvestigation step 2 (with userId) | ✅ Fixed — requires UserID |
| `GET /api/ListOAuthApps` | becInvestigation step 3 | ⚠️ Scope analysis incomplete |
| `GET /api/ExecBECCheck` | becInvestigation step 4 (optional) | ✅ Correct |

## Available But Unused — Should Add

| Endpoint | Relevant For | Priority |
|----------|-------------|----------|
| `GET /api/ListMailboxForwarding` | BEC — SMTP-level forwarding | **High** (F-2) |
| `GET /api/ListAntiPhishingFilters` | securityPosture — email security layer | **Medium** (F-3) |
| `GET /api/ListConditionalAccessPolicyChanges` | securityPosture — CA audit trail | Low |
| `GET /api/ListUserConditionalAccessPolicies` | securityPosture — per-user CA coverage | Low |
| `GET /api/ExecBECRemediate` | Post-investigation remediation | Out of scope (write op) |

## Requires ExecGraphRequest (No CIPP Proxy)

| Graph Endpoint | Relevant For | Licensing |
|----------------|-------------|-----------|
| `GET /security/secureScores?$top=1` | securityPosture — official score | M365/E3/E5 |
| `GET /security/secureScoreControlProfiles` | securityPosture — control metadata | M365/E3/E5 |
| `GET /identityProtection/riskyUsers` | BEC — aggregate risk state | AAD P1/P2 |
| `GET /identityProtection/riskDetections` | BEC — per-detection type | AAD P1/P2 |
| `GET /security/alerts_v2?$filter=category eq 'BEC'` | BEC — MDCA alerts | MDCA/E5 |

## Write Operations (Not Investigation)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/ExecBECRemediate` | Remediate a BEC-compromised account |
| `POST /api/ExecDismissRiskyUser` | Dismiss Identity Protection risky user flag |
| `POST /api/ExecResetMFA` | Reset user MFA |
| `POST /api/ExecPerUserMFA` | Enable per-user MFA |
| `POST /api/SetAuthMethod` | Configure auth method |

# Recommendations — M365 Security Alignment

Priority order based on MSP impact and implementation effort.

---

## Priority 1 — High Impact, Low Effort

### R-1: Add `ListMailboxForwarding` to BEC investigation (F-2)

CIPP has `GET /api/ListMailboxForwarding`. Add as step 2b in `becInvestigation`. This catches SMTP-level forwarding (`ForwardingSmtpAddress`) set directly on mailbox objects — the most common attacker-set exfiltration path, invisible to inbox rule inspection.

**Effort:** ~15 lines. Add after existing step 2, merge results into `externalForwardingRules` or new `smtpForwardingRules` field.

```typescript
// Step 2b: SMTP-level mailbox forwarding (separate from inbox rules)
const s2b = await apiStep(ctx, 'mailbox.listMailboxForwarding', 'GET', '/api/ListMailboxForwarding', { tenantFilter });
steps.push(s2b);
// Parse s2b.data for external SMTP forwarding addresses
```

Verify field names from live API before implementing.

---

### R-2: Add anti-phishing policy check to securityPosture (F-3)

`GET /api/ListAntiPhishingFilters` is already in CIPP. Add as step 5. Check if any policy is enabled. Add to `indicators` object and apply a deduction if none configured.

**Effort:** ~10 lines.

```typescript
const s5 = await apiStep(ctx, 'tenant.listAntiPhishingFilters', 'GET', '/api/ListAntiPhishingFilters', { tenantFilter });
steps.push(s5);
const antiPhishingPolicies = toArray(s5.data);
const hasAntiPhishing = antiPhishingPolicies.some((p) => p.Enabled !== false);
if (!hasAntiPhishing) score -= 10;
```

---

### R-3: Split admin/user MFA deductions in securityPosture (F-6)

Admin without MFA is a Tier 0 risk. Apply asymmetric deductions:

```typescript
// Before (uniform deduction):
score -= Math.min(40, usersWithoutMfa.length * 5);

// After (split by role):
score -= Math.min(30, adminGaps.length * 15);    // admin gaps — high weight
score -= Math.min(20, (usersWithoutMfa.length - adminGaps.length) * 3);  // user gaps — lower weight
```

Total max deduction stays ~50, but admin gaps weighted 5× higher than user gaps.

---

### R-4: Document hidden inbox rule limitation in output (F-7)

Add `knownLimitations` to the BEC result object:

```typescript
const result: IDataObject = {
    riskScore,
    suspiciousSignIns,
    externalForwardingRules,
    suspiciousOAuthApps,
    knownLimitations: [
        'Hidden inbox rules (created with -Hidden flag in EXO PowerShell) are not accessible via CIPP API or Microsoft Graph. Run Get-InboxRule -IncludeHidden in EXO PowerShell for complete rule inventory.'
    ],
};
```

---

## Priority 2 — High Impact, Medium Effort

### R-5: Fetch actual Microsoft Secure Score (F-1)

Offer two output modes for `securityPosture`:
1. **Raw indicators** (current) — MFA%, basic auth bool, CA policy counts, Defender status
2. **Microsoft Secure Score** (new) — call `ExecGraphRequest → GET /security/secureScores?$top=1`

Return both in output:

```typescript
result: {
    score,           // our illustrative score (kept for backwards compat)
    indicators: {    // rename existing fields here for clarity
        mfa, basicAuth, caPolicies, defender, antiPhishing
    },
    secureScore: secureScoreResult ?? null,  // Microsoft's official score, null if unavailable
}
```

The Graph call requires `SecurityEvents.Read.All` permission — may not be granted in all tenants. Wrap in try/catch, degrade gracefully.

---

### R-6: Improve OAuth app scope analysis in BEC investigation (F-5)

After fetching `ListOAuthApps`, also flag apps by dangerous scope — not just `AllPrincipals` or `riskLevel=high`:

```typescript
const HIGH_RISK_SCOPES = ['Mail.ReadWrite', 'MailboxSettings.ReadWrite', 'Mail.Send', 'Contacts.ReadWrite', 'full_access_as_user', 'Calendars.ReadWrite'];

const suspiciousOAuthApps = oauthApps.filter((a) => {
    if (a.riskLevel === 'high' || a.consentType === 'AllPrincipals') return true;
    // Check if app has high-risk mail/calendar scopes
    const scopes = (a.permissions as string ?? a.scopes as string ?? '').split(' ');
    return scopes.some((s) => HIGH_RISK_SCOPES.includes(s));
});
```

Field name (`permissions` vs `scopes`) must be verified from live `ListOAuthApps` response.

---

## Priority 3 — Medium Impact, Higher Effort (Licensing-Gated)

### R-7: Add Identity Protection risky users to BEC investigation (F-4)

Best-effort step using `ExecGraphRequest`. Requires Identity Protection P1+:

```typescript
// Best-effort step — degrades gracefully if Identity Protection not licensed
const riskyUsersStep = await apiStep(ctx, 'user.listRiskyUsers', 'GET', '/api/ExecGraphRequest', {},
    { Endpoint: 'identityProtection/riskyUsers?$filter=riskState eq atRisk or riskState eq confirmedCompromised&$top=50', tenantFilter }
);
```

Include count in risk score calculation: +5 per confirmed-compromised user (up to +20).

---

### R-8: Add MDCA security alerts to BEC investigation (F-8)

Best-effort step — requires MDCA/Defender for Cloud Apps licensing (E5 or add-on):

```typescript
// Best-effort — fails gracefully on 403 (no MDCA license)
const becAlertsStep = await apiStep(ctx, 'security.alerts', 'GET', '/api/ExecGraphRequest', {},
    { Endpoint: "security/alerts_v2?$filter=category eq 'BEC'&$top=20", tenantFilter }
);
```

Include alert count in risk score. Return alert titles/severities in output.

---

## STRIDE/OWASP Coverage Note

This review focused on domain-correctness (M365 signal completeness), not code-level vulnerabilities. The composite operations make only read API calls, return data to n8n — no injection surface, no auth bypass vector, no data at rest. A separate code security audit is not warranted for this module.

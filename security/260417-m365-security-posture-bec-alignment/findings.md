# Findings — M365 Security Alignment Review

## [HIGH] F-1: Security posture score weighting is arbitrary, not aligned to Microsoft methodology

**Location:** `composite-executor.ts:securityPosture` — score calculation (~line 224–230)  
**Confidence:** Confirmed

**Description:**  
Our score uses hardcoded deductions: -5/user without MFA (max -40), -20 basic auth, -15 no MFA CA, -10 no legacy-auth block, -15 Defender inactive. These values are invented. Microsoft Secure Score uses a different weighted system per control, normalized to `currentScore / maxScore * 100` based on which licensed controls are available for the tenant.

**Impact:**  
An AI agent or MSP receiving our score may compare it to the tenant's actual Secure Score and get conflicting numbers. The score is misleading as an absolute metric.

**Secure Score API:**  
`GET /v1.0/security/secureScores?$top=1` returns `currentScore`, `maxScore`, and `controlScores[]` per control. CIPP has no proxy — it requires `ExecGraphRequest`.

**Mitigation options:**  
- Option A: Fetch actual Secure Score via `ExecGraphRequest` and return `{ currentScore, maxScore, pct, controlScores[] }` — eliminates reinvention entirely
- Option B: Rename our computed value from `score` to `postureIndicators` with separate boolean/count fields — clearer that it's raw signals, not a Microsoft-aligned score
- Option C (recommended): Do both — include actual Secure Score as `secureScore` sub-object + keep our raw signal analysis as `indicators` sub-object

---

## [HIGH] F-2: BEC investigation missing CIPP-native `ListMailboxForwarding` endpoint

**Location:** `composite-executor.ts:becInvestigation` step 2 (~line 263–268)  
**Confidence:** Confirmed

**Description:**  
CIPP exposes `GET /api/ListMailboxForwarding` — a dedicated endpoint for auditing email forwarding rules at the tenant level. Our BEC investigation fetches mailbox rules (`ListMailboxRules` or `ListUserMailboxRules`) and then parses `ForwardTo`/`ForwardAsAttachmentTo`/`RedirectTo` fields client-side.

`ListMailboxForwarding` likely returns pre-filtered forwarding configuration (SMTP forwarding at the mailbox level, transport rules) — a separate vector from inbox rules. External SMTP forwarding configured via `Set-Mailbox -ForwardingSmtpAddress` is NOT captured by inbox rules at all.

**Impact:**  
BEC investigations miss tenant-level forwarding configured via `ForwardingAddress` / `ForwardingSmtpAddress` on the mailbox object itself — the most common attacker-set exfiltration path that bypasses inbox rules.

**Mitigation:**  
Add step 2b: `GET /api/ListMailboxForwarding` (tenant-wide or per-user). Parse results for external targets. Include in `externalForwardingRules` output or as separate `smtpForwardingRules` field.

---

## [MEDIUM] F-3: securityPosture missing anti-phishing policy check

**Location:** `composite-executor.ts:securityPosture` — no step for anti-phishing  
**Confidence:** Confirmed

**Description:**  
CIPP exposes `GET /api/ListAntiPhishingFilters`. Microsoft Secure Score includes "Enable Defender for Office 365 Safe Attachments" and "Enable Defender for Office 365 Safe Links" as scored controls. Having a configured anti-phishing policy is a core email security posture indicator for any M365 tenant with Exchange Online.

Our composite only checks Defender (endpoint), MFA, basic auth, and CA policies — missing the email security layer entirely.

**Mitigation:**  
Add step 5: `GET /api/ListAntiPhishingFilters` — check if at least one policy exists and is enabled. Deduct from score (or add to `indicators`) if missing.

---

## [MEDIUM] F-4: BEC sign-in analysis uses only sign-in logs, not Identity Protection risk detections

**Location:** `composite-executor.ts:becInvestigation` step 1 + `suspiciousSignIns` filter  
**Confidence:** Confirmed

**Description:**  
We fetch sign-ins and filter by `riskState=atRisk`, `riskDetail!='none'`, or non-zero `errorCode`. This relies on Identity Protection P1/P2 licensing for the `riskState`/`riskDetail` fields. Without those licenses, all users appear non-risky.

Microsoft exposes two richer APIs:
- `GET /identityProtection/riskDetections` — individual detections with `detectionType` (e.g., `unfamiliarFeatures`, `anonymizedIPAddress`, `maliciousIPAddress`, `investigationsThreatIntelligence`, `impossibleTravel`)
- `GET /identityProtection/riskyUsers` — aggregate per-user risk state, more stable than per-sign-in

CIPP likely has no direct proxy — would require `ExecGraphRequest`.

**Impact:**  
BEC risk scoring under-counts suspicious activity for tenants with IP1 but no per-sign-in risk annotation. Impossible travel and anonymous IP detections (key BEC indicators) are invisible.

**Mitigation:**  
Add optional step: attempt `ExecGraphRequest` to `GET /identityProtection/riskyUsers?$top=50` — count `atRisk` and `confirmedCompromised` users, include in `riskScore` calculation and output. Document as best-effort (licensing-gated).

---

## [MEDIUM] F-5: BEC OAuth app analysis misses high-risk scope enumeration

**Location:** `composite-executor.ts:becInvestigation` `suspiciousOAuthApps` filter (~line 359–362)  
**Confidence:** Confirmed

**Description:**  
Current filter: `riskLevel === 'high' || consentType === 'AllPrincipals'`. This misses:
- Apps consented by individual users (`consentType === 'Principal'`) with high-risk scopes (e.g., `Mail.ReadWrite`, `MailboxSettings.ReadWrite`, `Calendars.ReadWrite`)
- Apps with `AllPrincipals` but only low-risk scopes (false positives)

The HAWK community checklist specifically flags `oauth2PermissionGrants` with mail/calendar write scopes as primary BEC indicators regardless of consent type.

**Mitigation:**  
Filter `ListOAuthApps` results to also flag any app where `permissions` (or `scopes`) contains `Mail.ReadWrite`, `MailboxSettings.ReadWrite`, `Contacts.ReadWrite`, `Mail.Send`, or `full_access_as_user`. The exact field name in CIPP's response needs verification.

---

## [MEDIUM] F-6: securityPosture does not distinguish admin MFA gaps from user MFA gaps

**Location:** `composite-executor.ts:securityPosture` MFA analysis (~line 183–194)  
**Confidence:** Confirmed

**Description:**  
We compute `usersWithoutMfa` (all users) and `adminGaps` (admins without MFA) but apply the same `-5/user` deduction for both. Microsoft Secure Score treats admin MFA (`AdminMFAV2`) as a separate, higher-weight control from user MFA (`MFARegistrationV2`). An admin without MFA should carry a much higher risk weight than a regular user.

**Mitigation:**  
Apply asymmetric deductions: admin gaps = -15/admin (max -30), user gaps = -3/user (max -15). Or switch to Option C from F-1 and use the actual Secure Score values.

---

## [INFO] F-7: Hidden inbox rules (EXO `-IncludeHidden`) not accessible via API

**Location:** `composite-executor.ts:becInvestigation` — architecture limitation  
**Confidence:** Confirmed — known Microsoft API gap

**Description:**  
The Exchange Online PowerShell command `Get-InboxRule -IncludeHidden` exposes hidden inbox rules that attackers create to hide their tracks (e.g., rules that delete flagged emails, move BEC-reply emails to trash). These are NOT exposed via Graph API or CIPP's `ListMailboxRules`/`ListUserMailboxRules`.

This is a known limitation of the Microsoft API surface — HAWK, Microsoft's own documentation, and Huntress research all note this gap.

**Mitigation:**  
Document this limitation in the composite's return value (add `knownLimitations: ['hidden-inbox-rules-require-exo-powershell']` to the result). Recommend MSPs use the CIPP UI's mailbox rules section or a dedicated runbook for hidden rule detection.

---

## [INFO] F-8: `GET /security/alerts_v2` not checked for MDCA BEC alerts

**Location:** `composite-executor.ts:becInvestigation` — missing step  
**Confidence:** Possible (licensing-gated)

**Description:**  
Microsoft Defender for Cloud Apps generates BEC-specific alerts (impossible travel, suspicious inbox rule creation, mass download anomaly) surfaced via `GET /security/alerts_v2`. These represent Microsoft's own BEC detection logic. CIPP has no proxy — requires `ExecGraphRequest`.

Gated on MDCA/Defender for Cloud Apps licensing (E5 or standalone add-on).

**Mitigation:**  
Add optional best-effort step: attempt `ExecGraphRequest` to `GET /security/alerts_v2?$filter=category eq 'BEC' or category eq 'Phishing'&$top=20`. If request fails (403/404 = no MDCA license), skip gracefully and note in output.

---

## [INFO] F-9: Our implementation does not reinvent CIPP's ExecBECCheck

**Location:** `composite-executor.ts:becInvestigation` step 4  
**Confidence:** Confirmed — this is correct behaviour

**Description:**  
We call `ExecBECCheck` when `userId` is provided. This is CIPP's native BEC analysis endpoint — we correctly delegate to it rather than reimplementing its logic. No action needed.

The only risk is that `ExecBECCheck` may itself use the UAL (Unified Audit Log) which CIPP accesses differently from sign-in logs. Verify that our sign-ins step and CIPP's BEC check don't double-count the same anomalies.

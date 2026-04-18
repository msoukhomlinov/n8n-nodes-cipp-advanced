# Changelog

All notable changes to `n8n-nodes-cipp-advanced` will be documented in this file.

## [1.3.0] - 2026-04-18

### Breaking Changes
- `getSecureScore` default output changed from raw API response (~4MB) to `summary` mode (~2KB). Existing workflows that rely on the raw response must set `outputMode` to `Full` in options.
- `includeControlProfiles` option removed from `getSecureScore`. Use the `getSecureScoreControlProfiles` operation instead.

### Added
- `getSecureScore`: six output modes — `summary`, `categoryBreakdown`, `implementationStatus`, `averaged`, `slim`, `full`
- `getSecureScore`: `includeDescriptions` option re-adds control descriptions to modes that strip them
- `getSecureScore` (AI Tools): `outputMode` and `includeDescriptions` params with relative-size guidance
- Internal: `P.localEnum` / `P.localBool` param helpers for post-processing directives not forwarded to API
- Internal: `transform` hook on `OperationDef` for AI Tools executor post-processing

## [1.2.3] - 2026-04-18

### Fixed

- **Tenant: Get Secure Score — 400 error on all tenants** — `graphFilter: '$top=N'` was being passed to CIPP's `ListGraphRequest`, which maps `graphFilter` to Graph's OData `$filter` parameter. `$top=N` is not valid `$filter` syntax; Microsoft Graph returned 400 Bad Request for every tenant. Fixed by passing `'$top': historyCount` as a direct OData query parameter (same pattern used by `user.getAll`). Also fixed the AI Tools registry default and exposed `$top` as the user-facing param instead of `graphFilter`. **GDAP note:** this endpoint also requires the **Security Reader** role in your GDAP relationship and `SecurityEvents.Read.All` application permission on the CIPP SAM app

## [1.2.2] - 2026-04-17

### Fixed

- **Composite workflows — output size** — raw `.data` payload stripped from every entry in the composite `steps[]` array before the final envelope is built. Each step now returns metadata only: `{ step, ok, count?, error? }`. Previously `securityPosture` on a 300-user tenant returned ~2MB (steps embedded full MFA user objects with nested `CAPolicies[]`, full CA policy objects, and full Secure Score `controlScores[]`), exceeding n8n output size limits and burning AI token budgets. The processed composite `result` (indicators, gaps, summaries) is unchanged. Affects all five composites: `securityPosture`, `licenseAudit`, `becInvestigation`, `user360`, `crossTenantSweep` (including sub-composites)
- **Composite workflows — step metadata** — new `count` field on each step reports the number of items in the raw response (via `toArray()`), giving the LLM visibility into data sizes without the payload. `crossTenantSweep`'s manual `tenant.getAll` step uses the actual tenant count directly

## [1.2.1] - 2026-04-17

### Added

- **Tenant: Get Secure Score** — new `getSecureScore` operation fetches Microsoft Secure Score data for a tenant via `GET /api/ListGraphRequest → security/secureScores`; optional `includeControlProfiles` flag makes a second call to `security/secureScoreControlProfiles` and returns both as `{ scores[], controlProfiles[] }`; `historyCount` param controls how many historical entries are returned (default 1 = latest only)
- **AI Tools: Get Secure Score Control Profiles** — new `getSecureScoreControlProfiles` AI registry entry fetches control metadata (id, title, maxScore, category, remediation, implementationCost) for all Secure Score controls; complements `getSecureScore` for full security posture analysis; requires `SecurityEvents.Read.All` on the SAM app

### Fixed

- **Tenant: Get Secure Score** — `historyCount=0` edge case guarded with `Math.max(1, ...)` so n8n expressions that evaluate to `0` cannot produce a `$top=0` Graph query (which returns empty results)

## [1.2.0] - 2026-04-17

### Added

- **Security Posture** — expanded from 9 to 15 API steps with 4 new indicator categories:
  - **s9 enrichment** — Secure Score response now includes `byCategory` roll-up (maxScore + currentScore per Microsoft category: Identity, Apps, Device, Data, Infrastructure) and `topMissedControls[]` (top 5 unachieved controls sorted by potential impact); types hoisted to module-scope interfaces
  - **s10 `ListBPA`** — Best Practice Analyser failing checks; adds `governance.bpaFailingCount`, `governance.bpaFailingItems[]`; gap fired when any BPA check fails
  - **s11 `ListTenantDrift`** — CIPP standards drift count; adds `governance.driftCount`; gap fired when standards are out of alignment
  - **s12 `ListGraphRequest → policies/authorizationPolicy`** — OAuth user consent policy; adds `access.userConsentEnabled`, `access.consentPolicies[]`; gap fired when users can self-consent to OAuth apps
  - **s13 `ListRoles`** — Global Administrator enumeration; adds `access.globalAdminCount`, `access.globalAdminUpns[]`; gap fired when count exceeds 5
  - **s14 `ListCompliancePolicies`** — Intune compliance policy presence; adds `endpoint.hasCompliancePolicies`, `endpoint.compliancePoliciesCount`; gap fired when no policies configured
  - **s15 `ListSharepointSettings`** — SharePoint external sharing level; adds `data.sharingLevel`; gap fired when Anyone links (unauthenticated access) enabled
- All 6 new steps are best-effort (never trigger `failMode=fast`); failures surface in `steps[]` without blocking other checks

## [1.1.9] - 2026-04-17

### Added

- **BEC Investigation** — added `GET /api/ListMailboxForwarding` as best-effort step `s2b`; detects SMTP-level forwarding (`ForwardingSmtpAddress` set via `Set-Mailbox`) which is invisible to inbox rule inspection; results in new `smtpForwardingRules[]` field and included in `riskScore`
- **BEC Investigation** — added `knownLimitations[]` field documenting that hidden EXO inbox rules (created with `-Hidden` flag) are not accessible via CIPP API or Graph and require `Get-InboxRule -IncludeHidden` in EXO PowerShell
- **Security Posture** — added Microsoft Secure Score via `GET /api/ListGraphRequest?Endpoint=security/secureScores`; returns `secureScore: { currentScore, maxScore, pct }` in result (`null` if step fails or `SecurityEvents.Read.All` not granted on SAM app)
- **BEC Investigation** — extended OAuth app suspicious filter to flag apps with high-risk mail/calendar scopes (`Mail.ReadWrite`, `MailboxSettings.ReadWrite`, `Mail.Send`, `Contacts.ReadWrite`, `full_access_as_user`, `Calendars.ReadWrite`) regardless of consent type
- **BEC Investigation** — added Identity Protection risky users via `GET /api/ListGraphRequest?Endpoint=identityProtection/riskyUsers` (best-effort step s5; requires AAD P1/P2); returns `riskyUsers[]` and `riskyUsersCount`; contributes to `riskScore`
- **BEC Investigation** — added MDO alert detection via `GET /api/ExecMdoAlertsList` (best-effort step s6; requires Defender for Office 365); filters to BEC/phishing-relevant signals; returns `mdoAlerts[]` (max 10) and `mdoAlertsCount`

## [1.1.6] - 2026-04-17

### Added

- **Workflows resource** — new 29th resource exposing 5 multi-step composite operations across both standard node and AI Tools node:
  - **License Audit** — combines license inventory, disabled/inactive users with licenses, and unused SKUs into a cost-saving report with seat waste and estimated monthly saving
  - **Security Posture** — scores tenant security (0–100) across MFA coverage, basic auth, conditional access policies, and Defender status
  - **BEC Investigation** — pulls sign-ins, mailbox forwarding rules, suspicious OAuth apps, and optional per-user BEC check; returns risk score and suspicious activity lists
  - **User 360** — aggregates user profile, group memberships, devices, mailbox details, MFA status, and last 10 sign-ins into a single snapshot
  - **Cross-Tenant Sweep** — runs licenseAudit, securityPosture, or becInvestigation across all managed tenants (up to 50, default 20)
- All composite operations support `failMode`: `bestEffort` (continue on step failures, return partial results) or `fast` (stop on first failure)

### Fixed

- **List Mailbox Rules** — defaulted to CIPP Report DB (cached, stale). Now fetches live Exchange Online data by default (`UseReportDB=true`). Toggle available in UI to opt into Report DB
- **List User Mailbox Rules** — endpoint requires `UserID`/`userEmail` but parameter was buried in an optional filters collection, so API silently returned nothing. Added top-level required `User ID or UPN` field
- **BEC Investigation composite** — smart routing: uses `ListUserMailboxRules` (targeted) when `userId` provided, falls back to tenant-wide `ListMailboxRules` with live pull otherwise
- **MFA field names** — corrected to match live API response: `MFARegistration` (bool), `PerUser` (string), `IsAdmin` (bool), `UPN` (string), `CoveredByCA` (string)
- **Duplicate User ID field** — removed `listUserMailboxRules` from the shared `userListFilters` collection display options; dedicated top-level field is now the sole User ID input for that operation

## [1.1.7] - 2026-04-17

### Fixed

- **BEC external forwarding rule detection** — fixed field lookup (`ForwardTo`/`ForwardAsAttachmentTo`/`RedirectTo` are top-level on the rule object, not nested under `Actions`); now correctly parses SMTP addresses from CIPP format strings (`"email@domain.com" [SMTP:email@domain.com]`); filters to external targets only; accumulates all three forwarding types per rule (no longer drops secondary types via early `break`); GUID tenantFilter no longer causes silent false-positives on external-domain check

## [1.1.8] - 2026-04-17

### Changed

- **Security Posture composite** — complete redesign for factual accuracy:
  - **BREAKING:** `result.score` removed. Read `result.gaps[]` for actionable findings and `result.indicators.*` for raw signals
  - `crossTenantSweep` consumers reading `results[tenant].result.score` are also affected — read `result.indicators` instead
  - Expanded from 4 to 8 API steps: anti-phishing, Safe Attachments, Safe Links, domain health (DMARC/DKIM/SPF) added
  - Conditional Access policy state filter added — disabled/report-only policies no longer counted as active controls
  - Defender status now threshold-based (`Active` ≥95% devices, `PartiallyActive` 1–94%, `Inactive` no devices) instead of any-device boolean
  - MFA coverage denominator now excludes disabled and guest accounts
  - `usersWithoutMfa[]` capped at 25 UPNs; `usersWithoutMfaTotal` added for true count
  - `basicAuthProtocols[]` replaces misleading `basicAuthUsersAffected` count
  - `gaps[]` plain-English findings array added (empty = clean tenant)

## [1.1.5] - 2026-04-02

### Fixed

- AI Tools `execute()` path now strips `Prompt__*` framework fields injected by Agent Tool Node v3 (`$fromAI()`-generated keys), preventing them from leaking into field validation and causing `INVALID_WRITE_FIELDS` errors on write operations

## [1.1.4] - 2026-04-02

### Fixed

- AI Tools `execute()` now returns a stub message on editor "Test step" instead of silently executing the first operation
- AI Tools `execute()` validates requested operation and returns `INVALID_OPERATION` error for unknown/disabled ops
- AI Tools `execute()` detects tool calls via `item.json.operation` (n8n 2.14+) or `item.json.tool` (older)
- Corrected write-safety layer comment numbering (Layer 3 for execute() path)

### Changed

- AI Tools runtime uses Proxy pattern for deferred errors — node registers even if LangChain unavailable
- AI Tools schema generator handles both Zod v3 and v4 internal structures for forward compatibility

### Removed

- Unused `MISSING_ENTITY_ID` error type (missing IDs already handled by `MISSING_REQUIRED_FIELD`)

## [1.1.3] - 2026-03-17

### Added

- **Tenant List Caching** — in-memory cache for the tenant dropdown (resourceLocator) to eliminate repeated `POST /api/ListTenants` calls on every interaction
  - Configurable via two new credential fields: `enableTenantCache` (boolean, default on) and `tenantCacheTtl` (minutes, default 30)
  - Mirrors the existing OAuth token cache pattern (module-level Map, TTL expiry, eviction, 401 invalidation)
  - Returns shallow copies to prevent cache mutation bugs
  - TTL field only shown when cache is enabled; range 1–1440 minutes

## [1.1.2] - 2026-03-17

### Added

- **CPV/Onboarding** — `refreshCpvPermissions`, `refreshCpvAll` → cippAdmin
- **Webhooks** — `managePartnerWebhook`, `listPendingWebhooks` → cippAdmin
- **Extension Alerts** — `listExtAlerts` → cippAdmin
- **Monitoring/Logs** — `getCippAlerts`, `listLogs` (12 filters), `listKnownIpDb` → cippCore
- **Reporting** — `listAdminPortalLicenses`, `listServicePrincipals` → tenant
- **Billing** — `triggerBillingRun` → scheduledItem
- **Directory** — `listUsersAndGroups` → user (combined users + groups snapshot per tenant)
- **Tenant Admin** — `runAccessChecks` → tenant (per-tenant CIPP access validation)

13 new endpoints across both standard node and AI Tools node. Coverage: ~87% → **~89%** (438/490 endpoints, 473 operations).

## [1.1.1] - 2026-03-17

### Changed

- Renamed "MSP Summary" output mode to "Summary" in Get Licenses

### Fixed

- **Get Licenses (Summary):** Licenses with missing/null renewal dates (e.g., non-NCE, developer) no longer show garbage `DaysUntilRenew` values or false "Critical" urgency — `RenewalDate` source-of-truth validation now nullifies derived fields when date is absent
- Added `N/A` renewal urgency for licenses without a renewal date and `Expired` for licenses past renewal

## [1.1.0] - 2026-03-17

### Added

- **CIPP Advanced AI Tools node** (`cippAdvancedAiTools`) — new companion node exposing all CIPP operations to n8n AI Agent and MCP Trigger
  - One unified tool per resource (28 tools) with `operation` enum field
  - Compatible with AI Agent (direct), MCP Trigger (direct), and MCP Trigger (queue mode)
  - 460 operations across 28 resources — 100% parity with the standard node
  - Data-driven operation registry (`ai-tools/registry/`) with one file per resource
  - Generic executor with per-operation parameter mapping, tenant field casing, and response unwrapping
  - `customExecutor` extension point for resources with non-standard API patterns (teamsShift Graph routing)
  - 3-layer write safety: `allowWriteOperations` toggle enforced in supplyData, func(), and execute()
  - Structured result envelopes (`wrapSuccess`/`wrapError`) with `nextAction` LLM self-correction guidance
  - Runtime class resolution via `createRequire()` — fixes `instanceof` across bundled module copies
  - Per-operation `defaults` for hardcoded API values (ClearCache, Enable, Type, AddExclusion, etc.)
  - Per-operation `responseUnwrap` for custom response wrapper paths
  - Per-operation safety text in descriptions (delete confirmation, create/update value confirmation)
  - Token-budgeted tool descriptions with automatic truncation for large resources
  - Shared constants (`N8N_METADATA_FIELDS`, `isWriteOperation`) — single source of truth across node + executor

### Changed

- `package.json`: version 1.0.4 → 1.1.0, added `zod` devDependency, registered AI Tools node in `n8n.nodes`
- `index.ts`: re-exports `CippAdvancedAiTools` class
- `CLAUDE.md`: updated architecture to two-node package, added AI Tools architecture docs and key gotchas

## [1.0.4] - 2026-03-16

### Added

- **Normalize Numeric Strings** option — global opt-in toggle that converts string values containing plain decimal numbers (e.g. `"4"`) to actual numbers in API responses

### Fixed

- **normalizeNumericValues**: Use strict regex to reject hex strings (`"0x1F"`), whitespace-only (`"  "`), and scientific notation — only plain decimals are converted
- **normalizeNumericValues**: Also normalize string numbers inside arrays of primitives (e.g. `["4", "5"]`)
- **voice**: Send `locationOnly` as string per OpenAPI spec (was boolean)

## [1.0.3] - 2026-03-16

### Fixed

- **application**: Use `selectedTenants` instead of `tenantFilter` for addStore, addChocolatey, addMsp, addOffice per OpenAPI spec
- **application**: Use lowercase `description` for addStore/addChocolatey per spec
- **application**: Use `CustomGroup` instead of `GroupNames` for addStore, addChocolatey, addMsp, addOffice per spec
- **voice**: Use `TenantFilter` (PascalCase), `input`, and `locationOnly` for assignNumber per spec

### Improved

- Bump minimum Node.js engine to >=20.15 (Node 18 is EOL)
- Add `endOfLine: 'lf'` to Prettier config
- Document AI agent compatibility (`usableAsTool`) in README

## [1.0.2] - 2026-03-16

### Fixed

- Renamed node file and directory to `CippAdvanced` to satisfy n8n filename convention lint rule
- Suppressed false-positive `no-http-request-with-manual-auth` lint error (Azure AD client-credentials flow requires manual token handling)
- Fixed sentence-case lint errors on Sherweb operation action strings

## [1.0.1] - 2026-03-16

### Fixed

- Removed legacy `.eslintrc.js` (conflicted with flat `eslint.config.mjs`)
- Aligned tsconfig with `@n8n/node-cli` template: `es2019` target, dropped `DOM` lib, removed `rootDir` and `index.ts` from include
- Added `typecheck`, `format`, `format:fix` scripts and `prepublishOnly` publish gate

## [1.0.0] - 2026-03-16

First public release of `n8n-nodes-cipp-advanced` — a comprehensive n8n community node for [CIPP.app](https://cipp.app) Microsoft 365 multi-tenant management.

> **Acknowledgement:** This project builds on the foundation of [`@joshuanode/n8n-nodes-cipp`](https://github.com/ajoshuasmith/n8n-nodes-cipp) by [Joshua Smith](https://github.com/ajoshuasmith). The codebase was substantially rewritten with a modularised architecture, full API alignment audit, and greatly expanded endpoint coverage.

### Added

- **License MSP Summary mode** — `Tenant > Get Licenses` now has an Output Mode dropdown (`Full` / `MSP Summary`). MSP Summary flattens each license into a single row with computed columns: `UnusedLicenses`, `UtilizationPct`, `RenewalUrgency` (Critical/Soon/Normal/Distant), `AssignedUserCount`, `AssignedGroupCount`, `AssignmentMethod` (Direct Only/Group Only/Mixed/Unassigned), and extracted `Term`/`DaysUntilRenew`/`RenewalDate`/`IsTrial` from TermInfo. Full mode returns the raw API response unchanged (backward-compatible default).

### Highlights

- **460 operations** across **28 resources** covering ~87% of the CIPP API surface
- Modularised action/description architecture for maintainability
- Full API alignment audit against the CIPP OpenAPI spec
- Azure AD OAuth2 client credentials authentication with in-memory token caching

### Resources & Operations

| Category | Resources | Total Ops |
|----------|-----------|-----------|
| **Identity Management** | User (50), Group (11), Contact (11), Identity (9) | 81 |
| **Email & Exchange** | Mailbox (46), Transport (20), Spamfilter (18), Safe Links (12), Exchange Resource (9), Quarantine (4) | 109 |
| **Security & Compliance** | Policy/Intune (32), Conditional Access (14), Alert (14), GDAP (13) | 73 |
| **Tenant Administration** | Tenant (33), Standard/BPA/Drift (23) | 56 |
| **Devices** | Autopilot (12), Device (10) | 22 |
| **Applications** | Application (24) | 24 |
| **Teams & SharePoint** | Teams Shift (28), Team (12), Voice (4) | 44 |
| **CIPP Platform** | CIPP Admin (19), CIPP Core (11), Tools (11), Scheduled Item (4), Backup (4), OneDrive (2) | 51 |

### Architecture

- `actions/router.ts` — maps resource string to handler module with compile-time `ResourceName` validation
- `actions/{resource}.ts` — 28 resource handlers, each exports `execute(context, operation, i)`
- `descriptions/{Resource}Description.ts` — 24 description files with shared helper builders
- `GenericFunctions.ts` — API helpers: OAuth2 token cache, `cippApiRequest`, `listWithSlice`, `postAction`, `buildOdataQuery`
- `types.ts` — 3 core interfaces: `ICippCredentials`, `IAuthToken`, `ITenant`

### User-Friendly Design

- Searchable tenant selector dropdown
- Multi-select field picker for Graph API properties
- Smart defaults to keep responses fast and small

### Hardening

- Token cache with `MAX_CACHE_SIZE` (50) and automatic expired-token eviction
- Credential validation helper with clear error messages
- Primitive response guard — wraps null/string/boolean API responses in objects
- Two-stage credential test: distinguishes "Authentication failed" from "API connection failed (token OK)"
- Manual-slice error guards in list operations

### Known Limitations

- **Teams Shift** (28 ops) and **Exec Graph Request** tool require a custom CIPP-API fork exposing `/api/ExecGraphRequest` — not part of the standard CIPP API
- ~54 CIPP API endpoints remain unimplemented (mostly admin/setup and testing endpoints)
- No automated test suite

# Changelog

All notable changes to `n8n-nodes-cipp-advanced` will be documented in this file.

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

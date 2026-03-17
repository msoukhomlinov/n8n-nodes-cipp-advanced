# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

n8n community node package (`n8n-nodes-cipp-advanced`) for [CIPP.app](https://cipp.app) — a Microsoft 365 multi-tenant management platform used by MSPs. Two nodes in one package:

1. **CIPP Advanced** (`cippAdvanced`) — Standard n8n node with UI-driven operations across 28 resources (~471 operations)
2. **CIPP Advanced AI Tools** (`cippAdvancedAiTools`) — AI Tools node exposing the same operations to n8n AI Agent and MCP Trigger (one tool per resource, ~431 operations via data-driven registry)

Coverage: ~436 of ~490 API endpoints (~89%).

**Origin:** Forked from [`@joshuanode/n8n-nodes-cipp`](https://github.com/ajoshuasmith/n8n-nodes-cipp), then substantially rewritten. Rebranded as `n8n-nodes-cipp-advanced` with node identity `cippAdvanced`.

**Status:** v1.1.0 Beta. Some operations depend on a custom CIPP-API fork (notably Teams Shift and ExecGraphRequest).

## Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TS + copy `.svg` assets to `dist/` |
| `npm run build:watch` | `tsc --watch` — incremental, no asset copy step |
| `npm run lint` | ESLint via `@n8n/node-cli` |
| `npm run lint:fix` | ESLint with `--fix` |
| `npm link` | Link for local n8n testing |

> Never edit `dist/` directly — it is fully regenerated on each build.

No test suite exists in this project.

## API Reference Docs

| File | Notes |
|------|-------|
| **`docs/openapi.json`** | **CIPP OpenAPI spec — USE THIS for endpoint shapes, field names, query params** |
| `docs/API Docs.url` | Shortcut to online CIPP OAS docs |

When checking CIPP endpoint shapes, field names, or query params, always open `docs/openapi.json` first.

## Architecture

Two-node package with one credential type (`CippAdvancedApi`):

1. **CippAdvanced** (node ID `cippAdvanced`) — Standard n8n node with UI-driven operations
2. **CippAdvancedAiTools** (node ID `cippAdvancedAiTools`) — AI Tools node for AI Agent + MCP Trigger

```
├── index.ts                          # Package entry point — re-exports both node classes + credential
├── credentials/
│   └── CippAdvancedApi.credentials.ts # Azure AD client credentials (baseUrl, tenantId, clientId, clientSecret)
├── nodes/CippAdvanced/
│   ├── CippAdvanced.node.ts          # Standard node class — description + thin router dispatch
│   ├── CippAdvancedAiTools.node.ts   # AI Tools node — supplyData() + execute() + loadOptions
│   ├── GenericFunctions.ts           # API helpers: OAuth2 token cache, cippApiRequest, JSON/endpoint helpers
│   ├── types.ts                      # TypeScript interfaces for all API param/response shapes
│   ├── actions/                      # One file per resource — operation logic (used by standard node)
│   │   ├── router.ts                 # Maps resource string → handler module
│   │   ├── tenant.ts, user.ts, ...   # 28 resource handlers, each exports execute(context, operation, i)
│   ├── descriptions/                 # One file per resource — UI field descriptors (standard node)
│   │   ├── index.ts                  # Aggregates all *Operations and *Fields arrays
│   │   ├── UserDescription.ts        # Example: exports userOperations + userFields
│   │   └── ... (24 resource files, some bundle multiple resources)
│   └── ai-tools/                     # AI Tools infrastructure (used by AI Tools node)
│       ├── runtime.ts                # Resolves DynamicStructuredTool + Zod from n8n's module tree
│       ├── error-formatter.ts        # wrapSuccess/wrapError envelope factories + ERROR_TYPES
│       ├── schema-generator.ts       # Generates Zod schemas dynamically from registry
│       ├── description-builders.ts   # LLM-optimised tool descriptions from registry
│       ├── tool-executor.ts          # Generic executor — maps registry ops to cippApiRequest calls
│       └── registry/                 # Data-driven operation definitions
│           ├── types.ts              # Shared interfaces (ResourceConfig, OperationDef, ParamDef, P helpers)
│           ├── index.ts              # Aggregates all 28 resources into RESOURCE_REGISTRY
│           └── {resource}.ts         # One file per resource — declarative operation definitions
└── docs/
    └── openapi.json                  # CIPP API OpenAPI spec — primary API reference
```

### AI Tools Node Architecture

The AI Tools node (`CippAdvancedAiTools`) exposes **one unified tool per resource** with an `operation` enum field, consumable by n8n's AI Agent node and MCP Trigger (including queue mode).

**Key design:**
- **Data-driven registry** — all 28 resources and ~420 operations defined declaratively in `ai-tools/registry/`
- **Generic executor** — `tool-executor.ts` reads from registry, maps flat tool params to body/qs, calls `cippApiRequest`
- **Runtime class resolution** — `runtime.ts` resolves `DynamicStructuredTool` and `Zod` from n8n's module tree via `createRequire()` (instanceof fix for bundled modules)
- **3-layer write safety** — `allowWriteOperations` toggle enforced in supplyData (schema filter), func() (MCP path), and execute() (AI Agent path)
- **Result envelopes** — structured success/error responses with `nextAction` guidance for LLM self-correction
- **Tenant field mapping** — registry encodes exact tenant field name and location per operation (handles `tenantFilter`, `TenantFilter`, `tenantfilter`, `tenantid`, `tenantID`, `selectedTenants`, `tenant`)
- **Tool names**: `cipp_{resource}` — complies with MCP regex `^[a-zA-Z0-9_-]{1,128}$`

### Description File Pattern

Each `descriptions/{Resource}Description.ts` exports two `INodeProperties[]` arrays:
1. `{resource}Operations` — operation dropdown, guarded by `displayOptions.show.resource: ['{resource}']`
2. `{resource}Fields` — parameter fields, guarded by both `resource` and `operation` display options

These are spread into `operationFields` and `resourceFields` in `descriptions/index.ts`, then injected into the node's `properties` array.

### Authentication Flow

Uses Azure AD OAuth2 client credentials flow (not n8n's built-in OAuth). Token is cached in-memory with a 5-minute expiry buffer in `GenericFunctions.ts`. The `cippApiRequest` function handles token refresh and HTTP error mapping (401/403/404/429).

### API Patterns

- Most CIPP list endpoints: `GET` with `tenantFilter` as a query parameter
- Write operations: `POST` to `/api/{ActionName}` with JSON body
- Teams Shift operations: route through `POST /api/ExecGraphRequest` (custom fork only)
- Response formats vary: raw arrays, `{ Results: [...] }`, or `{ value: [...] }` — handled by `listWithSlice` (with returnAll/limit) or direct `cippApiRequest`

## Key Gotchas

- **ExecGraphRequest requires custom CIPP-API fork** — Teams Shift resource and the "Exec Graph Request" tool both POST to `/api/ExecGraphRequest`, which is not in standard CIPP-API. Without this endpoint, those operations return 404/400.
- **Graph Request (Exec) has fallback** — tries `/api/ExecGraphRequest` first, falls back to `/api/GraphRequest`. The dedicated Teams Shift resource does **not** fall back.
- **`n8n-workflow` is a peer dependency** — never bundle it; import types only via `import type { ... } from 'n8n-workflow'`
- **SVG icons are handled natively** — `n8n-node build` copies `.svg` files automatically; no manual `cp` step needed
- **Tenant field casing varies per endpoint** — CIPP API uses `tenantFilter`, `TenantFilter`, `tenantfilter`, `tenantid`, `tenantID`, `selectedTenants`, `tenant`, or `customerId` depending on the endpoint. Always verify against `docs/openapi.json`.
- **`this.helpers.request()` deprecation** — suppressed with eslint-disable in credentials test (`httpRequest` not available in `ICredentialTestFunctions`)
- **AI Tools node uses `cippApiRequest` directly** — the AI Tools executor calls `cippApiRequest` with params built from the registry, bypassing the action handler files. Changes to action files do NOT automatically propagate to AI Tools — the registry must be updated separately.
- **AI Tools `zod` is a devDependency** — `import { z } from 'zod'` is a compile-time value import; at runtime, `runtime.ts` resolves Zod from n8n's module tree. The bundled zod is only used for type-checking during build.
- **AI Tools registry hardcoded values** — some operations send hardcoded API fields (e.g., `quarantine.release` sends `Type: 'Release'`, `tenant.clearCache` sends `ClearCache: 'true'`). These are defined in the registry as params or must be added to `tool-executor.ts` for special-case handling.

## Skills

| Skill | When to invoke |
|-------|---------------|
| `/n8n-add-ai-tools` | Adding AI Tools (LangChain) support to this node |

## Code Style

- Tabs, single quotes, trailing commas, semicolons, 100 char print width (`.prettierrc.js`)
- ESLint extends `@n8n/eslint-config/node` via flat config (`eslint.config.mjs`)
- TypeScript strict mode, target ES2022, CommonJS modules

---

## TODO-18 (Future): Remaining Unimplemented Endpoints (54 of ~490)

All endpoints below exist in `docs/openapi.json` but have no handler in any action file. Current coverage: **471 operations covering ~436/490 unique API endpoints (~89%)**.

> **Verified 2026-03-17:** All endpoints reviewed against OpenAPI spec for correct classification. Categories reflect actual MSP/IT integrator workflow automation usefulness, not just surface-level naming.

### Category A — MSP-Useful (9 endpoints — valuable for day-to-day MSP workflow automation)

| Method | Endpoint | Notes |
|--------|----------|-------|
| DELETE | `/api/ExecAppPermissionTemplate` | Delete app permission template (tenant app template management) |
| POST | `/api/ExecCloneTemplate` | Clone a template (template lifecycle automation) |
| POST | `/api/ExecEditTemplate` | Edit a template (template lifecycle automation) |
| POST | `/api/ListGraphBulkRequest` | Bulk Graph queries per tenant (powerful bulk data retrieval) |
| GET | `/api/ListHaloClients` | Halo PSA client listing (PSA integration/sync) |
| GET | `/api/ListUsersAndGroups` | Combined tenant directory snapshot (users + groups in one call) |
| POST | `/api/RemoveDeletedObject` | Permanently purge soft-deleted directory objects |

### Category B — Admin/Setup (33 endpoints — CIPP instance config, rarely automated)

| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/ExecAccessChecks` | Run CIPP access checks (per-tenant validation) |
| POST | `/api/ExecAddTrustedIP` | CIPP IP whitelist config |
| GET | `/api/ExecAPIPermissionList` | SuperAdmin SAM permission check |
| DELETE | `/api/ExecApiClient` | Delete an API client |
| GET | `/api/ExecAppInsightsQuery` | SuperAdmin CIPP infrastructure diagnostics |
| POST | `/api/ExecAzBobbyTables` | Azure table storage operations (SuperAdmin) |
| GET | `/api/ExecBackendURLs` | Get backend function URLs |
| GET | `/api/ExecCIPPDBCache` | Manage CIPP DB cache |
| DELETE | `/api/ExecCippReplacemap` | Delete CIPP replace map entry |
| DELETE | `/api/ExecCommunityRepo` | Remove community repo |
| GET | `/api/ExecCreateDefaultGroups` | Create default tenant groups (one-time setup) |
| POST | `/api/ExecCustomData` | Manage custom data mappings |
| DELETE | `/api/ExecCustomRole` | Delete custom RBAC role |
| DELETE | `/api/ExecDiagnosticsPresets` | Delete diagnostics preset (SuperAdmin) |
| POST | `/api/ExecFeatureFlag` | CIPP platform feature toggles |
| DELETE | `/api/ExecGraphExplorerPreset` | Delete Graph Explorer UI preset |
| GET | `/api/ExecMaintenanceScripts` | Run maintenance scripts |
| POST | `/api/ExecPartnerMode` | Set partner/tenant mode (one-time setup) |
| GET | `/api/ExecPermissionRepair` | Repair CIPP-SAM permissions |
| POST | `/api/ExecSAMAppPermissions` | Manage SAM app permissions |
| POST | `/api/ExecSAMRoles` | Manage SAM roles |
| POST | `/api/ExecUserSettings` | CIPP user preferences |
| DELETE | `/api/ExecWebhookSubscriptions` | Remove webhook subscriptions |
| GET | `/api/ListCommunityRepos` | CIPP GitHub extension repos |
| GET | `/api/ListCustomDataMappings` | CIPP data mapping config |
| GET | `/api/ListCustomRole` | CIPP RBAC role config |
| GET | `/api/ListCustomVariables` | CIPP variables config |
| GET | `/api/ListDBCache` | List DB cache entries |
| GET | `/api/ListDiagnosticsPresets` | SuperAdmin diagnostics presets |
| GET | `/api/ListFeatureFlags` | CIPP feature flag list |
| GET | `/api/ListGraphExplorerPresets` | CIPP UI presets |
| GET | `/api/ListIPWhitelist` | CIPP IP whitelist entries |
| GET | `/api/ListNotificationConfig` | CIPP notification config |

### Category C — Testing/Diagnostics (8 endpoints — CIPP test harness, unlikely needed in n8n)

| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/AddTestReport` | Add test report |
| GET | `/api/CIPPDBTestsRun` | Run DB tests |
| POST | `/api/DeleteTestReport` | Delete test report |
| POST | `/api/ExecTestRun` | Run tests for a tenant |
| GET | `/api/ListApiTest` | API test endpoint |
| GET | `/api/ListAvailableTests` | List available tests |
| GET | `/api/ListTestReports` | List test reports |
| POST | `/api/ListTests` | Run tests |

### Category D — Auth Flow / Server-Side Only (6 endpoints — unsuitable for n8n automation)

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/ExecDeviceCodeLogon` | Initiate device code auth flow — interactive |
| POST | `/api/ExecTokenExchange` | Token exchange for delegated access — internal |
| POST | `/api/ExecUpdateRefreshToken` | Update stored refresh token — internal |
| POST | `/api/PublicPhishingCheck` | Public phishing URL check — server-side |
| GET | `/api/PublicPing` | Health ping — server-side |
| POST | `/api/PublicWebhooks` | Inbound webhook receiver — server-side |

---

## Auto-Learning

Press **`#`** during a session to capture new learnings into this file.
Run `/claude-md-management:revise-claude-md` at the end of significant sessions.

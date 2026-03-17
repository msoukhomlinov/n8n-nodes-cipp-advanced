# n8n-nodes-cipp-advanced

[![npm version](https://badge.fury.io/js/n8n-nodes-cipp-advanced.svg)](https://www.npmjs.com/package/n8n-nodes-cipp-advanced)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Advanced n8n community node for [CIPP.app](https://cipp.app) — comprehensive Microsoft 365 multi-tenant management for MSPs.

![CIPP Node](https://img.shields.io/badge/n8n-Community%20Node-ff6d5a)
![npm](https://img.shields.io/npm/v/n8n-nodes-cipp-advanced?label=latest&color=brightgreen)

> **Acknowledgement:** This project builds on the foundation of [`@joshuanode/n8n-nodes-cipp`](https://github.com/ajoshuasmith/n8n-nodes-cipp) by [Joshua Smith](https://github.com/ajoshuasmith). The codebase was substantially rewritten with a modularised architecture, full API alignment audit against the CIPP OpenAPI spec, and expanded to **473 operations** across **28 resources** (~89% of the CIPP API surface).

## Features

**473 operations** across 28 resources covering:

- **Identity Management** — Users (51 ops), Groups (11), Contacts (11), Identity (9)
- **Email & Exchange** — Mailbox (46), Transport rules (20), Spam filters (18), Safe Links (12), Exchange Resources (9), Quarantine (4)
- **Security & Compliance** — Policies/Intune (32), Conditional Access (14), Alerts (14), GDAP (13)
- **Tenant Administration** — Tenants (34), Standards/BPA/Drift (23)
- **Devices** — Devices (10), Autopilot (12)
- **Apps** — Applications (24)
- **Teams & SharePoint** — Teams (12), Teams Shifts (28), Voice (4)
- **CIPP Platform** — Tools (11), CIPP Admin (24), CIPP Core (14), Scheduled Items (5), Backups (4), OneDrive (2)

### User-Friendly Design

- **Tenant Selector** — Searchable dropdown to select tenants by name
- **Tenant List Caching** — In-memory cache (default 30 min TTL) speeds up the tenant dropdown; configurable on/off and TTL in credential settings
- **Field Picker** — Multi-select for user properties (no need to memorise Graph API field names)
- **Smart Defaults** — Sensible default selections to keep responses fast and small
- **AI Agent Compatible** — Works as a tool in n8n AI agent workflows (`usableAsTool`)

## Installation

### n8n (Self-hosted)

```bash
npm install n8n-nodes-cipp-advanced
```

Or add to your n8n Docker container:

```bash
# In your Dockerfile
RUN npm install -g n8n-nodes-cipp-advanced
```

## Credentials Setup

1. **Create an Azure AD App Registration** for CIPP API access
2. Configure the following in n8n:
   - **CIPP Instance URL**: Your CIPP deployment URL (e.g., `https://cipp.yourdomain.com`)
   - **Azure AD Tenant ID**: The tenant where your CIPP app registration lives
   - **Application (Client) ID**: From your Azure AD app registration
   - **Client Secret**: Generated from your app registration
   - **Enable Tenant List Cache** (optional, default: on): Caches tenant list to speed up the dropdown
   - **Tenant Cache TTL** (optional, default: 30 min): How long to cache the tenant list (1–1440 minutes)

For detailed authentication setup, see the [CIPP API Documentation](https://docs.cipp.app/api-documentation/setup-and-authentication).

## Resources & Operations

| Resource | Ops | Key Operations |
|----------|-----|----------------|
| **User** | 51 | CRUD, edit (23 fields), guest/bulk add, BEC check, JIT admin, 9 detail lists, photo, licenses, users & groups snapshot |
| **Mailbox** | 46 | 9 list ops, permissions, settings, holds, archive, shared/mobile, message trace, EXO request, restore |
| **Tenant** | 36 | Details, edit, add/onboard/offboard, domains, service health, secure score, tenant groups, license MSP summary, admin portal licenses, service principals, access checks |
| **Policy** | 32 | Assignment filters, Intune templates/scripts/settings, Defender deployment, compliance lists |
| **Teams Shift** | 28 | Shifts, open shifts, scheduling groups, time-off, swap/offer requests (requires custom CIPP-API fork) |
| **Application** | 24 | WinGet/Store/Choco/MSP/Office/Win32 apps, VPP sync, app approval, multi-tenant apps |
| **Standard** | 23 | Standards, BPA, domain analyser, drift, run/convert, templates |
| **Transport** | 20 | Transport rules/templates, Exchange connectors/templates, connection filters |
| **CIPP Admin** | 24 | Settings, setup, extensions config/sync/test, CPV permissions/refresh, webhooks, ext alerts |
| **Spamfilter** | 18 | Spam filters/templates, quarantine policies, allow/block lists |
| **Conditional Access** | 14 | CA policies/templates, named locations, exclusions, policy check |
| **Alert** | 14 | Security alerts/incidents, audit log, MDO alerts, webhooks |
| **GDAP** | 13 | Access assignments, invites, roles, auto-extend, trace |
| **Autopilot** | 12 | Devices, configs, enrollment, rename, group tags |
| **Safe Links** | 12 | Policies/templates, deployment |
| **Team** | 12 | Teams, SharePoint sites/quota/settings/admin |
| **Group** | 11 | CRUD, templates, Teams conversion, sender auth |
| **CIPP Core** | 14 | Diagnostics, functions, GitHub actions, version, alerts, logs, known IPs |
| **Tools** | 11 | Breach search, Graph requests, GeoIP, universal search, compliance |
| **Contact** | 11 | Contacts/templates, deploy, permissions |
| **Device** | 10 | List, manage, actions, LAPS/recovery, detected apps |
| **Exchange Resource** | 9 | Rooms, room lists, equipment |
| **Identity** | 9 | Audit logs, deleted items, roles, Azure AD Connect, directory objects |
| **Voice** | 4 | Phone numbers, locations, assign/unassign |
| **Scheduled Item** | 5 | Add, list, remove, details, trigger billing run |
| **Backup** | 4 | List, run, restore, auto-backup |
| **Quarantine** | 4 | List, release, deny, get many |
| **OneDrive** | 2 | Provision, add shortcut |

## Example Usage

### List All Tenants

```
Resource: Tenant
Operation: Get Many
Return All: true
```

### List Users with Sign-In Activity

```
Resource: User
Operation: Get Many
Tenant: Select from dropdown
Fields to Return: Display Name, User Principal Name, Mail, Sign-In Activity
Return All: true
```

### License Utilisation Report (MSP Summary)

```
Resource: Tenant
Operation: Get Licenses
Tenant: Select from dropdown
Output Mode: MSP Summary
Return All: true
```

> Returns one flat row per license with `UtilizationPct`, `RenewalUrgency`, `AssignmentMethod`, and other computed metrics — ideal for dashboards and alerting workflows.

### Custom Graph Request

```
Resource: Tools
Operation: Graph Request (List)
Tenant: Select from dropdown
Endpoint: users
$select: id,displayName,userPrincipalName
$filter: startsWith(displayName,'John')
```

### Teams Shifts

```
Resource: Teams Shift
Operation: List Shifts
Tenant: Select from dropdown
Team ID: <team-guid>
```

> **CIPP-API Requirement**: The Teams Shift resource and the Exec Graph Request tool both use `POST /api/ExecGraphRequest`, which is **not part of the standard CIPP API**. You must be running a custom fork of [CIPP-API](https://github.com/KelvinTegelaar/CIPP-API) that exposes the `ExecGraphRequest` endpoint.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Lint
npm run lint

# Link for local testing
npm link
```

## Acknowledgements

This project builds on the foundation of [`@joshuanode/n8n-nodes-cipp`](https://github.com/ajoshuasmith/n8n-nodes-cipp) by [Joshua Smith](https://github.com/ajoshuasmith), who created the original CIPP n8n integration.

## Links

- [CIPP.app](https://cipp.app)
- [CIPP Documentation](https://docs.cipp.app)
- [CIPP API Endpoints](https://docs.cipp.app/api-documentation/endpoints/)
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)
- [Original n8n-nodes-cipp](https://github.com/ajoshuasmith/n8n-nodes-cipp)

## License

MIT - see [LICENSE](LICENSE) for details.

# Tenant Lookup Caching Design

**Date:** 2026-03-17
**Status:** Draft
**Scope:** 3 files modified, 0 new files

## Problem

The tenant dropdown (resourceLocator) in the standard CIPP Advanced node calls `POST /api/ListTenants` on every interaction — opening the dropdown, typing to search, etc. This makes the UI feel slow, especially for MSPs with many tenants.

## Solution

Add an in-memory tenant list cache to `GenericFunctions.ts`, mirroring the existing OAuth token cache pattern. Cache is configurable via credential fields (on/off toggle + TTL in minutes).

## Design

### Credential Fields (CippAdvancedApi.credentials.ts)

Two new fields appended after `clientSecret`:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `enableTenantCache` | boolean | `true` | Toggle tenant list caching on/off |
| `tenantCacheTtl` | number (minutes) | `30` | TTL for cached tenant list. `typeOptions: { minValue: 1, maxValue: 1440 }`. Only shown when `enableTenantCache` is true via `displayOptions.show` |

The `tenantCacheTtl` field description should note that newly onboarded tenants won't appear in the dropdown until the cache expires or n8n is restarted.

### Cache Structure (GenericFunctions.ts)

New module-level Map alongside existing `tokenCache`:

```typescript
interface ITenantCacheEntry {
  tenants: ITenant[];
  expiresAt: number;
}

const tenantCache = new Map<string, ITenantCacheEntry>();
const MAX_TENANT_CACHE_SIZE = 50;
```

**Cache key:** `${credentials.clientId}:${credentials.tenantId}` — same format as token cache (via `getCacheKey()`), unique per CIPP instance.

**Eviction function:** `evictExpiredTenantEntries()` — mirrors existing `evictExpiredTokens()`. Iterates the Map, deletes entries where `expiresAt < Date.now()`. Called before inserting a new entry when cache is at `MAX_TENANT_CACHE_SIZE`.

**Multi-worker note:** In n8n queue mode with multiple workers (separate processes), each worker maintains its own in-memory cache. This is expected and desirable — no shared state complexity.

### getTenantList() Changes

The function must now call `this.getCredentials('cippAdvancedApi')` directly to read cache settings. Currently it only delegates to `cippApiRequest()` which handles credentials internally.

Updated flow:

1. Call `this.getCredentials('cippAdvancedApi')` and pass through `validateCredentials()` to get typed credentials including cache settings
2. Generate cache key via `getCacheKey(credentials)`
3. If `enableTenantCache` is true and cache contains a valid (non-expired) entry → return cached tenants
4. Otherwise, call `POST /api/ListTenants` via `cippApiRequest` as today
5. If `enableTenantCache` is true, store result in cache with `expiresAt = Date.now() + (ttlMinutes * 60000)`
6. Return tenants

### Cache Clearing

| Trigger | Mechanism |
|---------|-----------|
| TTL expiry | Natural — checked on each `getTenantList()` call |
| API auth error (401) | Explicit — clear tenant cache entry in `cippApiRequest` error handler alongside existing token cache clear |
| n8n restart | Natural — in-memory Map is cleared |
| Cache disabled | `getTenantList()` skips cache lookup/storage when `enableTenantCache` is false |

**Note:** 403 errors do NOT clear the tenant cache — a 403 indicates a permissions issue, not stale tenant data. Only 401 (auth failure) triggers cache invalidation, consistent with the token cache behavior.

### Type Changes (types.ts)

- Add `ITenantCacheEntry` interface
- Update `ICippCredentials` to include optional fields: `enableTenantCache?: boolean` and `tenantCacheTtl?: number`
- Update `validateCredentials()` in `GenericFunctions.ts` to extract and return the new fields (with defaults: `enableTenantCache = true`, `tenantCacheTtl = 30`)

### Integration

- **`tenantSearch()`** in `CippAdvanced.node.ts` — unchanged, calls `getTenantList()` as before, gets caching transparently
- **`CippAdvancedAiTools.node.ts`** — unaffected, does not use `getTenantList()`
- **Action files, descriptions, registry** — all untouched

## Files Changed

| File | Change |
|------|--------|
| `credentials/CippAdvancedApi.credentials.ts` | Add `enableTenantCache` and `tenantCacheTtl` fields |
| `nodes/CippAdvanced/GenericFunctions.ts` | Add `tenantCache` Map + `evictExpiredTenantEntries()`, update `getTenantList()` with cache logic, clear tenant cache on 401, update `validateCredentials()` for new fields |
| `nodes/CippAdvanced/types.ts` | Add `ITenantCacheEntry` interface, update `ICippCredentials` with optional cache fields |

## Out of Scope

- AI Tools node changes (doesn't use tenant lookup)
- Caching other API responses (can be added later using same pattern)
- Persistent/Redis-backed cache (not available in `ILoadOptionsFunctions` context)
- Explicit "Clear Cache" button in UI (auto-clear on TTL/errors/restart is sufficient)

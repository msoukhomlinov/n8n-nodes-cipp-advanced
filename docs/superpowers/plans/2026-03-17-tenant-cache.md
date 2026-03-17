# Tenant Lookup Caching Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache the tenant list in memory so the tenant dropdown (resourceLocator) doesn't call the CIPP API on every interaction.

**Architecture:** Module-level `Map<string, ITenantCacheEntry>` in `GenericFunctions.ts` alongside the existing token cache. Configurable via two credential fields (enable toggle + TTL minutes). `getTenantList()` checks cache before calling API.

**Tech Stack:** TypeScript, n8n credential/node APIs

**Spec:** `docs/superpowers/specs/2026-03-17-tenant-cache-design.md`

---

### Task 1: Update types (types.ts)

**Files:**
- Modify: `nodes/CippAdvanced/types.ts:1-18`

- [ ] **Step 1: Add `ITenantCacheEntry` interface and update `ICippCredentials`**

Add the cache entry interface after `ITenant`, and add optional cache fields to `ICippCredentials`:

```typescript
// In types.ts, replace the entire file content with:

export interface ICippCredentials {
	baseUrl: string;
	tenantId: string;
	clientId: string;
	clientSecret: string;
	enableTenantCache?: boolean;
	tenantCacheTtl?: number;
}

export interface IAuthToken {
	accessToken: string;
	expiresAt: number;
}

export interface ITenant {
	customerId: string;
	defaultDomainName?: string;
	displayName?: string;
	domains?: string[];
}

export interface ITenantCacheEntry {
	tenants: ITenant[];
	expiresAt: number;
}
```

- [ ] **Step 2: Build to verify no type errors**

Run: `npm run build`
Expected: Clean compilation with no errors.

- [ ] **Step 3: Commit**

```bash
git add nodes/CippAdvanced/types.ts
git commit -m "feat: add ITenantCacheEntry interface and cache fields to ICippCredentials"
```

---

### Task 2: Add credential fields (CippAdvancedApi.credentials.ts)

**Files:**
- Modify: `credentials/CippAdvancedApi.credentials.ts:9-46`

- [ ] **Step 1: Add `enableTenantCache` and `tenantCacheTtl` fields**

Append two new entries to the `properties` array after the `clientSecret` field (after line 45, before the closing `];`):

```typescript
		{
			displayName: 'Enable Tenant List Cache',
			name: 'enableTenantCache',
			type: 'boolean',
			default: true,
			description:
				'Cache the tenant list to speed up the tenant dropdown. Disable if you need real-time tenant list updates.',
		},
		{
			displayName: 'Tenant Cache TTL (Minutes)',
			name: 'tenantCacheTtl',
			type: 'number',
			typeOptions: { minValue: 1, maxValue: 1440 },
			default: 30,
			displayOptions: {
				show: {
					enableTenantCache: [true],
				},
			},
			description:
				'How long to cache the tenant list in minutes. Newly onboarded tenants won\'t appear in the dropdown until the cache expires or n8n is restarted.',
		},
```

- [ ] **Step 2: Build to verify no errors**

Run: `npm run build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add credentials/CippAdvancedApi.credentials.ts
git commit -m "feat: add tenant cache toggle and TTL fields to CIPP credentials"
```

---

### Task 3: Implement tenant cache in GenericFunctions.ts

**Files:**
- Modify: `nodes/CippAdvanced/GenericFunctions.ts:14-42` (imports, validateCredentials, cache infrastructure)
- Modify: `nodes/CippAdvanced/GenericFunctions.ts:166-185` (401 error handler in cippApiRequest)
- Modify: `nodes/CippAdvanced/GenericFunctions.ts:222-238` (getTenantList)

This is the core task. Three changes in one file.

- [ ] **Step 1: Update import to include `ITenantCacheEntry`**

At line 14, update the import:

```typescript
// Old:
import type { IAuthToken, ICippCredentials, ITenant } from './types';

// New:
import type { IAuthToken, ICippCredentials, ITenant, ITenantCacheEntry } from './types';
```

- [ ] **Step 2: Update `validateCredentials()` to extract cache fields**

Replace the `validateCredentials` function (lines 16-25):

```typescript
// Old:
function validateCredentials(creds: IDataObject): ICippCredentials {
	const baseUrl = creds.baseUrl as string;
	const tenantId = creds.tenantId as string;
	const clientId = creds.clientId as string;
	const clientSecret = creds.clientSecret as string;
	if (!baseUrl || !tenantId || !clientId || !clientSecret) {
		throw new Error('Missing required CIPP API credentials (baseUrl, tenantId, clientId, clientSecret)');
	}
	return { baseUrl, tenantId, clientId, clientSecret };
}

// New:
function validateCredentials(creds: IDataObject): ICippCredentials {
	const baseUrl = creds.baseUrl as string;
	const tenantId = creds.tenantId as string;
	const clientId = creds.clientId as string;
	const clientSecret = creds.clientSecret as string;
	if (!baseUrl || !tenantId || !clientId || !clientSecret) {
		throw new Error('Missing required CIPP API credentials (baseUrl, tenantId, clientId, clientSecret)');
	}
	const enableTenantCache = creds.enableTenantCache !== false;
	const tenantCacheTtl = typeof creds.tenantCacheTtl === 'number' ? creds.tenantCacheTtl : 30;
	return { baseUrl, tenantId, clientId, clientSecret, enableTenantCache, tenantCacheTtl };
}
```

- [ ] **Step 3: Add tenant cache Map and eviction function**

Insert immediately after the existing `evictExpiredTokens()` function (after line 38, before `getCacheKey`). Preserve the blank line separator before the new block:

```typescript

// Tenant list cache to avoid repeated ListTenants calls in the dropdown
const tenantCache = new Map<string, ITenantCacheEntry>();
const MAX_TENANT_CACHE_SIZE = 50;

function evictExpiredTenantEntries(): void {
	const now = Date.now();
	for (const [key, entry] of tenantCache) {
		if (entry.expiresAt <= now) {
			tenantCache.delete(key);
		}
	}
}
```

- [ ] **Step 4: Add tenant cache clear to 401 error handler in `cippApiRequest`**

In the 401 handler block (around line 177-185), replace the single `tokenCache.delete` call with a variable + two deletes. Show the full `if` block for context:

```typescript
// Old:
		if (statusCode === 401) {
			// Clear token cache on auth failure
			tokenCache.delete(getCacheKey(credentials));
			throw new NodeApiError(this.getNode(), errorResponse, {
				message: 'Authentication failed',
				description:
					'Your access token has expired or is invalid. Check your CIPP API credentials.',
			});
		}

// New:
		if (statusCode === 401) {
			// Clear token + tenant cache on auth failure
			const cacheKey = getCacheKey(credentials);
			tokenCache.delete(cacheKey);
			tenantCache.delete(cacheKey);
			throw new NodeApiError(this.getNode(), errorResponse, {
				message: 'Authentication failed',
				description:
					'Your access token has expired or is invalid. Check your CIPP API credentials.',
			});
		}
```

- [ ] **Step 5: Rewrite `getTenantList()` with cache logic**

Replace the entire `getTenantList` function (lines 222-238):

```typescript
// Old:
export async function getTenantList(
	this: IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions,
): Promise<ITenant[]> {
	const response = await cippApiRequest.call(this, 'POST', '/api/ListTenants', {}, {});

	if (Array.isArray(response)) {
		return response as unknown as ITenant[];
	}

	if (response.Results && Array.isArray(response.Results)) {
		return response.Results as ITenant[];
	}

	return [];
}

// New:
export async function getTenantList(
	this: IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions,
): Promise<ITenant[]> {
	const credentials = validateCredentials(await this.getCredentials('cippAdvancedApi'));
	const cacheKey = getCacheKey(credentials);

	// Check cache if enabled
	if (credentials.enableTenantCache) {
		const cached = tenantCache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.tenants;
		}
	}

	// Fetch fresh from API
	const response = await cippApiRequest.call(this, 'POST', '/api/ListTenants', {}, {});

	let tenants: ITenant[];
	if (Array.isArray(response)) {
		tenants = response as unknown as ITenant[];
	} else if (response.Results && Array.isArray(response.Results)) {
		tenants = response.Results as ITenant[];
	} else {
		tenants = [];
	}

	// Store in cache if enabled
	if (credentials.enableTenantCache) {
		const ttlMs = (credentials.tenantCacheTtl ?? 30) * 60000;
		if (tenantCache.size >= MAX_TENANT_CACHE_SIZE) {
			evictExpiredTenantEntries();
			if (tenantCache.size >= MAX_TENANT_CACHE_SIZE) {
				const firstKey = tenantCache.keys().next().value;
				if (firstKey !== undefined) tenantCache.delete(firstKey);
			}
		}
		tenantCache.set(cacheKey, { tenants, expiresAt: Date.now() + ttlMs });
	}

	return tenants;
}
```

- [ ] **Step 6: Build to verify everything compiles**

Run: `npm run build`
Expected: Clean compilation with no errors.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: No new lint errors. If any, fix with `npm run lint:fix`.

- [ ] **Step 8: Commit**

```bash
git add nodes/CippAdvanced/GenericFunctions.ts
git commit -m "feat: implement tenant list caching with configurable TTL

Adds in-memory tenant cache alongside existing token cache.
Cache is controlled by credential fields (enableTenantCache, tenantCacheTtl).
Auto-clears on 401 errors and natural TTL expiry."
```

---

### Task 4: Verification

**Files:** None (testing only)

- [ ] **Step 1: Full clean build**

Run: `npm run build`
Expected: Clean compilation, no errors.

- [ ] **Step 2: Lint check**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Verify no unintended changes**

Run: `git diff HEAD~3 --stat`
Expected: Only these 3 files changed:
- `credentials/CippAdvancedApi.credentials.ts`
- `nodes/CippAdvanced/GenericFunctions.ts`
- `nodes/CippAdvanced/types.ts`

- [ ] **Step 4: Spot-check that `tenantSearch()` in CippAdvanced.node.ts is unchanged**

Read `nodes/CippAdvanced/CippAdvanced.node.ts` and confirm the `tenantSearch` method still calls `getTenantList()` with no changes — caching is transparent.

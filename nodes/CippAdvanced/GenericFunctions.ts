import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	JsonObject,
} from 'n8n-workflow';

import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import type { IAuthToken, ICippCredentials, ITenant, ITenantCacheEntry } from './types';

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

// Token cache to avoid repeated authentication calls
const tokenCache = new Map<string, IAuthToken>();
const MAX_CACHE_SIZE = 50;

function evictExpiredTokens(): void {
	const now = Date.now();
	for (const [key, token] of tokenCache) {
		if (token.expiresAt <= now) {
			tokenCache.delete(key);
		}
	}
}

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

function getCacheKey(credentials: ICippCredentials): string {
	return `${credentials.clientId}:${credentials.tenantId}`;
}

/**
 * Normalizes and joins URL parts
 */
function joinUrl(baseUrl: string, endpoint: string): string {
	const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
	const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
	return `${normalizedBase}${normalizedEndpoint}`;
}

/**
 * Gets OAuth2 access token from Azure AD using client credentials flow
 */
export async function getAccessToken(
	this: IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions,
	credentials: ICippCredentials,
): Promise<string> {
	const cacheKey = getCacheKey(credentials);
	const cached = tokenCache.get(cacheKey);

	// Return cached token if still valid (with 5-minute buffer)
	if (cached && cached.expiresAt > Date.now() + 300000) {
		return cached.accessToken;
	}

	const tokenUrl = `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`;
	const scope = `api://${credentials.clientId}/.default`;

	const body = `grant_type=client_credentials&client_id=${encodeURIComponent(credentials.clientId)}&client_secret=${encodeURIComponent(credentials.clientSecret)}&scope=${encodeURIComponent(scope)}`;

	const options: IHttpRequestOptions = {
		method: 'POST',
		url: tokenUrl,
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body,
		json: true,
	};

	try {
		const response = (await this.helpers.httpRequest(options)) as IDataObject;

		if (!response.access_token) {
			throw new NodeOperationError(this.getNode(), 'No access token in response');
		}

		const expiresIn = Number(response.expires_in) || 3600;
		const authToken: IAuthToken = {
			accessToken: response.access_token as string,
			expiresAt: Date.now() + expiresIn * 1000,
		};

		if (tokenCache.size >= MAX_CACHE_SIZE) {
			evictExpiredTokens();
			if (tokenCache.size >= MAX_CACHE_SIZE) {
				const firstKey = tokenCache.keys().next().value;
				if (firstKey !== undefined) tokenCache.delete(firstKey);
			}
		}
		tokenCache.set(cacheKey, authToken);
		return authToken.accessToken;
	} catch (error) {
		const err = error as IDataObject;
		const errorResponse = (error || {}) as JsonObject;

		// Clear cache on auth failure
		tokenCache.delete(cacheKey);

		throw new NodeApiError(this.getNode(), errorResponse, {
			message: 'Failed to authenticate with CIPP',
			description:
				(err.error_description as string) ||
				(err.message as string) ||
				'Check your Azure AD credentials and ensure the app registration is configured correctly',
		});
	}
}

/**
 * Makes an authenticated request to the CIPP API
 */
export async function cippApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	query: IDataObject = {},
): Promise<IDataObject | IDataObject[]> {
	const credentials = validateCredentials(await this.getCredentials('cippAdvancedApi'));

	// Normalize base URL
	const baseUrl = credentials.baseUrl.replace(/\/$/, '');
	const accessToken = await getAccessToken.call(this, credentials);

	const url = joinUrl(baseUrl, endpoint);

	const options: IHttpRequestOptions = {
		method,
		url,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/json',
			'Content-Type': 'application/json',
		},
		qs: query,
		json: true,
	};

	if (Object.keys(body).length > 0) {
		options.body = body;
	}

	try {
		// eslint-disable-next-line @n8n/community-nodes/no-http-request-with-manual-auth -- Azure AD client-credentials OAuth2 with in-memory token cache; httpRequestWithAuthentication does not support this flow
		const response = await this.helpers.httpRequest(options);
		if (response === null || response === undefined) {
			return {} as IDataObject;
		}
		if (typeof response === 'string' || typeof response === 'number' || typeof response === 'boolean') {
			return { result: response } as IDataObject;
		}
		return response as IDataObject | IDataObject[];
	} catch (error: unknown) {
		const errorResponse = (error || {}) as JsonObject;
		const err = error as {
			statusCode?: number;
			response?: { headers?: IDataObject; status?: number; statusCode?: number };
			error?: { message?: string; error_description?: string };
			message?: string;
		};

		const statusCode = err.statusCode || err.response?.status || err.response?.statusCode;

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

		if (statusCode === 403) {
			throw new NodeApiError(this.getNode(), errorResponse, {
				message: 'Permission denied',
				description:
					'Your API client does not have permission to perform this action. Check your CIPP API client role.',
			});
		}

		if (statusCode === 404) {
			throw new NodeApiError(this.getNode(), errorResponse, {
				message: 'Resource not found',
				description:
					err.error?.message ||
					'The requested resource does not exist. Check your tenant filter and IDs.',
			});
		}

		if (statusCode === 429) {
			throw new NodeApiError(this.getNode(), errorResponse, {
				message: 'Rate limit exceeded',
				description: 'Too many requests. Please wait before retrying.',
			});
		}

		const errorMessage =
			err.error?.message || err.error?.error_description || err.message || 'Unknown error';

		throw new NodeApiError(this.getNode(), errorResponse, {
			message: `CIPP API Error (Status ${statusCode || 'Unknown'})`,
			description: errorMessage,
		});
	}
}

/**
 * Fetches the list of tenants from CIPP
 */
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

/**
 * Helper to get a resource locator value (handles both list and id modes)
 */
export function getResourceLocatorValue(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}

	if (value && typeof value === 'object') {
		const locator = value as { mode: string; value: string };
		return locator.value || '';
	}

	if (value === undefined || value === null || value === '') {
		return '';
	}

	throw new Error(`Unexpected tenant filter type: ${typeof value}`);
}

/**
 * Extracts the tenant filter from the resource locator parameter, returning '' if not set.
 * Uses getNodeParameter default to safely return '' when the parameter is not registered
 * for the current operation, while still surfacing real errors (bad types, corrupt state).
 */
export function getTenantFilter(context: IExecuteFunctions, i: number): string {
	const tenantValue = context.getNodeParameter('tenantFilter', i, '') as IDataObject | string;
	return getResourceLocatorValue(tenantValue);
}

/**
 * Strips Graph API URL prefixes and leading slashes from an endpoint string.
 */
export function normalizeGraphEndpoint(endpoint: string): string {
	return endpoint
		.trim()
		.replace(/^https?:\/\/graph\.microsoft\.com\/(?:v1\.0|beta)\//i, '')
		.replace(/^(?:v1\.0|beta)\//i, '')
		.replace(/^\/+/, '');
}

/**
 * Parses a value as JSON, returning an IDataObject or IDataObject[].
 * Throws a friendly NodeOperationError on invalid input.
 */
export function parseJsonPayload(
	node: INode,
	value: unknown,
	fieldName: string,
	itemIndex: number,
): IDataObject | IDataObject[] {
	if (value === undefined || value === null || value === '') {
		return {};
	}

	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value) as unknown;

			if (Array.isArray(parsed) || (parsed !== null && typeof parsed === 'object')) {
				return parsed as IDataObject | IDataObject[];
			}
		} catch {
			// fall through to throw below
		}

		throw new NodeOperationError(node, `${fieldName} must be valid JSON (object or array).`, {
			itemIndex,
		});
	}

	if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
		return value as IDataObject | IDataObject[];
	}

	throw new NodeOperationError(node, `${fieldName} must be a JSON object or array.`, {
		itemIndex,
	});
}

/**
 * Like parseJsonPayload but enforces the result is an object (not array).
 */
export function parseJsonObjectPayload(
	node: INode,
	value: unknown,
	fieldName: string,
	itemIndex: number,
): IDataObject {
	const parsed = parseJsonPayload(node, value, fieldName, itemIndex);

	if (Array.isArray(parsed)) {
		throw new NodeOperationError(node, `${fieldName} must be a JSON object.`, {
			itemIndex,
		});
	}

	return parsed;
}

/**
 * Returns true if the payload (object or array) has content.
 */
export function hasPayloadContent(payload: IDataObject | IDataObject[]): boolean {
	return Array.isArray(payload) ? payload.length > 0 : Object.keys(payload).length > 0;
}

/**
 * Returns true if the endpoint matches the Teams schedule path pattern.
 */
export function isTeamsScheduleEndpoint(endpoint: string): boolean {
	return /^teams\/[^/]+\/schedule(?:\/.*)?$/i.test(endpoint);
}

/**
 * Lists items from a CIPP endpoint, applying returnAll/limit slicing.
 * Replaces the common pattern of: call API → check returnAll → slice to limit.
 */
export async function listWithSlice(
	context: IExecuteFunctions,
	i: number,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
): Promise<IDataObject | IDataObject[]> {
	const returnAll = context.getNodeParameter('returnAll', i) as boolean;
	let responseData = await cippApiRequest.call(context, method, endpoint, body, qs);

	// Unwrap common CIPP response wrappers to get the underlying array
	if (!Array.isArray(responseData) && responseData !== null && typeof responseData === 'object') {
		if (Array.isArray(responseData.Results)) {
			responseData = responseData.Results as IDataObject[];
		} else if (Array.isArray(responseData.value)) {
			responseData = responseData.value as IDataObject[];
		}
	}

	if (Array.isArray(responseData) && !returnAll) {
		const limit = context.getNodeParameter('limit', i) as number;
		responseData = responseData.slice(0, limit);
	}
	return responseData;
}

/**
 * Executes a POST action against a CIPP endpoint, automatically reading
 * tenantFilter and merging it into the body.
 */
export async function postAction(
	context: IExecuteFunctions,
	i: number,
	endpoint: string,
	body: IDataObject = {},
): Promise<IDataObject | IDataObject[]> {
	const tenantFilter = getTenantFilter(context, i);
	return cippApiRequest.call(context, 'POST', endpoint, { tenantFilter, ...body }, {});
}

/**
 * Returns true if the string is a plain decimal number (integer or float, optional sign).
 * Rejects hex, octal, whitespace-only, empty, and scientific notation strings.
 */
const NUMERIC_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function isNumericString(value: string): boolean {
	return NUMERIC_PATTERN.test(value);
}

/**
 * Converts a string to a number if it passes isNumericString, otherwise returns it unchanged.
 */
function coerceNumeric(value: string): string | number {
	return isNumericString(value) ? Number(value) : value;
}

/**
 * Recursively converts string values that are plain decimal numbers into actual numbers.
 * Handles nested objects and arrays. Leaves empty strings, hex, whitespace-only,
 * booleans, dates, and UUIDs unchanged.
 */
export function normalizeNumericValues(
	data: IDataObject | IDataObject[],
): IDataObject | IDataObject[] {
	if (Array.isArray(data)) {
		return data.map((item) => normalizeNumericValues(item) as IDataObject);
	}
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(data)) {
		if (typeof value === 'string') {
			result[key] = coerceNumeric(value);
		} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			result[key] = normalizeNumericValues(value as IDataObject) as IDataObject;
		} else if (Array.isArray(value)) {
			result[key] = value.map((item) => {
				if (typeof item === 'object' && item !== null) {
					return normalizeNumericValues(item as IDataObject);
				}
				if (typeof item === 'string') {
					return coerceNumeric(item);
				}
				return item;
			});
		} else {
			result[key] = value;
		}
	}
	return result;
}

/**
 * Builds an OData-style query string from base params and OData options.
 */
export function buildOdataQuery(
	baseQs: IDataObject,
	params: { select?: string | string[]; filter?: string; top?: number; orderby?: string },
): IDataObject {
	const qs = { ...baseQs };
	if (params.select) {
		const parts = Array.isArray(params.select) ? params.select : [params.select];
		const joined = parts.filter(Boolean).join(',');
		if (joined) qs.$select = joined;
	}
	if (params.filter) qs.$filter = params.filter;
	if (params.top) qs.$top = params.top;
	if (params.orderby) qs.$orderby = params.orderby;
	return qs;
}

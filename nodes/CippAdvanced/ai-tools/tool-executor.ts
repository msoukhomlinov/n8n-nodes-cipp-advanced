// ai-tools/tool-executor.ts
// Generic executor — reads from operation registry and calls cippApiRequest.
// Resources with non-standard API patterns provide a customExecutor in their registry config.
import type { ISupplyDataFunctions, IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { wrapSuccess, wrapError, ERROR_TYPES, formatApiError } from './error-formatter';
import { RESOURCE_REGISTRY } from './registry';
import { N8N_METADATA_FIELDS } from './registry/types';
import { cippApiRequest } from '../GenericFunctions';

const N8N_METADATA_PREFIXES = ['Prompt__'];

/**
 * Execute a CIPP AI tool operation using the registry.
 * Called from both func() (MCP Trigger path) and execute() (AI Agent path).
 */
export async function executeAiTool(
	context: ISupplyDataFunctions,
	resource: string,
	operation: string,
	rawParams: Record<string, unknown>,
): Promise<string> {
	// Strip n8n framework metadata at entry — before any routing
	const params: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(rawParams)) {
		if (N8N_METADATA_FIELDS.has(key)) continue;
		if (N8N_METADATA_PREFIXES.some((p) => key.startsWith(p))) continue;
		params[key] = value;
	}

	// Look up resource in registry
	const resourceConfig = RESOURCE_REGISTRY[resource];
	if (!resourceConfig) {
		return JSON.stringify(wrapError(resource, operation, ERROR_TYPES.INVALID_OPERATION,
			`Unknown resource: ${resource}`,
			'Check available resources and try again.'));
	}

	const opDef = resourceConfig.operations[operation];
	if (!opDef) {
		const validOps = Object.keys(resourceConfig.operations);
		return JSON.stringify(wrapError(resource, operation, ERROR_TYPES.INVALID_OPERATION,
			`Unknown operation: ${operation}`,
			`Use one of: ${validOps.join(', ')}`));
	}

	// Extract tenantFilter from params (LLM provides it as 'tenantFilter')
	const tenantFilter = (params.tenantFilter as string) ?? '';
	delete params.tenantFilter;

	// Extract limit — handled separately for list ops
	const limit = typeof params.limit === 'number' ? params.limit
		: typeof params.limit === 'string' ? parseInt(params.limit as string, 10) || 25
		: 25;
	delete params.limit;

	// Check required params
	for (const [paramName, paramDef] of Object.entries(opDef.params)) {
		if (paramDef.required && (params[paramName] === undefined || params[paramName] === '')) {
			return JSON.stringify(wrapError(resource, operation, ERROR_TYPES.MISSING_REQUIRED_FIELD,
				`Required parameter '${paramName}' is missing.`,
				`Provide '${paramName}': ${paramDef.description}`));
		}
	}

	// Delegate to customExecutor if the resource provides one (e.g., teamsShift Graph routing)
	if (resourceConfig.customExecutor) {
		return resourceConfig.customExecutor(context, operation, tenantFilter, params, opDef);
	}

	// ── Generic execution path ──────────────────────────────────────
	try {
		const body: IDataObject = {};
		const qs: IDataObject = {};

		// Merge hardcoded defaults first (before param mapping so params can override)
		if (opDef.defaults?.body) Object.assign(body, opDef.defaults.body);
		if (opDef.defaults?.qs) Object.assign(qs, opDef.defaults.qs);

		// Add tenant filter to the correct location
		if (opDef.tenant.location === 'qs' && tenantFilter) {
			qs[opDef.tenant.field] = tenantFilter;
		} else if (opDef.tenant.location === 'body' && tenantFilter) {
			body[opDef.tenant.field] = tenantFilter;
		}

		// Map params to body/qs based on registry
		for (const [paramName, paramDef] of Object.entries(opDef.params)) {
			const value = params[paramName];
			if (value === undefined || value === null || value === '') continue;

			const apiName = paramDef.apiName ?? paramName;
			let processedValue = value;

			// Type coercion
			if (paramDef.type === 'json' && typeof value === 'string') {
				try { processedValue = JSON.parse(value as string); }
				catch { /* pass as-is */ }
			}
			if (paramDef.type === 'number' && typeof value === 'string') {
				const parsed = Number(value);
				if (!isNaN(parsed)) processedValue = parsed;
			}
			if (paramDef.type === 'boolean' && typeof value === 'string') {
				processedValue = value === 'true' || value === '1';
			}

			if (paramDef.location === 'qs') {
				qs[apiName] = processedValue as string | number | boolean;
			} else {
				body[apiName] = processedValue;
			}
		}

		// Spread remaining params into body (handles optional fields not in registry)
		for (const [key, value] of Object.entries(params)) {
			if (key in opDef.params) continue;
			if (value !== undefined && value !== null && value !== '') {
				body[key] = value;
			}
		}

		// Execute the API call
		let result: IDataObject | IDataObject[];

		if (opDef.isList) {
			result = await cippApiRequest.call(
				context as unknown as IExecuteFunctions,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				opDef.method as any,
				opDef.endpoint,
				Object.keys(body).length > 0 ? body : {},
				qs,
			);

			// Unwrap response — use per-operation config or standard wrappers
			if (result && !Array.isArray(result)) {
				const obj = result as IDataObject;
				if (opDef.responseUnwrap && Array.isArray(obj[opDef.responseUnwrap])) {
					result = obj[opDef.responseUnwrap] as IDataObject[];
				} else if (Array.isArray(obj.Results)) {
					result = obj.Results as IDataObject[];
				} else if (Array.isArray(obj.value)) {
					result = obj.value as IDataObject[];
				} else {
					result = [obj];
				}
			}

			const arr = Array.isArray(result) ? result : [];
			const hasFilters = Object.keys(qs).some((k) => k !== opDef.tenant.field) ||
				Object.keys(body).some((k) => k !== opDef.tenant.field);

			// Filtered empty guard — prevents LLM fabrication
			if (arr.length === 0 && hasFilters) {
				const filtersUsed: Record<string, unknown> = {};
				for (const [k, v] of Object.entries(qs)) {
					if (k !== opDef.tenant.field) filtersUsed[k] = v;
				}
				return JSON.stringify(wrapError(resource, operation, ERROR_TYPES.NO_RESULTS_FOUND,
					`No ${resourceConfig.label} records matched the provided filters.`,
					'Broaden your search criteria, check for typos, or verify the record exists.',
					{ filtersUsed }));
			}

			const items = arr.slice(0, limit);
			const resultPayload: Record<string, unknown> = { items, count: items.length };
			if (arr.length > limit) {
				resultPayload.truncated = true;
				resultPayload.totalAvailable = arr.length;
				resultPayload.note = `Results capped at ${limit}. Increase 'limit' or use filters.`;
			}
			return JSON.stringify(wrapSuccess(resource, operation, resultPayload));
		} else {
			result = await cippApiRequest.call(
				context as unknown as IExecuteFunctions,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				opDef.method as any,
				opDef.endpoint,
				Object.keys(body).length > 0 ? body : {},
				Object.keys(qs).length > 0 ? qs : {},
			);

			// Null get guard — prevents LLM hallucination
			const isMissing = result === null
				|| result === undefined
				|| (Array.isArray(result) && result.length === 0)
				|| (typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length === 0);

			if (isMissing && !opDef.isWrite) {
				return JSON.stringify(wrapError(resource, operation, ERROR_TYPES.ENTITY_NOT_FOUND,
					`No ${resourceConfig.label} record found.`,
					`Use cipp_${resource} with a list operation and filters to find the record.`));
			}

			return JSON.stringify(wrapSuccess(resource, operation, result));
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return JSON.stringify(formatApiError(msg, resource, operation));
	}
}

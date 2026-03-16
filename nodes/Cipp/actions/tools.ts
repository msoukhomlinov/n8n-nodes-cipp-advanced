import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	buildOdataQuery,
	cippApiRequest,
	getTenantFilter,
	listWithSlice,
	normalizeGraphEndpoint,
	parseJsonPayload,
	parseJsonObjectPayload,
	hasPayloadContent,
	isTeamsScheduleEndpoint,
} from '../GenericFunctions';

export async function execute(
	context: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	let responseData: IDataObject | IDataObject[] = {};

	if (operation === 'breachAccount') {
		const account = context.getNodeParameter('account', i) as string;

		responseData = await cippApiRequest.call(
			context,
			'GET',
			'/api/ListBreachesAccount',
			{},
			{ account },
		);
	} else if (operation === 'breachTenant') {
		const tenantFilter = getTenantFilter(context, i);

		responseData = await cippApiRequest.call(
			context,
			'GET',
			'/api/ListBreachesTenant',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'executeBreachSearch') {
		const tenantFilter = getTenantFilter(context, i);

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ExecBreachSearch',
			{ tenantFilter },
			{},
		);
	} else if (operation === 'graphRequest') {
		const tenantFilter = getTenantFilter(context, i);
		const endpoint = context.getNodeParameter('graphEndpoint', i) as string;
		const graphOptions = context.getNodeParameter('graphOptions', i, {}) as IDataObject;

		const qs = buildOdataQuery(
			{ tenantFilter, Endpoint: endpoint },
			{
				select: graphOptions.select as string | undefined,
				filter: graphOptions.filter as string | undefined,
				orderby: graphOptions.orderby as string | undefined,
				top: graphOptions.top as number | undefined,
			},
		);

		if (graphOptions.count) {
			qs.$count = graphOptions.count;
		}

		responseData = await cippApiRequest.call(
			context,
			'GET',
			'/api/ListGraphRequest',
			{},
			qs,
		);
	} else if (operation === 'execGraphRequest') {
		const tenantFilter = getTenantFilter(context, i);
		const rawEndpoint = context.getNodeParameter('execEndpoint', i) as string;
		const method = context.getNodeParameter('execMethod', i) as string;

		const payload: IDataObject = {
			tenantFilter,
			endpoint: normalizeGraphEndpoint(rawEndpoint),
			method,
		};

		if (method === 'POST' || method === 'PATCH') {
			const bodyValue = context.getNodeParameter('execBody', i, '') as string;
			const parsedBody = parseJsonPayload(context.getNode(), bodyValue, 'body', i);
			if (hasPayloadContent(parsedBody)) {
				payload.body = parsedBody;
			}
		}

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ExecGraphRequest',
			payload,
			{},
		);
	} else if (operation === 'graphRequestExec') {
		const tenantFilter = getTenantFilter(context, i);
		const rawEndpoint = context.getNodeParameter('graphExecEndpoint', i) as string;
		const method = context.getNodeParameter('graphExecMethod', i) as string;
		const graphExecOptions = context.getNodeParameter('graphExecOptions', i, {}) as IDataObject;

		const endpoint = normalizeGraphEndpoint(rawEndpoint);
		if (!endpoint) {
			throw new NodeOperationError(
				context.getNode(),
				'Graph endpoint is required',
				{ itemIndex: i },
			);
		}

		if (graphExecOptions.enforceShiftsAllowlist !== false) {
			if (!isTeamsScheduleEndpoint(endpoint)) {
				throw new NodeOperationError(
					context.getNode(),
					`Endpoint "${endpoint}" is not in the Teams Schedule allowlist. Disable "Enforce Shifts Allowlist" in options to use arbitrary endpoints.`,
					{ itemIndex: i },
				);
			}
		}

		const graphExecHeaders = context.getNodeParameter('graphExecHeaders', i, '{}') as string;
		const headers = parseJsonObjectPayload(context.getNode(), graphExecHeaders, 'Headers', i);

		const payload: IDataObject = {
			tenantFilter,
			endpoint,
			method,
		};

		if (Object.keys(headers).length > 0) {
			payload.headers = headers;
		}

		if (method !== 'GET') {
			const graphExecBody = context.getNodeParameter('graphExecBody', i, '') as string;
			const body = parseJsonPayload(context.getNode(), graphExecBody, 'Body', i);
			if (hasPayloadContent(body)) {
				payload.body = body;
			}
		}

		const maxPayloadBytes = (graphExecOptions.maxPayloadBytes as number) || 262144;
		const payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).length;
		if (payloadBytes > maxPayloadBytes) {
			throw new NodeOperationError(
				context.getNode(),
				`Payload size (${payloadBytes} bytes) exceeds maximum allowed size (${maxPayloadBytes} bytes)`,
				{ itemIndex: i },
			);
		}

		try {
			responseData = await cippApiRequest.call(
				context,
				'POST',
				'/api/ExecGraphRequest',
				payload,
				{},
			);
		} catch (error) {
			// Fall back to /api/GraphRequest only when the CIPP endpoint itself is missing (HTTP 404).
			// This avoids masking Graph-level 404s (e.g. user/resource not found).
			const httpCode = (error as IDataObject).httpCode as string | undefined;
			if (httpCode === '404') {
				responseData = await cippApiRequest.call(
					context,
					'POST',
					'/api/GraphRequest',
					payload,
					{},
				);
			} else {
				throw error;
			}
		}
	} else if (operation === 'sendTestEmail') {
		const qs: IDataObject = {};
		responseData = await cippApiRequest.call(context, 'GET', '/api/ExecMailTest', {}, qs);
	} else if (operation === 'geoIpLookup') {
		const ip = context.getNodeParameter('ipAddress', i) as string;

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ExecGeoIPLookup',
			{ IP: ip },
			{},
		);
	} else if (operation === 'universalSearch') {
		const qs: IDataObject = {};
		const searchName = context.getNodeParameter('searchName', i, '') as string;
		if (searchName) qs.name = searchName;

		responseData = await cippApiRequest.call(
			context,
			'GET',
			'/api/ExecUniversalSearch',
			{},
			qs,
		);
	} else if (operation === 'universalSearchV2') {
		const qs: IDataObject = {};
		const v2Options = context.getNodeParameter('universalSearchV2Options', i, {}) as IDataObject;

		if (v2Options.searchTerms) qs.searchTerms = v2Options.searchTerms;
		if (v2Options.type) qs.type = v2Options.type;
		if (v2Options.limit) qs.limit = v2Options.limit;

		responseData = await cippApiRequest.call(
			context,
			'GET',
			'/api/ExecUniversalSearchV2',
			{},
			qs,
		);
	} else if (operation === 'listAllTenantDeviceCompliance') {
		const tenantFilter = getTenantFilter(context, i);

		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListAllTenantDeviceCompliance',
			{},
			{ tenantFilter },
		);
	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
	}

	return responseData;
}

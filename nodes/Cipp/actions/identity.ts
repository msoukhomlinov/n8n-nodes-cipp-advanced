import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { cippApiRequest, getTenantFilter, listWithSlice, postAction } from '../GenericFunctions';

export async function execute(
	context: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	let responseData: IDataObject | IDataObject[] = {};
	const tenantFilter = getTenantFilter(context, i);

	if (operation === 'listAzureAdConnectStatus') {
		const filters = context.getNodeParameter('adConnectFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.DataToReturn) {
			qs.DataToReturn = filters.DataToReturn as string;
		}

		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListAzureADConnectStatus',
			{},
			qs,
		);
	} else if (operation === 'listBasicAuth') {
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListBasicAuth',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'listAuditLogs') {
		const filters = context.getNodeParameter('auditLogFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter };
		if (filters.StartDate) {
			qs.StartDate = filters.StartDate as string;
		}
		if (filters.EndDate) {
			qs.EndDate = filters.EndDate as string;
		}
		if (filters.RelativeTime) {
			qs.RelativeTime = filters.RelativeTime as string;
		}
		if (filters.LogId) {
			qs.LogId = filters.LogId as string;
		}

		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListAuditLogs',
			{},
			qs,
		);
	} else if (operation === 'listDeletedItems') {
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListDeletedItems',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'listRoles') {
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListRoles',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'listOrg') {
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListOrg',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'listPartnerRelationships') {
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListPartnerRelationships',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'listDirectoryObjects') {
		const filters = context.getNodeParameter('directoryObjectsFilters', i, {}) as IDataObject;

		const body: IDataObject = { tenantFilter };
		if (filters.ids) body.ids = filters.ids;
		if (filters.asApp) body.asApp = filters.asApp;
		if (filters.partnerLookup) body.partnerLookup = filters.partnerLookup;

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ListDirectoryObjects',
			body,
			{},
		);
	} else if (operation === 'restoreDeleted') {
		responseData = await postAction(
			context,
			i,
			'/api/ExecRestoreDeleted',
			{
				ID: context.getNodeParameter('objectId', i) as string,
			},
		);
	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
	}

	return responseData;
}

import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { cippApiRequest, getTenantFilter, listWithSlice, postAction, parseJsonObjectPayload } from '../GenericFunctions';

export async function execute(
	context: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	let responseData: IDataObject | IDataObject[] = {};

	if (operation === 'getAll') {
		responseData = await listWithSlice(context, i, 'GET', '/api/ListAlertsQueue', {}, {});
	} else if (operation === 'add') {
		const alertConfig = context.getNodeParameter('alertConfig', i) as string;

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/AddAlert',
			parseJsonObjectPayload(context.getNode(), alertConfig, 'Alert Config', i),
			{},
		);
	} else if (operation === 'getSecurityAlerts') {
		const tenantFilter = getTenantFilter(context, i);

		responseData = await listWithSlice(context, i, 'GET', '/api/ExecAlertsList', {}, { tenantFilter });
	} else if (operation === 'getSecurityIncidents') {
		const tenantFilter = getTenantFilter(context, i);

		responseData = await listWithSlice(context, i, 'GET', '/api/ExecIncidentsList', {}, { tenantFilter });
	} else if (operation === 'setSecurityAlertStatus') {
		const alertId = context.getNodeParameter('alertId', i) as string;
		const alertStatus = context.getNodeParameter('alertStatus', i) as string;
		const alertAdditionalFields = context.getNodeParameter('alertAdditionalFields', i, {}) as IDataObject;

		responseData = await postAction(context, i, '/api/ExecSetSecurityAlert', {
			GUID: alertId,
			Status: alertStatus,
			...alertAdditionalFields,
		});
	} else if (operation === 'setSecurityIncidentStatus') {
		const incidentId = context.getNodeParameter('incidentId', i) as string;
		const incidentStatus = context.getNodeParameter('incidentStatus', i) as string;
		const assignedTo = context.getNodeParameter('assignedTo', i, '') as string;

		const body: IDataObject = {
			GUID: incidentId,
			Status: incidentStatus,
		};

		if (assignedTo) {
			body.Assigned = assignedTo;
		}

		responseData = await postAction(context, i, '/api/ExecSetSecurityIncident', body);

	// ── Audit Log operations ──

	} else if (operation === 'searchAuditLog') {
		const fields = context.getNodeParameter('auditSearchFields', i, {}) as IDataObject;

		responseData = await postAction(context, i, '/api/ExecAuditLogSearch', fields);
	} else if (operation === 'listAuditLogSearches') {
		const tenantFilter = getTenantFilter(context, i);
		const filters = context.getNodeParameter('auditSearchFilters', i, {}) as IDataObject;

		const qs: IDataObject = { tenantFilter, ...filters };

		responseData = await listWithSlice(context, i, 'GET', '/api/ListAuditLogSearches', {}, qs);
	} else if (operation === 'testAuditLog') {
		const tenantFilter = getTenantFilter(context, i);
		const qs: IDataObject = { tenantFilter };

		const searchId = context.getNodeParameter('searchId', i, '') as string;
		if (searchId) qs.SearchId = searchId;

		responseData = await cippApiRequest.call(
			context,
			'GET',
			'/api/ListAuditLogTest',
			{},
			qs,
		);

	// ── Webhook Alert operations ──

	} else if (operation === 'listWebhookAlerts') {
		const returnAll = context.getNodeParameter('returnAll', i) as boolean;

		responseData = await cippApiRequest.call(
			context,
			'GET',
			'/api/ListWebhookAlert',
			{},
			{},
		);

		if (Array.isArray(responseData) && !returnAll) {
			const limit = context.getNodeParameter('limit', i) as number;
			responseData = responseData.slice(0, limit);
		}
	} else if (operation === 'removeQueuedAlert') {
		const body: IDataObject = {};
		const id = context.getNodeParameter('alertQueueId', i, '') as string;
		const eventType = context.getNodeParameter('eventType', i, '') as string;

		if (id) body.ID = id;
		if (eventType) body.EventType = eventType;

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/RemoveQueuedAlert',
			body,
			{},
		);

	// ── MDO (Microsoft Defender for Office) Alert operations ──

	} else if (operation === 'listMdoAlerts') {
		const tenantFilter = getTenantFilter(context, i);

		responseData = await listWithSlice(context, i, 'GET', '/api/ExecMdoAlertsList', {}, { tenantFilter });
	} else if (operation === 'setMdoAlert') {
		const guid = context.getNodeParameter('mdoAlertGuid', i) as string;
		const fields = context.getNodeParameter('mdoAlertFields', i, {}) as IDataObject;

		responseData = await postAction(context, i, '/api/ExecSetMdoAlert', {
			GUID: guid,
			...fields,
		});
	// ── Add Alert Rule (ExecAddAlert) ──

	} else if (operation === 'addAlertRule') {
		const body: IDataObject = {};
		const alertFields = context.getNodeParameter('addAlertFields', i, {}) as IDataObject;

		if (alertFields.text) body.text = alertFields.text;
		if (alertFields.Severity) body.Severity = alertFields.Severity;
		if (alertFields.email) body.email = alertFields.email;
		if (alertFields.webhook) body.webhook = alertFields.webhook;
		if (alertFields.logsToInclude) body.logsToInclude = alertFields.logsToInclude;
		if (alertFields.onePerTenant) body.onePerTenant = alertFields.onePerTenant;
		if (alertFields.sendEmailNow) body.sendEmailNow = alertFields.sendEmailNow;
		if (alertFields.sendPsaNow) body.sendPsaNow = alertFields.sendPsaNow;
		if (alertFields.sendWebhookNow) body.sendWebhookNow = alertFields.sendWebhookNow;
		if (alertFields.writeLog) body.writeLog = alertFields.writeLog;

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ExecAddAlert',
			body,
			{},
		);
	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
	}

	return responseData;
}

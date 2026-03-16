import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { cippApiRequest, getTenantFilter, listWithSlice, parseJsonPayload } from '../GenericFunctions';

export async function execute(
	context: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	let responseData: IDataObject | IDataObject[] = {};

	if (operation === 'getAll') {
		const options = context.getNodeParameter('options', i, {}) as IDataObject;

		const qs: IDataObject = {};
		if (options.showHidden) {
			qs.ShowHidden = options.showHidden;
		}
		if (options.name) {
			qs.Name = options.name;
		}

		responseData = await listWithSlice(
			context, i, 'POST', '/api/ListScheduledItems', {}, qs,
		);
	} else if (operation === 'add') {
		const tenantFilter = getTenantFilter(context, i);
		const jobName = context.getNodeParameter('jobName', i) as string;
		const command = context.getNodeParameter('command', i) as string;
		const recurrence = context.getNodeParameter('recurrence', i) as string;
		const parameters = context.getNodeParameter('parameters', i) as string;
		const postExecution = context.getNodeParameter('postExecution', i) as string;
		const scheduledTime = context.getNodeParameter('scheduledTime', i, '') as string;

		const body: IDataObject = {
			TenantFilter: tenantFilter || 'AllTenants',
			Name: jobName,
			Command: command,
			Recurrence: recurrence,
			Parameters: parseJsonPayload(context.getNode(), parameters, 'Parameters', i),
			PostExecution: postExecution,
		};

		if (scheduledTime) {
			const parsed = new Date(scheduledTime);
			if (isNaN(parsed.getTime())) {
				throw new NodeOperationError(
					context.getNode(),
					`Invalid ScheduledTime value: "${scheduledTime}". Provide a valid date string (e.g. 2026-03-15T10:00:00Z).`,
					{ itemIndex: i },
				);
			}
			body.ScheduledTime = parsed.getTime() / 1000;
		}

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/AddScheduledItem',
			body,
			{},
		);
	} else if (operation === 'getDetails') {
		const rowKey = context.getNodeParameter('detailsRowKey', i, '') as string;

		const body: IDataObject = {};
		const qs: IDataObject = {};
		if (rowKey) {
			body.RowKey = rowKey;
			qs.RowKey = rowKey;
		}

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ListScheduledItemDetails',
			body,
			qs,
		);
	} else if (operation === 'remove') {
		const rowKey = context.getNodeParameter('rowKey', i) as string;

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/RemoveScheduledItem',
			{
				id: rowKey,
			},
			{},
		);
	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
	}

	return responseData;
}

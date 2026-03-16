import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { cippApiRequest, getTenantFilter, parseJsonPayload, parseJsonObjectPayload } from '../GenericFunctions';

export async function execute(
	context: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	let responseData: IDataObject | IDataObject[] = {};

	const tenantFilter = getTenantFilter(context, i);
	const teamId = context.getNodeParameter('teamId', i) as string;
	const basePath = `teams/${teamId}/schedule`;

	const graphExec = async (method: string, endpoint: string, body?: IDataObject) => {
		const payload: IDataObject = { tenantFilter, endpoint, method };
		if (body && Object.keys(body).length > 0) {
			payload.body = body;
		}
		return cippApiRequest.call(context, 'POST', '/api/ExecGraphRequest', payload, {});
	};

	const buildFilteredEndpoint = (base: string): string => {
		const filters = context.getNodeParameter('listFilters', i, {}) as IDataObject;
		if (filters.rawFilter) {
			return `${base}?$filter=${encodeURIComponent(filters.rawFilter as string)}`;
		}
		const parts: string[] = [];
		if (filters.startDate) {
			const d = new Date(filters.startDate as string);
			if (isNaN(d.getTime())) {
				throw new NodeOperationError(context.getNode(), `Invalid startDate: "${filters.startDate}". Provide a valid date string.`, { itemIndex: i });
			}
			parts.push(`sharedShift/startDateTime ge ${d.toISOString()}`);
		}
		if (filters.endDate) {
			const d = new Date(filters.endDate as string);
			if (isNaN(d.getTime())) {
				throw new NodeOperationError(context.getNode(), `Invalid endDate: "${filters.endDate}". Provide a valid date string.`, { itemIndex: i });
			}
			parts.push(`sharedShift/endDateTime le ${d.toISOString()}`);
		}
		return parts.length > 0 ? `${base}?$filter=${encodeURIComponent(parts.join(' and '))}` : base;
	};

	if (operation === 'listShifts') {
		responseData = await graphExec('GET', buildFilteredEndpoint(`${basePath}/shifts`));
	} else if (operation === 'createShift') {
		const userId = context.getNodeParameter('userId', i) as string;
		const startDateTime = context.getNodeParameter('startDateTime', i) as string;
		const endDateTime = context.getNodeParameter('endDateTime', i) as string;
		const shiftOptions = context.getNodeParameter('shiftOptions', i, {}) as IDataObject;

		const sharedShift: IDataObject = {
			startDateTime,
			endDateTime,
		};

		if (shiftOptions.displayName) sharedShift.displayName = shiftOptions.displayName;
		if (shiftOptions.notes) sharedShift.notes = shiftOptions.notes;
		if (shiftOptions.theme) sharedShift.theme = shiftOptions.theme;
		if (shiftOptions.activities) sharedShift.activities = parseJsonPayload(context.getNode(), shiftOptions.activities as string, 'Activities', i);

		responseData = await graphExec('POST', `${basePath}/shifts`, {
			userId,
			sharedShift,
		});
	} else if (operation === 'updateShift') {
		const shiftId = context.getNodeParameter('shiftId', i) as string;
		const shiftUpdateData = context.getNodeParameter('shiftUpdateData', i) as string;

		responseData = await graphExec(
			'PUT',
			`${basePath}/shifts/${shiftId}`,
			parseJsonObjectPayload(context.getNode(), shiftUpdateData, 'Shift Data', i),
		);
	} else if (operation === 'deleteShift') {
		const shiftId = context.getNodeParameter('shiftId', i) as string;

		responseData = await graphExec('DELETE', `${basePath}/shifts/${shiftId}`);
	} else if (operation === 'listOpenShifts') {
		responseData = await graphExec('GET', buildFilteredEndpoint(`${basePath}/openShifts`));
	} else if (operation === 'createOpenShift') {
		const schedulingGroupId = context.getNodeParameter('schedulingGroupId', i) as string;
		const startDateTime = context.getNodeParameter('openShiftStart', i) as string;
		const endDateTime = context.getNodeParameter('openShiftEnd', i) as string;
		const openSlotCount = context.getNodeParameter('openSlotCount', i) as number;
		const openShiftOptions = context.getNodeParameter('openShiftOptions', i, {}) as IDataObject;

		const sharedOpenShift: IDataObject = {
			startDateTime,
			endDateTime,
			openSlotCount,
		};

		if (openShiftOptions.displayName) sharedOpenShift.displayName = openShiftOptions.displayName;
		if (openShiftOptions.notes) sharedOpenShift.notes = openShiftOptions.notes;
		if (openShiftOptions.theme) sharedOpenShift.theme = openShiftOptions.theme;
		if (openShiftOptions.activities) sharedOpenShift.activities = parseJsonPayload(context.getNode(), openShiftOptions.activities as string, 'Activities', i);

		responseData = await graphExec('POST', `${basePath}/openShifts`, {
			schedulingGroupId,
			sharedOpenShift,
		});
	} else if (operation === 'updateOpenShift') {
		const openShiftId = context.getNodeParameter('openShiftId', i) as string;
		const openShiftUpdateData = context.getNodeParameter('openShiftUpdateData', i) as string;

		responseData = await graphExec(
			'PUT',
			`${basePath}/openShifts/${openShiftId}`,
			parseJsonObjectPayload(context.getNode(), openShiftUpdateData, 'Open Shift Data', i),
		);
	} else if (operation === 'deleteOpenShift') {
		const openShiftId = context.getNodeParameter('openShiftId', i) as string;

		responseData = await graphExec('DELETE', `${basePath}/openShifts/${openShiftId}`);
	} else if (operation === 'listSchedulingGroups') {
		responseData = await graphExec('GET', buildFilteredEndpoint(`${basePath}/schedulingGroups`));
	} else if (operation === 'createSchedulingGroup') {
		const groupDisplayName = context.getNodeParameter('groupDisplayName', i) as string;
		const groupUserIds = context.getNodeParameter('groupUserIds', i) as string;

		responseData = await graphExec('POST', `${basePath}/schedulingGroups`, {
			displayName: groupDisplayName,
			userIds: groupUserIds.split(',').map((id: string) => id.trim()).filter((id: string) => id),
			isActive: true,
		});
	} else if (operation === 'updateSchedulingGroup') {
		const groupId = context.getNodeParameter('schedulingGroupUpdateId', i) as string;
		const groupUpdateData = context.getNodeParameter('schedulingGroupUpdateData', i) as string;

		responseData = await graphExec(
			'PUT',
			`${basePath}/schedulingGroups/${groupId}`,
			parseJsonObjectPayload(context.getNode(), groupUpdateData, 'Scheduling Group Data', i),
		);
	} else if (operation === 'deleteSchedulingGroup') {
		const groupId = context.getNodeParameter('schedulingGroupUpdateId', i) as string;

		responseData = await graphExec('DELETE', `${basePath}/schedulingGroups/${groupId}`);
	} else if (operation === 'listTimeOffReasons') {
		responseData = await graphExec('GET', buildFilteredEndpoint(`${basePath}/timeOffReasons`));
	} else if (operation === 'createTimeOffReason') {
		const reasonDisplayName = context.getNodeParameter('reasonDisplayName', i) as string;
		const iconType = context.getNodeParameter('iconType', i) as string;

		responseData = await graphExec('POST', `${basePath}/timeOffReasons`, {
			displayName: reasonDisplayName,
			iconType,
			isActive: true,
		});
	} else if (operation === 'updateTimeOffReason') {
		const reasonId = context.getNodeParameter('timeOffReasonId', i) as string;
		const timeOffReasonUpdateData = context.getNodeParameter('timeOffReasonUpdateData', i) as string;

		responseData = await graphExec(
			'PUT',
			`${basePath}/timeOffReasons/${reasonId}`,
			parseJsonObjectPayload(context.getNode(), timeOffReasonUpdateData, 'Time Off Reason Data', i),
		);
	} else if (operation === 'deleteTimeOffReason') {
		const reasonId = context.getNodeParameter('timeOffReasonId', i) as string;

		responseData = await graphExec('PUT', `${basePath}/timeOffReasons/${reasonId}`, {
			isActive: false,
		});
	} else if (operation === 'listTimeOffRequests') {
		responseData = await graphExec('GET', buildFilteredEndpoint(`${basePath}/timeOffRequests`));
	} else if (operation === 'createTimeOffRequest') {
		const timeOffStart = context.getNodeParameter('timeOffStart', i) as string;
		const timeOffEnd = context.getNodeParameter('timeOffEnd', i) as string;
		const timeOffReasonIdForRequest = context.getNodeParameter('timeOffReasonIdForRequest', i) as string;

		responseData = await graphExec('POST', `${basePath}/timeOffRequests`, {
			startDateTime: timeOffStart,
			endDateTime: timeOffEnd,
			timeOffReasonId: timeOffReasonIdForRequest,
		});
	} else if (operation === 'approveTimeOffRequest') {
		const requestId = context.getNodeParameter('timeOffRequestId', i) as string;
		const message = context.getNodeParameter('approvalMessage', i, '') as string;

		const body: IDataObject = {};
		if (message) body.message = message;

		responseData = await graphExec('POST', `${basePath}/timeOffRequests/${requestId}/approve`, body);
	} else if (operation === 'declineTimeOffRequest') {
		const requestId = context.getNodeParameter('timeOffRequestId', i) as string;
		const message = context.getNodeParameter('approvalMessage', i, '') as string;

		const body: IDataObject = {};
		if (message) body.message = message;

		responseData = await graphExec('POST', `${basePath}/timeOffRequests/${requestId}/decline`, body);
	} else if (operation === 'listSwapShiftRequests') {
		responseData = await graphExec('GET', buildFilteredEndpoint(`${basePath}/swapShiftsChangeRequests`));
	} else if (operation === 'createSwapShiftRequest') {
		const senderShiftId = context.getNodeParameter('senderShiftId', i) as string;
		const recipientShiftId = context.getNodeParameter('recipientShiftId', i) as string;
		const swapRecipientUserId = context.getNodeParameter('swapRecipientUserId', i) as string;

		responseData = await graphExec('POST', `${basePath}/swapShiftsChangeRequests`, {
			senderShiftId,
			recipientShiftId,
			recipientUserId: swapRecipientUserId,
		});
	} else if (operation === 'approveSwapShiftRequest') {
		const requestId = context.getNodeParameter('swapShiftRequestId', i) as string;
		const message = context.getNodeParameter('approvalMessage', i, '') as string;

		const body: IDataObject = {};
		if (message) body.message = message;

		responseData = await graphExec('POST', `${basePath}/swapShiftsChangeRequests/${requestId}/approve`, body);
	} else if (operation === 'declineSwapShiftRequest') {
		const requestId = context.getNodeParameter('swapShiftRequestId', i) as string;
		const message = context.getNodeParameter('approvalMessage', i, '') as string;

		const body: IDataObject = {};
		if (message) body.message = message;

		responseData = await graphExec('POST', `${basePath}/swapShiftsChangeRequests/${requestId}/decline`, body);
	} else if (operation === 'listOfferShiftRequests') {
		responseData = await graphExec('GET', buildFilteredEndpoint(`${basePath}/offerShiftRequests`));
	} else if (operation === 'createOfferShiftRequest') {
		const offerSenderShiftId = context.getNodeParameter('offerSenderShiftId', i) as string;
		const offerRecipientUserId = context.getNodeParameter('offerRecipientUserId', i) as string;

		responseData = await graphExec('POST', `${basePath}/offerShiftRequests`, {
			senderShiftId: offerSenderShiftId,
			recipientUserId: offerRecipientUserId,
		});
	} else if (operation === 'approveOfferShiftRequest') {
		const requestId = context.getNodeParameter('offerShiftRequestId', i) as string;
		const message = context.getNodeParameter('approvalMessage', i, '') as string;

		const body: IDataObject = {};
		if (message) body.message = message;

		responseData = await graphExec('POST', `${basePath}/offerShiftRequests/${requestId}/approve`, body);
	} else if (operation === 'declineOfferShiftRequest') {
		const requestId = context.getNodeParameter('offerShiftRequestId', i) as string;
		const message = context.getNodeParameter('approvalMessage', i, '') as string;

		const body: IDataObject = {};
		if (message) body.message = message;

		responseData = await graphExec('POST', `${basePath}/offerShiftRequests/${requestId}/decline`, body);
	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
	}

	return responseData;
}

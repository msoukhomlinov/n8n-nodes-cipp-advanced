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

	if (operation === 'getPhoneNumbers') {
		responseData = await listWithSlice(context, i,
			'GET',
			'/api/ListTeamsVoice',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'getLocations') {
		responseData = await listWithSlice(context, i,
			'GET',
			'/api/ListTeamsLisLocation',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'assignNumber') {
		const phoneNumber = context.getNodeParameter('phoneNumber', i) as string;
		const voiceUser = context.getNodeParameter('voiceUser', i) as string;
		const phoneNumberType = context.getNodeParameter('phoneNumberType', i, '') as string;
		const locationOnly = context.getNodeParameter('locationOnly', i) as boolean;

		responseData = await cippApiRequest.call(context,
			'POST',
			'/api/ExecTeamsVoicePhoneNumberAssignment',
			{
				TenantFilter: tenantFilter,
				PhoneNumber: phoneNumber,
				PhoneNumberType: phoneNumberType,
				locationOnly: String(locationOnly),
				input: voiceUser,
			},
			{},
		);
	} else if (operation === 'unassignNumber') {
		const phoneNumber = context.getNodeParameter('phoneNumber', i) as string;
		const voiceUser = context.getNodeParameter('voiceUser', i) as string;
		const phoneNumberType = context.getNodeParameter('phoneNumberType', i, '') as string;

		responseData = await postAction(context, i,
			'/api/ExecRemoveTeamsVoicePhoneNumberAssignment',
			{
				PhoneNumber: phoneNumber,
				PhoneNumberType: phoneNumberType,
				AssignedTo: voiceUser,
			},
		);
	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
	}

	return responseData;
}

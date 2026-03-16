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

	if (operation === 'getMany') {
		responseData = await listWithSlice(
			context,
			i,
			'GET',
			'/api/ListMailQuarantine',
			{},
			{ tenantFilter },
		);
	} else if (operation === 'release') {
		const messageId = context.getNodeParameter('messageId', i) as string;
		const allowSender = context.getNodeParameter('allowSender', i) as boolean;

		responseData = await postAction(
			context,
			i,
			'/api/ExecQuarantineManagement',
			{
				Identity: messageId,
				Type: 'Release',
				AllowSender: allowSender ? 'true' : 'false',
			},
		);
	} else if (operation === 'deny') {
		const messageId = context.getNodeParameter('messageId', i) as string;

		responseData = await postAction(
			context,
			i,
			'/api/ExecQuarantineManagement',
			{
				Identity: messageId,
				Type: 'Deny',
			},
		);
	} else if (operation === 'getMessage') {
		const messageId = context.getNodeParameter('messageId', i) as string;

		responseData = await cippApiRequest.call(
			context,
			'GET',
			'/api/ListMailQuarantineMessage',
			{},
			{
				tenantFilter,
				Identity: messageId,
			},
		);
	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
	}

	return responseData;
}

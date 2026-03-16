import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { postAction } from '../GenericFunctions';

export async function execute(
	context: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	let responseData: IDataObject | IDataObject[] = {};
	const userId = context.getNodeParameter('userId', i) as string;

	if (operation === 'provision') {
		responseData = await postAction(context, i, '/api/ExecOnedriveProvision', {
			UserPrincipalName: userId,
		});
	} else if (operation === 'addShortcut') {
		const shortcutUrl = context.getNodeParameter('shortcutUrl', i) as string;

		responseData = await postAction(context, i, '/api/ExecOneDriveShortCut', {
			userid: userId,
			siteUrl: shortcutUrl,
		});
	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
	}

	return responseData;
}

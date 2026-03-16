import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { cippApiRequest, listWithSlice, parseJsonPayload } from '../GenericFunctions';

export async function execute(
	context: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	let responseData: IDataObject | IDataObject[] = {};

	if (operation === 'getAll') {
		const options = context.getNodeParameter('options', i, {}) as IDataObject;

		const qs: IDataObject = {};
		if (options.namesOnly) {
			qs.NameOnly = options.namesOnly;
		}
		if (options.backupName) {
			qs.BackupName = options.backupName;
		}
		if (options.type) {
			qs.Type = options.type;
		}

		responseData = await listWithSlice(
			context, i, 'GET', '/api/ExecListBackup', {}, qs,
		);
	} else if (operation === 'run') {
		responseData = await cippApiRequest.call(
			context,
			'GET',
			'/api/ExecRunBackup',
			{},
			{},
		);
	} else if (operation === 'restore') {
		const backupName = context.getNodeParameter('backupName', i, '') as string;
		const backupData = context.getNodeParameter('backupData', i, '{}') as string;

		let body: IDataObject;
		if (backupName) {
			body = { BackupName: backupName };
		} else {
			body = parseJsonPayload(context.getNode(), backupData, 'Backup Data', i) as IDataObject;
		}

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ExecRestoreBackup',
			body,
			{},
		);
	} else if (operation === 'setAutoBackup') {
		const enableAutoBackup = context.getNodeParameter('enableAutoBackup', i) as boolean;

		responseData = await cippApiRequest.call(
			context,
			'POST',
			'/api/ExecSetCIPPAutoBackup',
			{
				Enabled: enableAutoBackup,
			},
			{},
		);
	} else {
		throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
	}

	return responseData;
}

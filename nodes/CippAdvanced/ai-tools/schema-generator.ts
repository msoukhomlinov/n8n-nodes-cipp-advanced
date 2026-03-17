// ai-tools/schema-generator.ts
// Generates Zod schemas dynamically from the operation registry.
import { z } from 'zod';
// NOTE: z is a compile-time VALUE import — we need z.object(), z.string() etc. at build time.
// Only runtime classes (DynamicStructuredTool, ZodType) come from runtime.ts.
import type { RuntimeZod } from './runtime';
import type { OperationDef, ParamDef } from './registry';
import { RESOURCE_REGISTRY } from './registry';

const OPERATION_LABELS: Record<string, string> = {
	get: 'Get by ID',
	getAll: 'List all',
	getMany: 'List all',
	add: 'Add/Create',
	edit: 'Edit/Update',
	remove: 'Remove/Delete',
	delete: 'Delete',
	assign: 'Assign',
	sync: 'Sync',
};

function paramToZodField(param: ParamDef): z.ZodTypeAny {
	let field: z.ZodTypeAny;

	if (param.enumValues && param.enumValues.length > 0) {
		field = z.enum(param.enumValues as [string, ...string[]]);
	} else {
		switch (param.type) {
			case 'number':
				field = z.number();
				break;
			case 'boolean':
				field = z.boolean();
				break;
			case 'json':
				// Accept string (JSON) or object — LLMs may send either
				field = z.union([z.string(), z.record(z.unknown()), z.array(z.unknown())]);
				break;
			case 'string':
			default:
				field = z.string();
				break;
		}
	}

	return field.describe(param.description);
}

function getSchemaForOperation(opDef: OperationDef): z.ZodObject<z.ZodRawShape> {
	const shape: z.ZodRawShape = {};

	// Add tenantFilter if the operation uses it
	if (opDef.tenant.location !== 'none') {
		shape.tenantFilter = z.string().describe(
			'Tenant domain or default domain name to target. Required for tenant-scoped operations.',
		);
	}

	// Add operation-specific params
	for (const [paramName, paramDef] of Object.entries(opDef.params)) {
		const zodField = paramToZodField(paramDef);
		shape[paramName] = paramDef.required ? zodField : zodField.optional();
	}

	// Add limit for list operations
	if (opDef.isList) {
		shape.limit = z.number().int().min(1).max(500).optional().describe(
			'Maximum records to return (default 25, max 500). Increase if you expect many results.',
		);
	}

	return z.object(shape);
}

export function buildUnifiedSchema(
	resource: string,
	operations: string[],
): z.ZodObject<z.ZodRawShape> {
	const config = RESOURCE_REGISTRY[resource];
	if (!config) {
		return z.object({ operation: z.string().describe('Operation to perform') });
	}

	const enabledOps = operations.filter((op) => op in config.operations);
	if (enabledOps.length === 0) {
		return z.object({ operation: z.string().describe('Operation to perform') });
	}

	const operationEnum = z
		.enum(enabledOps as [string, ...string[]])
		.describe(`Operation to perform. Allowed: ${enabledOps.join(', ')}.`);

	// Merge all operation schemas into one flat schema
	const fieldSources = new Map<string, z.ZodTypeAny>();
	const fieldOps = new Map<string, Set<string>>();

	for (const op of enabledOps) {
		const opDef = config.operations[op];
		if (!opDef) continue;
		const schema = getSchemaForOperation(opDef);
		for (const [field, fieldSchema] of Object.entries(schema.shape)) {
			if (!fieldSources.has(field)) fieldSources.set(field, fieldSchema as z.ZodTypeAny);
			if (!fieldOps.has(field)) fieldOps.set(field, new Set<string>());
			fieldOps.get(field)?.add(op);
		}
	}

	const mergedShape: Record<string, z.ZodTypeAny> = { operation: operationEnum };

	for (const [field, fieldSchema] of fieldSources.entries()) {
		const opsForField = Array.from(fieldOps.get(field) ?? []);
		const baseDescription = fieldSchema.description ?? '';
		const label = (op: string) => OPERATION_LABELS[op] ?? op;
		const opsDescription = `Used by: ${opsForField.map(label).join(', ')}.`;
		const description = baseDescription ? `${baseDescription} ${opsDescription}` : opsDescription;
		mergedShape[field] = fieldSchema.optional().describe(description);
	}

	return z.object(mergedShape);
}

// ── Runtime Zod conversion ──────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRuntimeZodSchema(schema: any, runtimeZ: RuntimeZod): any {
	const def = schema?._def as any;
	const typeName = def?.typeName as string | undefined;
	let converted: unknown;

	switch (typeName) {
		case 'ZodString': {
			let s = runtimeZ.string();
			for (const check of def.checks ?? []) {
				switch (check.kind) {
					case 'min': s = s.min(check.value); break;
					case 'max': s = s.max(check.value); break;
					case 'email': s = s.email(); break;
					case 'url': s = s.url(); break;
					case 'uuid': s = s.uuid(); break;
					default: break;
				}
			}
			converted = s; break;
		}
		case 'ZodNumber': {
			let n = runtimeZ.number();
			for (const check of def.checks ?? []) {
				switch (check.kind) {
					case 'int': n = n.int(); break;
					case 'min': n = check.inclusive === false ? n.gt(check.value) : n.min(check.value); break;
					case 'max': n = check.inclusive === false ? n.lt(check.value) : n.max(check.value); break;
					default: break;
				}
			}
			converted = n; break;
		}
		case 'ZodBoolean':  converted = runtimeZ.boolean(); break;
		case 'ZodUnknown':  converted = runtimeZ.unknown(); break;
		case 'ZodArray':    converted = runtimeZ.array(toRuntimeZodSchema(def.type, runtimeZ)); break;
		case 'ZodEnum':     converted = runtimeZ.enum(def.values as [string, ...string[]]); break;
		case 'ZodRecord':   converted = runtimeZ.record(toRuntimeZodSchema(def.valueType, runtimeZ)); break;
		case 'ZodObject': {
			const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
			const runtimeShape: Record<string, any> = {};
			for (const [key, value] of Object.entries(shape ?? {})) {
				runtimeShape[key] = toRuntimeZodSchema(value, runtimeZ);
			}
			let obj: any = runtimeZ.object(runtimeShape);
			if (def.unknownKeys === 'passthrough') obj = obj.passthrough();
			if (def.unknownKeys === 'strict') obj = obj.strict();
			converted = obj; break;
		}
		case 'ZodOptional':  converted = toRuntimeZodSchema(def.innerType, runtimeZ).optional(); break;
		case 'ZodNullable':  converted = toRuntimeZodSchema(def.innerType, runtimeZ).nullable(); break;
		case 'ZodDefault':   converted = toRuntimeZodSchema(def.innerType, runtimeZ).default(def.defaultValue()); break;
		case 'ZodLiteral':   converted = runtimeZ.literal(def.value); break;
		case 'ZodUnion':     converted = runtimeZ.union((def.options ?? []).map((o: unknown) => toRuntimeZodSchema(o, runtimeZ))); break;
		default:             converted = runtimeZ.unknown(); break;
	}

	const description = typeof schema?.description === 'string' ? schema.description : undefined;
	if (description && typeof (converted as any).describe === 'function') {
		return (converted as any).describe(description);
	}
	return converted;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

function withRuntimeZod<T>(schemaBuilder: () => T, runtimeZ: RuntimeZod): T {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return toRuntimeZodSchema(schemaBuilder(), runtimeZ) as any;
}

export function getRuntimeSchemaBuilders(runtimeZ: RuntimeZod) {
	return {
		buildUnifiedSchema: (resource: string, operations: string[]) =>
			withRuntimeZod(() => buildUnifiedSchema(resource, operations), runtimeZ),
	};
}

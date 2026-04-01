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
// Converts compile-time Zod schemas to runtime Zod instances.
// Handles both Zod v3 (_def.typeName e.g. 'ZodString') and v4 (_def.type e.g. 'string')
// via dual case labels and check normalization: (check?._zod?.def ?? check).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRuntimeZodSchema(schema: any, runtimeZ: RuntimeZod): any {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const def = schema?._def as any;
	// Zod v4 uses _def.type (e.g. 'string'); Zod v3 uses _def.typeName (e.g. 'ZodString')
	const typeName = (def?.type ?? def?.typeName) as string | undefined;
	let converted: unknown;

	switch (typeName) {
		// ── String ────────────────────────────────────────────────────────
		case 'string':      // Zod v4
		case 'ZodString': { // Zod v3
			let s = runtimeZ.string();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			for (const check of (def.checks ?? []) as Array<any>) {
				// Zod v4: check._zod.def.check  |  Zod v3: check.kind
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const cd = (check?._zod?.def ?? check) as any;
				const kind = (cd?.check ?? cd?.kind) as string | undefined;
				switch (kind) {
					case 'min_length': s = s.min(cd.minimum); break;   // Zod v4
					case 'max_length': s = s.max(cd.maximum); break;   // Zod v4
					case 'min': s = s.min(cd.value); break;            // Zod v3
					case 'max': s = s.max(cd.value); break;            // Zod v3
					case 'email': s = s.email(); break;
					case 'url': s = s.url(); break;
					case 'uuid': s = s.uuid(); break;
					default: break;
				}
			}
			converted = s; break;
		}
		// ── Number ────────────────────────────────────────────────────────
		case 'number':      // Zod v4
		case 'ZodNumber': { // Zod v3
			let n = runtimeZ.number();
			let needsInt = false;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			for (const check of (def.checks ?? []) as Array<any>) {
				// Zod v4 int: ZodNumberFormat check has .isInt === true
				if (check?.isInt === true) { needsInt = true; continue; }
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const cd = (check?._zod?.def ?? check) as any;
				const kind = (cd?.check ?? cd?.kind) as string | undefined;
				switch (kind) {
					case 'int': needsInt = true; break;                                              // Zod v3
					case 'greater_than':                                                              // Zod v4
						n = cd.inclusive ? n.min(cd.value) : n.gt(cd.value); break;
					case 'less_than':                                                                 // Zod v4
						n = cd.inclusive ? n.max(cd.value) : n.lt(cd.value); break;
					case 'min': n = cd.inclusive === false ? n.gt(cd.value) : n.min(cd.value); break; // Zod v3
					case 'max': n = cd.inclusive === false ? n.lt(cd.value) : n.max(cd.value); break; // Zod v3
					default: break;
				}
			}
			if (needsInt) n = n.int();
			converted = n; break;
		}
		// ── Simple types ──────────────────────────────────────────────────
		case 'boolean':  case 'ZodBoolean':  converted = runtimeZ.boolean(); break;
		case 'unknown':  case 'ZodUnknown':  converted = runtimeZ.unknown(); break;
		// ── Array ─────────────────────────────────────────────────────────
		// Zod v4: element at _def.element  |  Zod v3: element at _def.type (a schema, not the string 'array')
		// In v4 def.type is the string 'array', so def.element must be tried first.
		case 'array':    case 'ZodArray':
			converted = runtimeZ.array(toRuntimeZodSchema(def.element ?? def.type, runtimeZ)); break;
		// ── Enum ──────────────────────────────────────────────────────────
		// Zod v4: values at schema.options (array) or _def.entries (object)  |  Zod v3: _def.values
		case 'enum':     case 'ZodEnum': {
			const enumVals: string[] = schema.options ??
				(def.entries ? Object.values(def.entries as Record<string, string>) : undefined) ??
				def.values ?? [];
			converted = runtimeZ.enum(enumVals as [string, ...string[]]);
			break;
		}
		// ── Record ────────────────────────────────────────────────────────
		case 'record':   case 'ZodRecord': {
			const keySchema = def.keyType
				? toRuntimeZodSchema(def.keyType, runtimeZ)
				: runtimeZ.string();
			converted = runtimeZ.record(keySchema, toRuntimeZodSchema(def.valueType, runtimeZ));
			break;
		}
		// ── Object ────────────────────────────────────────────────────────
		case 'object':   case 'ZodObject': {
			// Zod v4: shape is plain object  |  Zod v3: shape is a function
			const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const runtimeShape: Record<string, any> = {};
			for (const [key, value] of Object.entries(shape ?? {})) {
				runtimeShape[key] = toRuntimeZodSchema(value, runtimeZ);
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let obj: any = runtimeZ.object(runtimeShape);
			if (def.unknownKeys === 'passthrough') obj = obj.passthrough();
			if (def.unknownKeys === 'strict') obj = obj.strict();
			converted = obj; break;
		}
		// ── Wrappers ──────────────────────────────────────────────────────
		case 'optional':  case 'ZodOptional':
			converted = toRuntimeZodSchema(def.innerType, runtimeZ).optional(); break;
		case 'nullable':  case 'ZodNullable':
			converted = toRuntimeZodSchema(def.innerType, runtimeZ).nullable(); break;
		case 'default':   case 'ZodDefault':
			// Zod v4: defaultValue is a raw value  |  Zod v3: defaultValue is a function
			converted = toRuntimeZodSchema(def.innerType, runtimeZ).default(
				typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue,
			); break;
		// ── Literal ───────────────────────────────────────────────────────
		// Zod v4: value(s) at _def.values (array)  |  Zod v3: value at _def.value
		case 'literal':  case 'ZodLiteral':
			converted = runtimeZ.literal(Array.isArray(def.values) ? def.values[0] : def.value); break;
		// ── Union ─────────────────────────────────────────────────────────
		case 'union':    case 'ZodUnion':
			converted = runtimeZ.union((def.options ?? []).map((o: unknown) => toRuntimeZodSchema(o, runtimeZ))); break;
		default:         converted = runtimeZ.unknown(); break;
	}

	const description = typeof schema?.description === 'string' ? schema.description : undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if (description && typeof (converted as any).describe === 'function') {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (converted as any).describe(description);
	}
	return converted;
}

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

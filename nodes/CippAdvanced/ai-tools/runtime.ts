// nodes/CippAdvanced/ai-tools/runtime.ts
// Resolves DynamicStructuredTool and Zod from n8n's module tree so instanceof checks pass at runtime.
// NOTE: No value imports from @langchain/core — only runtime resolution via createRequire.
// The DynamicStructuredTool type is defined inline to avoid requiring @langchain/core as a devDep.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: { (id: string): any; resolve(id: string, options?: any): string };

import type { z as ZodNamespace } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicStructuredToolFields = { name: string; description: string; schema: any; func: (params: Record<string, unknown>) => Promise<string> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicStructuredToolCtor = new (fields: DynamicStructuredToolFields) => any;

export type RuntimeZod = typeof ZodNamespace;

/**
 * Anchor candidates — packages in n8n's dependency tree that can serve as
 * a createRequire() anchor to resolve @langchain/core and zod from n8n's
 * module tree (not this package's bundled copies).
 */
const ANCHOR_CANDIDATES = ['@langchain/classic/agents', 'langchain/agents'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRuntimeRequire(): { runtimeReq: any; diagnostic: string | null } {
	const errors: string[] = [];

	for (const anchor of ANCHOR_CANDIDATES) {
		try {
			const anchorPath = require.resolve(anchor) as string;
			// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
			const { createRequire } = require('module') as {
				createRequire: (filename: string) => NodeRequire;
			};
			return { runtimeReq: createRequire(anchorPath), diagnostic: null };
		} catch (e) {
			errors.push(`${anchor}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// All candidates failed — return null so the node can still register,
	// but record a diagnostic for Proxy error messages.
	const diagnostic =
		`[CippAdvancedAiTools] No runtime anchor found. Tried: ${ANCHOR_CANDIDATES.join(', ')}. ` +
		`Errors: ${errors.join(' | ')}`;
	return { runtimeReq: null, diagnostic };
}

const { runtimeReq, diagnostic } = getRuntimeRequire();

// Wrap module-level resolutions so a missing package produces a clear error at
// execution time (via NodeOperationError in supplyData) rather than a cryptic
// module-load crash that prevents node registration entirely.
let _RuntimeDynamicStructuredTool: DynamicStructuredToolCtor | undefined;
let _runtimeZod: RuntimeZod | undefined;

if (runtimeReq) {
	try {
		const coreTools = runtimeReq('@langchain/core/tools') as Record<string, unknown>;
		_RuntimeDynamicStructuredTool = coreTools['DynamicStructuredTool'] as DynamicStructuredToolCtor;
	} catch {
		// Resolution failure surfaces through the Proxy as a NodeOperationError when tools are invoked
	}

	try {
		_runtimeZod = runtimeReq('zod') as RuntimeZod;
	} catch {
		// Resolution failure surfaces through the Proxy as a NodeOperationError when tools are invoked
	}
}

// IMPORTANT: Proxy target MUST be `function () {}`, not `{}`.
// ECMAScript spec §10.5.13: a Proxy only has [[Construct]] if its target does.
// Plain objects lack [[Construct]], so `new Proxy({}, ...)` throws
// "is not a constructor" before the construct trap fires.
export const RuntimeDynamicStructuredTool: DynamicStructuredToolCtor = new Proxy(
	function () {} as unknown as DynamicStructuredToolCtor,
	{
		construct(_target, args) {
			if (!_RuntimeDynamicStructuredTool) {
				throw new Error(
					'RuntimeDynamicStructuredTool: @langchain/core/tools could not be resolved from n8n\'s module tree. ' +
					'Ensure @langchain/core is installed in the n8n environment.' +
					(diagnostic ? ` Diagnostic: ${diagnostic}` : ''),
				);
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return new (_RuntimeDynamicStructuredTool as any)(...args) as object;
		},
		get(_target, prop) {
			if (_RuntimeDynamicStructuredTool) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				return (_RuntimeDynamicStructuredTool as any)[prop];
			}
			return undefined;
		},
	},
) as DynamicStructuredToolCtor;

export const runtimeZod: RuntimeZod = new Proxy({} as RuntimeZod, {
	get(_target, prop) {
		if (!_runtimeZod) {
			// Allow safe structural probes (Symbol.toPrimitive, Symbol.toStringTag, Promise thenable check)
			// without triggering the error — frameworks and inspection utilities may probe these.
			if (typeof prop === 'symbol' || prop === 'then' || prop === 'constructor') return undefined;
			throw new Error(
				`runtimeZod: zod could not be resolved from n8n's module tree (accessing .${String(prop)}). ` +
				'Ensure zod is installed in the n8n environment.' +
				(diagnostic ? ` Diagnostic: ${diagnostic}` : ''),
			);
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (_runtimeZod as any)[prop];
	},
});

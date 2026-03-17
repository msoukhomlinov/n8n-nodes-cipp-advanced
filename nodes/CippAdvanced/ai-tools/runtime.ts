// nodes/CippAdvanced/ai-tools/runtime.ts
// Resolves DynamicStructuredTool and Zod from n8n's module tree so instanceof checks pass at runtime.
// NOTE: No value imports from @langchain/core — only runtime resolution via createRequire.
// The DynamicStructuredTool type is defined inline to avoid requiring @langchain/core as a devDep.
import type { z as ZodNamespace } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicStructuredToolFields = { name: string; description: string; schema: any; func: (params: Record<string, unknown>) => Promise<string> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicStructuredToolCtor = new (fields: DynamicStructuredToolFields) => any;

export type RuntimeZod = typeof ZodNamespace;

const ANCHOR_CANDIDATES = [
	// primary: @langchain/classic is a direct dep of @n8n/nodes-langchain, stable since n8n 2.4.x.
	// Its @langchain/core peerDep resolves to n8n's hoisted @langchain/core.
	'@langchain/classic/agents',
	// secondary: langchain package is in the n8n catalog and also has @langchain/core as peerDep.
	'langchain/agents',
];

// require.resolve() works because n8n loads community nodes within its own module resolution
// context. If future n8n isolates community node resolution, use
// require.resolve(candidate, {paths: [n8nPackagePath]}) option.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @n8n/community-nodes/no-restricted-imports
const { createRequire } = require('module') as { createRequire: (filename: string) => NodeRequire };
let runtimeRequire: NodeRequire | null = null;
const errors: string[] = [];

for (const candidate of ANCHOR_CANDIDATES) {
	try {
		const resolved = require.resolve(candidate);
		runtimeRequire = createRequire(resolved);
		break;
	} catch (e) {
		errors.push(`${candidate}: ${(e as Error).message}`);
	}
}

if (!runtimeRequire) {
	throw new Error(
		`[runtime.ts] Could not resolve LangChain anchor. Tried:\n${errors.join('\n')}\n` +
		`Ensure @n8n/nodes-langchain is installed in n8n's node_modules.`,
	);
}

const coreTools = runtimeRequire('@langchain/core/tools') as Record<string, unknown>;
export const RuntimeDynamicStructuredTool = coreTools[
	'DynamicStructuredTool'
] as DynamicStructuredToolCtor;

export const runtimeZod = runtimeRequire('zod') as RuntimeZod;

const { Server } = require('@modelcontextprotocol/sdk/server');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const server = new Server(
    {
        name: 'neon-test-mcp',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'echo_text',
            description: 'Echoes a text argument.',
            inputSchema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    text: {
                        type: 'string',
                    },
                },
                required: ['text'],
            },
        },
        {
            name: 'read_secret',
            description: 'Returns the MCP_TEST_SECRET env value.',
            inputSchema: {
                type: 'object',
                additionalProperties: false,
                properties: {},
            },
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'echo_text') {
        return {
            content: [
                {
                    type: 'text',
                    text: `echo:${String(request.params.arguments?.text ?? '')}`,
                },
            ],
        };
    }

    if (request.params.name === 'read_secret') {
        return {
            content: [
                {
                    type: 'text',
                    text: String(process.env.MCP_TEST_SECRET ?? ''),
                },
            ],
        };
    }

    return {
        isError: true,
        content: [
            {
                type: 'text',
                text: `unknown tool: ${request.params.name}`,
            },
        ],
    };
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

void main().catch((error) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
});

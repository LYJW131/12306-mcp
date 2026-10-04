#!/usr/bin/env node
import { program } from 'commander';
import { startSseAndStreamableHttpMcpServer } from 'mcp-http-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VERSION, createServerWithTools, ensureData } from './server.js';
program
    .name('mcp-server-12306')
    .description('MCP server for 12306')
    .version(VERSION)
    .option('--host <host>', 'host to bind server to. Default is localhost. Use 0.0.0.0 to bind to all interfaces.')
    .option('--port <port>', 'port to listen on for SSE and HTTP transport.')
    .action(async (options) => {
    try {
        // 启动时预加载 12306 数据，加载失败则直接退出
        await ensureData();
        if (options.port || options.host) {
            await startSseAndStreamableHttpMcpServer({
                host: options.host,
                port: options.port,
                // @ts-ignore
                createMcpServer: async () => createServerWithTools(),
            });
        }
        else {
            const transport = new StdioServerTransport();
            await createServerWithTools().connect(transport);
            console.error('12306 MCP Server running on stdio @Joooook');
        }
    }
    catch (error) {
        console.error('Fatal error in main():', error);
        process.exit(1);
    }
});
program.parse();

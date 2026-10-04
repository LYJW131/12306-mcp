// Cloudflare Workers 入口：无状态 Streamable HTTP，每个请求新建一个 McpServer。
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { VERSION, createServerWithTools } from './server.js';

interface Env {
    // 通过 `wrangler secret put MCP_BEARER_TOKEN` 设置；未设置时拒绝所有 /mcp 请求
    MCP_BEARER_TOKEN?: string;
}

const MCP_PATH = '/mcp';

async function sha256(value: string): Promise<Uint8Array> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(value)
    );
    return new Uint8Array(digest);
}

// 先做哈希再逐字节比较，避免长度和内容上的时序差异
async function tokensEqual(a: string, b: string): Promise<boolean> {
    const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
    let diff = 0;
    for (let i = 0; i < ha.length; i++) {
        diff |= ha[i] ^ hb[i];
    }
    return diff === 0;
}

async function isAuthorized(request: Request, env: Env): Promise<boolean> {
    if (!env.MCP_BEARER_TOKEN) {
        return false;
    }
    const header = request.headers.get('Authorization') ?? '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return false;
    }
    return tokensEqual(match[1].trim(), env.MCP_BEARER_TOKEN);
}

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
    return new Response(
        JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message },
            id: null,
        }),
        { status, headers: { 'Content-Type': 'application/json', ...headers } }
    );
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (url.pathname === '/') {
            return new Response(`12306-mcp ${VERSION}\n`, {
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }
        if (url.pathname !== MCP_PATH) {
            return new Response('Not Found', { status: 404 });
        }
        if (!(await isAuthorized(request, env))) {
            return jsonRpcError(401, 'Unauthorized', {
                'WWW-Authenticate': 'Bearer',
            });
        }
        // 无状态模式下没有会话，不提供 GET 独立流和 DELETE 会话
        if (request.method !== 'POST') {
            return jsonRpcError(405, 'Method not allowed.', { Allow: 'POST' });
        }

        const server = createServerWithTools();
        const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        await server.connect(transport);
        return transport.handleRequest(request);
    },
};

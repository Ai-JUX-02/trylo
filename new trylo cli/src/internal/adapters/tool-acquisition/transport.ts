import { request as httpsRequest } from "node:https";
import { err, ok, type Result } from "../../tooling/contract/result.js";

/**
 * 取字节的那只手，被收在一个可替换的口后面。
 *
 * 接口与实现分开，理由有三条，都不是审美：
 *
 *  - **用例不许联网。** 有了这个口，白名单、重定向、大小上限全部可以用脚本化的
 *    假 transport 摆布，而不必起一个本地 HTTP 服务或真的打 GitHub。
 *  - **这一层是全局唯一对外说话的地方。** 收拢成一个函数之后，「有没有别处偷偷
 *    发请求」变成一次 `grep node:https` 就能回答的问题。
 *  - **策略不在这一层。** 它只回答「这次请求拿到了什么字节」，不判断该不该请求，
 *    也不跟随重定向——跳不跳、跳去哪由 `guard.ts` 说，那里才有白名单。
 */

export type HttpTransportRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** 超时由这一层强制，因为调用方的耐心不该取决于对端。 */
  readonly timeoutMs: number;
  /** 上限随请求下发，让实现在读的过程中就能刹车，而不是读完再丢。 */
  readonly maxBytes: number;
};

export type HttpTransportResponse = {
  readonly status: number;
  /** 3xx 的目标。不跟随：跟随是策略，`guard.ts` 的事。 */
  readonly location?: string;
  readonly body: Uint8Array;
};

export type TransportFailure = "timeout" | "network_failure" | "too_large";

export type HttpTransport = {
  readonly get: (
    request: HttpTransportRequest,
  ) => Promise<Result<HttpTransportResponse, TransportFailure>>;
};

export function createHttpsTransport(): HttpTransport {
  return {
    get: (request) =>
      new Promise<Result<HttpTransportResponse, TransportFailure>>((resolve) => {
        const url = new URL(request.url);
        const options = {
          method: "GET",
          hostname: url.hostname,
          path: `${url.pathname}${url.search}`,
          headers: request.headers,
          ...(url.port === "" ? {} : { port: Number(url.port) }),
        };
        const call = httpsRequest(options, (response) => {
          const chunks: Uint8Array[] = [];
          let total = 0;
          response.on("data", (chunk: Buffer) => {
            total += chunk.length;
            if (total > request.maxBytes) {
              response.destroy();
              resolve(err("too_large", `response exceeds ${request.maxBytes} bytes`));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            const location = response.headers.location;
            resolve(
              ok({
                status: response.statusCode ?? 0,
                ...(location === undefined ? {} : { location }),
                body: Buffer.concat(chunks),
              }),
            );
          });
          response.on("error", () => {
            resolve(err("network_failure", "response stream failed"));
          });
        });
        call.setTimeout(request.timeoutMs, () => {
          call.destroy();
          resolve(err("timeout", `no answer within ${request.timeoutMs}ms`));
        });
        call.on("error", () => {
          resolve(err("network_failure", "request failed"));
        });
        call.end();
      }),
  };
}

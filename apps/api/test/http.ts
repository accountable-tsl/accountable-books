import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';

type RequestOptions = {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
};

export type AppResponse = {
  status: number;
  body: unknown;
  text: string;
  headers: http.IncomingHttpHeaders;
};

/**
 * Drive an Express app over a loopback socket with agent:false.
 * Prefer this over clients that honor HTTP(S)_PROXY / --use-env-proxy.
 */
export async function requestApp(
  app: Express,
  options: RequestOptions,
): Promise<AppResponse> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = server.address() as AddressInfo;
  const body = options.body ?? '';

  try {
    return await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: options.path,
          method: options.method ?? 'GET',
          headers: options.headers,
          agent: false,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let parsed: unknown = text;
            if (text.length > 0) {
              try {
                parsed = JSON.parse(text);
              } catch {
                parsed = text;
              }
            }
            resolve({
              status: res.statusCode ?? 0,
              body: parsed,
              text,
              headers: res.headers,
            });
          });
        },
      );
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

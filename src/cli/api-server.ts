import { createServer } from 'node:http';

import { handleClassifierRequest } from '../server/api-server.js';

function readPort(args: readonly string[]): number {
  const equalsArgument = args.find((argument) => argument.startsWith('--port='));
  const portIndex = args.indexOf('--port');
  const rawPort =
    equalsArgument?.slice('--port='.length) ??
    (portIndex >= 0 ? args[portIndex + 1] : undefined) ??
    process.env['PORT'] ??
    '3000';
  const port = Number.parseInt(rawPort, 10);

  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Invalid port: expected an integer between 1 and 65535');
  }

  return port;
}

const dataRoot = process.env['DATA_ROOT'] || process.cwd();

let port: number;
try {
  port = readPort(process.argv.slice(2));
} catch {
  console.error('[api-server] Invalid port');
  process.exit(1);
}

const server = createServer((req, res) => {
  handleClassifierRequest(req, res, {
    data_root: dataRoot,
    operator_repository_root: process.cwd()
  }).catch(() => {
    console.error('Unhandled server error');
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    if (!res.writableEnded) {
      res.end(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'Unexpected error'
        })
      );
    }
  });
});

server.listen(port, () => {
  console.log('[api-server] ✓ Classifier Export API started');
  console.log(`[api-server]   port      : ${port}`);
  console.log('[api-server]   endpoint  : GET /api/classifier/:source_id/:artifact_id');
  console.log('[api-server]   research  : GET /research/regulatory/ar-es-ecological-agrochemicals');
  console.log('[api-server]   operator  : GET /operator');
  console.log('[api-server]   health    : GET /health');
  console.log(`[api-server]   data_root : ${dataRoot}`);
});

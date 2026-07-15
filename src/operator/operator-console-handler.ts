import type { IncomingMessage, ServerResponse } from "node:http";

import {
  loadRepositoryOperatorReadModel,
  REPOSITORY_OPERATOR_EVALUATED_AT,
} from "./repository-operator-read-model.js";
import {
  OPERATOR_CONSOLE_PATHS,
  renderOperatorConsole,
  renderOperatorInvalidState,
} from "./operator-console.js";

export interface OperatorConsoleOptions {
  readonly repository_root: string;
  readonly load_read_model?: typeof loadRepositoryOperatorReadModel;
}

const sendHtml = (res: ServerResponse, status: number, html: string): void => {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  });
  res.end(html);
};

export async function handleOperatorConsoleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: OperatorConsoleOptions,
): Promise<boolean> {
  const pathname = req.url?.split("?", 1)[0] ?? "";
  if (!pathname.startsWith("/operator")) return false;
  if (req.method !== "GET") {
    res.writeHead(405, { Allow: "GET", "Cache-Control": "no-store" });
    res.end("Method Not Allowed");
    return true;
  }
  if (!OPERATOR_CONSOLE_PATHS.has(pathname)) {
    res.writeHead(404, { "Cache-Control": "no-store" });
    res.end("Not Found");
    return true;
  }
  try {
    const model = await (
      options.load_read_model ?? loadRepositoryOperatorReadModel
    )({
      repository_root: options.repository_root,
      evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
    });
    if (model.system_summary.overall_status === "invalid_state") {
      sendHtml(res, 500, renderOperatorInvalidState());
      return true;
    }
    sendHtml(res, 200, renderOperatorConsole(model, pathname));
  } catch {
    sendHtml(res, 500, renderOperatorInvalidState());
  }
  return true;
}

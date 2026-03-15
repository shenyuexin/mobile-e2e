#!/usr/bin/env node

import { main, toErrorMessage } from "./stdio-server.js";

main().catch((error: unknown) => {
  process.stderr.write(`${toErrorMessage(error)}\n`);
  process.exitCode = 1;
});

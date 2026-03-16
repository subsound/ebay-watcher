function timestamp() {
  return new Date().toISOString();
}

export function log(message) {
  console.log(`[${timestamp()}] ${message}`);
}

export function logError(message, error) {
  const details = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`[${timestamp()}] ${message}\n${details}`);
}

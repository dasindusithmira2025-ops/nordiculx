// Stub for the `server-only` package under Vitest. The real module throws to
// stop server code being bundled for the browser; that guard is meaningless in
// a Node test runner, where importing the module is exactly the point.
export {};

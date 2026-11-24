// TEMPORARY diagnostic for the firebase-admin 14 ERR_REQUIRE_ESM investigation. Delete before merging.
import { createRequire } from 'node:module'

const info: Record<string, unknown> = {
  version: process.version,
  execArgv: process.execArgv,
  nodeOptions: process.env.NODE_OPTIONS,
  requireModuleFeature: (process.features as any).require_module,
  argv0: process.argv[0],
  vercelRuntime: process.env.AWS_EXECUTION_ENV,
  lambdaNodeVersion: process.env.AWS_LAMBDA_JS_RUNTIME,
}
try {
  const req = createRequire('/var/task/node_modules/jwks-rsa/src/utils.js')
  req('jose')
  info.requireJose = 'ok'
} catch (err: any) {
  info.requireJose = `${err.code}: ${err.message}`
}
console.error('RUNTIME_DIAG', JSON.stringify(info))

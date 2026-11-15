const { spawnSync } = require('node:child_process');
const path = require('node:path');
const manifest = require(path.join(process.cwd(), 'package.json'));
const [requested = 'start', ...args] = process.argv.slice(2);
const next = Boolean(manifest.dependencies && manifest.dependencies.next);
const env = {
  ...process.env,
  ...(next ? { NEXT_PUBLIC_DEMO_MODE: 'true' } : { REACT_APP_DEMO_MODE: 'true' }),
};
const binary = next ? require.resolve('next/dist/bin/next') : require.resolve('react-scripts/scripts/start.js');
const command = next
  ? (requested === 'start' ? 'dev' : requested)
  : (requested === 'build' ? require.resolve('react-scripts/scripts/build.js') : binary);
const childArgs = next ? [command, ...args] : requested === 'build' ? [] : args;
const target = requested === 'build' && !next ? command : binary;
const result = spawnSync(process.execPath, [target, ...childArgs], { stdio: 'inherit', env });
process.exit(result.status == null ? 1 : result.status);

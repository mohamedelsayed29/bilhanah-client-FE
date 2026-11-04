import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Repeated local runs would otherwise hit the API's sign-up and login rate limits. */
export default function globalSetup(): void {
  execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'redis', 'sh', '-c', "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli del > /dev/null"],
    { cwd: resolve(import.meta.dirname, '../../../../..'), stdio: 'inherit' },
  );
}

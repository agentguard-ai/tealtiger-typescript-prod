import { main as runPolicyTests } from './test';
import { main as showVersion } from './version';

function showHelp(): void {
  console.log(`TealTiger CLI

Usage:
  tealtiger <command> [options]

Commands:
  test <test-file> [options]  Run policy test suites
  version                     Print SDK and environment diagnostics

Run "tealtiger test --help" for policy test options.`);
}

export function main(): void {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'test':
      process.argv = [process.argv[0], process.argv[1], ...args];
      runPolicyTests();
      return;
    case 'version':
      showVersion();
      return;
    case '--help':
    case '-h':
    case undefined:
      showHelp();
      return;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

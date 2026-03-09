# TealTiger CLI Test Runner

The TealTiger CLI test runner enables automated policy testing for CI/CD integration and local development.

## Installation

```bash
npm install -g tealtiger
```

Or use locally:

```bash
npm install tealtiger
npx tealtiger test <test-file>
```

## Usage

```bash
tealtiger test <test-file> [options]
```

### Options

| Option | Description | Example |
|--------|-------------|---------|
| `--tags <tags>` | Filter tests by tags (comma-separated) | `--tags security,pii` |
| `--watch` | Watch mode for continuous testing | `--watch` |
| `--coverage` | Show coverage report | `--coverage` |
| `--format <format>` | Output format: `json`, `junit`, `console` (default) | `--format junit` |
| `--output <path>` | Output file path for report | `--output report.xml` |
| `--mode <mode>` | Policy mode: `ENFORCE`, `MONITOR`, `REPORT_ONLY` | `--mode MONITOR` |
| `--verbose` | Verbose output | `--verbose` |
| `--help, -h` | Show help message | `--help` |

## Test File Format

Test files are JSON with the following structure:

```json
{
  "name": "Test Suite Name",
  "description": "Optional description",
  "policy": {
    "tools": {
      "file_delete": { "allowed": false }
    },
    "content": {
      "moderation": { "enabled": true }
    }
  },
  "mode": {
    "default": "ENFORCE"
  },
  "tests": [
    {
      "name": "Test case name",
      "description": "Optional description",
      "context": {
        "agentId": "test-agent",
        "action": "tool.execute",
        "tool": "file_delete",
        "context": {
          "correlation_id": "test-001"
        }
      },
      "expected": {
        "action": "DENY",
        "reason_codes": ["TOOL_NOT_ALLOWED"],
        "risk_score_range": {
          "min": 70,
          "max": 100
        }
      },
      "tags": ["security", "tools"]
    }
  ]
}
```

### Test Case Fields

- **name** (required): Test case name
- **description** (optional): Test description
- **context** (required): Request context to test
  - **agentId**: Agent identifier
  - **action**: Action being performed (e.g., `tool.execute`, `chat.create`)
  - **tool**: Tool name (for tool execution)
  - **content**: Content to evaluate (for content moderation)
  - **context**: Execution context with correlation_id
- **expected** (required): Expected decision outcome
  - **action**: Expected action (`ALLOW`, `DENY`, `REDACT`, etc.)
  - **reason_codes**: Expected reason codes (array)
  - **risk_score_range**: Expected risk score range (min/max)
  - **mode**: Expected evaluation mode (optional)
- **tags** (optional): Tags for filtering (array)

## Examples

### Basic Usage

Run tests from a file:

```bash
tealtiger test tests/policies.json
```

### Filter by Tags

Run only tests with specific tags:

```bash
tealtiger test tests/policies.json --tags security,pii
```

### Generate JUnit XML Report

Generate JUnit XML for CI/CD integration:

```bash
tealtiger test tests/policies.json --coverage --format junit --output report.xml
```

### Watch Mode

Watch for file changes and re-run tests automatically:

```bash
tealtiger test tests/policies.json --watch
```

### Override Policy Mode

Override the policy mode for testing:

```bash
tealtiger test tests/policies.json --mode MONITOR
```

### Verbose Output

Show detailed test execution information:

```bash
tealtiger test tests/policies.json --verbose
```

## CI/CD Integration

The CLI exits with a non-zero status code when tests fail, making it suitable for CI/CD pipelines.

### GitHub Actions Example

```yaml
name: Policy Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx tealtiger test tests/policies.json --coverage --format junit --output test-results.xml
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-results
          path: test-results.xml
```

### GitLab CI Example

```yaml
test:
  image: node:18
  script:
    - npm install
    - npx tealtiger test tests/policies.json --coverage --format junit --output test-results.xml
  artifacts:
    when: always
    reports:
      junit: test-results.xml
```

## Output Formats

### Console (Default)

Human-readable output with colored text:

```
Example Policy Test Suite
=========================

✓ Block file deletion (15ms)
✓ Allow file read (12ms)
✗ Detect PII in content (18ms)
  Expected action DENY, got ALLOW

Summary:
  Total:   3
  Passed:  2
  Failed:  1
  Success: 66.7%
  Time:    45ms

Coverage:
  Total policies:  5
  Tested policies: 3
  Coverage:        60.0%
```

### JSON

Machine-readable JSON format:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "suite_name": "Example Policy Test Suite",
  "total": 3,
  "passed": 2,
  "failed": 1,
  "skipped": 0,
  "success_rate": 0.667,
  "total_time": 45,
  "results": [...]
}
```

### JUnit XML

Standard JUnit XML format for CI/CD integration:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Example Policy Test Suite" tests="3" failures="1" time="0.045">
  <testsuite name="Example Policy Test Suite" tests="3" failures="1" time="0.045">
    <testcase name="Block file deletion" time="0.015"/>
    <testcase name="Allow file read" time="0.012"/>
    <testcase name="Detect PII in content" time="0.018">
      <failure message="Expected action DENY, got ALLOW">...</failure>
    </testcase>
  </testsuite>
</testsuites>
```

## Coverage Report

When using `--coverage`, the CLI calculates and displays:

- **Total policies**: Number of policies in configuration
- **Tested policies**: Number of policies covered by tests
- **Coverage percentage**: Percentage of policies tested
- **Untested policies**: List of policies not covered by tests

Example:

```
Coverage:
  Total policies:  10
  Tested policies: 7
  Coverage:        70.0%

  Untested policies:
    - tools.database_write
    - tools.system_command
    - identity.admin_access
```

## Best Practices

1. **Organize tests by feature**: Create separate test files for different policy areas
2. **Use tags**: Tag tests for easy filtering (e.g., `security`, `pii`, `tools`)
3. **Test both positive and negative cases**: Verify both allowed and denied operations
4. **Use starter corpora**: Leverage `TestCorpora` for common security scenarios
5. **Run in CI/CD**: Integrate policy tests into your CI/CD pipeline
6. **Monitor coverage**: Aim for high policy coverage (>80%)
7. **Use watch mode**: Enable watch mode during policy development

## Troubleshooting

### Tests fail with "Invalid test suite"

Ensure your test file has all required fields: `name`, `policy`, and `tests`.

### Tests fail with "Test file not found"

Check that the file path is correct and the file exists.

### Coverage shows 0%

Coverage calculation requires properly structured policy configuration. Ensure your policy object has nested structure.

### Watch mode doesn't detect changes

Watch mode polls files every second. Save the file and wait a moment for detection.

## Related Documentation

- [Policy Test Harness](./POLICY-TESTING.md)
- [Test Corpora](./TEST-CORPORA.md)
- [Policy Configuration](./POLICY-CONFIGURATION.md)
- [CI/CD Integration](./CI-CD-INTEGRATION.md)

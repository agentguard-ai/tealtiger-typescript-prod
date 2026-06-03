import { createLogger, redactLogValue } from '../logger';

describe('logger utilities', () => {
  it('redacts sensitive values before logging', () => {
    const sink = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const logger = createLogger({ sink, debugEnabled: true });

    logger.info('Request received', {
      headers: {
        Authorization: 'Bearer secret-token',
        'X-API-Key': 'sk_live_1234567890123456',
      },
      nested: {
        token: 'xoxb-1234567890-ABCDEF',
      },
    });

    expect(sink.log).toHaveBeenCalledWith('Request received', {
      headers: {
        Authorization: '[REDACTED]',
        'X-API-Key': '[REDACTED]',
      },
      nested: {
        token: '[REDACTED]',
      },
    });
  });

  it('suppresses debug output when disabled', () => {
    const sink = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    const logger = createLogger({ sink, debugEnabled: false });

    logger.debug('Hidden message', { apiKey: 'sk_live_1234567890123456' });

    expect(sink.log).not.toHaveBeenCalled();
    expect(sink.debug).not.toHaveBeenCalled();
  });

  it('redacts bearer tokens in raw strings', () => {
    expect(redactLogValue('Authorization: Bearer secret-token')).toBe(
      'Authorization: Bearer [REDACTED]'
    );
  });
});
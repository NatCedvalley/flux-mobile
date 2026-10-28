import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CrashErrorHandler } from './crash-error-handler';
import { CrashReportingService } from './crash-reporting.service';

describe('CrashErrorHandler', () => {
  let record: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    record = vi.fn().mockResolvedValue(undefined);
    log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: ErrorHandler, useClass: CrashErrorHandler },
        { provide: CrashReportingService, useValue: { record } },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('logs the error and records it', () => {
    const error = new Error('boom');

    TestBed.inject(ErrorHandler).handleError(error);

    expect(log).toHaveBeenCalledWith('ERROR', error);
    expect(record).toHaveBeenCalledWith(error);
  });

  it('keeps going when the reporter cannot be created', () => {
    TestBed.overrideProvider(CrashReportingService, {
      useFactory: () => {
        throw new Error('no reporter');
      },
    });

    expect(() =>
      TestBed.inject(ErrorHandler).handleError(new Error('boom'))
    ).not.toThrow();
    expect(log).toHaveBeenCalledWith(
      'Recording an error failed',
      expect.any(Error)
    );
  });
});

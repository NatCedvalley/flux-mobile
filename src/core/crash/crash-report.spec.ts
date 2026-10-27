import { crashKeys, exceptionReport, stackFrames } from './crash-report';

describe('stackFrames', () => {
  it('reads a V8 stack, as on Android', () => {
    const stack = [
      'TypeError: Cannot read properties of undefined',
      '    at Ab.load (https://localhost/main-4KX2.js:1:20345)',
      '    at async https://localhost/chunk-QW7E.js:1:812',
    ].join('\n');

    expect(stackFrames(stack)).toEqual([
      {
        functionName: 'Ab.load (column 20345)',
        fileName: 'main-4KX2.js',
        lineNumber: 1,
      },
      {
        functionName: '<anonymous> (column 812)',
        fileName: 'chunk-QW7E.js',
        lineNumber: 1,
      },
    ]);
  });

  it('reads a JavaScriptCore stack, as on iOS', () => {
    const stack = [
      'load@capacitor://localhost/main-4KX2.js:1:20345',
      '@capacitor://localhost/chunk-QW7E.js:2:812',
      '[native code]',
    ].join('\n');

    expect(stackFrames(stack)).toEqual([
      {
        functionName: 'load (column 20345)',
        fileName: 'main-4KX2.js',
        lineNumber: 1,
      },
      {
        functionName: '<anonymous> (column 812)',
        fileName: 'chunk-QW7E.js',
        lineNumber: 2,
      },
    ]);
  });

  it('skips lines that are not frames', () => {
    expect(stackFrames('Error: boom\n    at <anonymous>')).toEqual([]);
    expect(stackFrames('')).toEqual([]);
  });
});

describe('exceptionReport', () => {
  it('names an Error and keeps its frames', () => {
    const error = new RangeError('Out of range');
    error.stack =
      'RangeError: Out of range\n    at f (https://localhost/a.js:3:4)';

    expect(exceptionReport(error)).toEqual({
      message: 'RangeError: Out of range',
      stacktrace: [
        { functionName: 'f (column 4)', fileName: 'a.js', lineNumber: 3 },
      ],
    });
  });

  it('copes with an Error that has no stack', () => {
    const error = new Error('No stack');
    error.stack = undefined;

    expect(exceptionReport(error)).toEqual({
      message: 'Error: No stack',
      stacktrace: [],
    });
  });

  it('turns anything else thrown into its text', () => {
    expect(exceptionReport('plain string')).toEqual({
      message: 'plain string',
      stacktrace: [],
    });
    expect(exceptionReport({ status: 0 })).toEqual({
      message: '[object Object]',
      stacktrace: [],
    });
  });
});

describe('crashKeys', () => {
  it('sends each part of the build as a string key', () => {
    expect(
      crashKeys({
        environment: 'prod',
        version: '0.0.1',
        build: '42',
        commit: 'ee5d92f',
      })
    ).toEqual([
      { key: 'environment', value: 'prod', type: 'string' },
      { key: 'version', value: '0.0.1', type: 'string' },
      { key: 'build', value: '42', type: 'string' },
      { key: 'commit', value: 'ee5d92f', type: 'string' },
    ]);
  });
});

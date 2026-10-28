/** One frame of a JS error's stack, in the shape Crashlytics records. */
export type CrashStackFrame = {
  functionName: string;
  fileName: string;
  lineNumber: number;
};

/** A custom key attached to every report. */
export type CrashKey = {
  key: string;
  value: string;
  type: 'string';
};

/** What `recordException` is sent for a JS error. */
export type ExceptionReport = {
  message: string;
  stacktrace: CrashStackFrame[];
};

/** V8 (Android's WebView): `    at fn (https://localhost/main.js:1:2345)`. */
const V8_FRAME = /^\s*at (?:async )?(?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
/** JavaScriptCore (iOS): `fn@capacitor://localhost/main.js:1:2345`. */
const JSC_FRAME = /^(.*?)@(.+?):(\d+):(\d+)$/;
/** The WebView's origin, the same on every phone, so it's left out. */
const ORIGIN = /^[a-z]+:\/\/[^/]+\//;

/**
 * A JS error as Crashlytics records it: `Name: message`, and its stack as
 * frames. The bundles are minified onto very few lines, so each frame's
 * function name carries its column, the part that finds the code.
 */
export function exceptionReport(error: unknown): ExceptionReport {
  if (!(error instanceof Error)) {
    return { message: String(error), stacktrace: [] };
  }
  return {
    message: `${error.name}: ${error.message}`,
    stacktrace: stackFrames(error.stack ?? ''),
  };
}

/** The frames of a V8 or JavaScriptCore stack; other lines are skipped. */
export function stackFrames(stack: string): CrashStackFrame[] {
  const frames: CrashStackFrame[] = [];
  for (const line of stack.split('\n')) {
    const match = V8_FRAME.exec(line) ?? JSC_FRAME.exec(line.trim());
    if (!match) {
      continue;
    }
    const [, name, file, lineNumber, column] = match;
    frames.push({
      functionName: `${name || '<anonymous>'} (column ${column})`,
      fileName: file.replace(ORIGIN, ''),
      lineNumber: Number(lineNumber),
    });
  }
  return frames;
}

/** The build a report came from, as custom keys. */
export function crashKeys(build: {
  environment: string;
  version: string;
  build: string;
  commit: string;
}): CrashKey[] {
  return Object.entries(build).map(([key, value]) => ({
    key,
    value,
    type: 'string',
  }));
}

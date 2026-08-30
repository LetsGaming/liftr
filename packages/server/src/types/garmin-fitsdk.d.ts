/**
 * Ambient declaration for `@garmin/fitsdk`. The package ships its own `.d.ts` files, but they
 * use extensionless relative imports (invalid ESM) that TS's NodeNext resolution — required
 * elsewhere in this package — can't follow, so the real exports silently fail to resolve.
 * Declaring just the surface `fit.ts` actually uses sidesteps that rather than fighting the
 * package's module resolution setup.
 */
declare module "@garmin/fitsdk" {
  export class Stream {
    static fromBuffer(buffer: Buffer): Stream;
  }

  export class Decoder {
    constructor(stream: Stream);
    isFIT(): boolean;
    checkIntegrity(): boolean;
    read(): { messages: Record<string, unknown[] | undefined>; errors: string[] };
  }
}

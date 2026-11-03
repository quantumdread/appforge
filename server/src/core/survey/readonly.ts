import type { AnalysisSnapshot } from '../snapshot.js';

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepReadonly<U>>
  : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;

export type ReadonlySnapshot = DeepReadonly<AnalysisSnapshot>;

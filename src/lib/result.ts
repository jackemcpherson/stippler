export interface Ok<T> {
  readonly success: true;
  readonly data: T;
}

export interface Err<E> {
  readonly success: false;
  readonly error: E;
}

export type Result<T, E = Error> = Ok<T> | Err<E>;

export function ok<T>(data: T): Ok<T> {
  return { success: true, data };
}

export function err<E>(error: E): Err<E> {
  return { success: false, error };
}

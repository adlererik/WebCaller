/* tslint:disable */
/* eslint-disable */
/**
 * Request/response serialization is an adapter boundary, never a new cipher.
 * JS must wrap returned account/session state and commit it atomically.
 */
export function dispatch(input: string): string;

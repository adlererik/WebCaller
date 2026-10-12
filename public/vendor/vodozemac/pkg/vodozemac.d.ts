/* tslint:disable */
/* eslint-disable */
export enum GroupSessionVersion {
  V1 = 0,
  V2 = 1,
}
export enum SessionConfigVersion {
  V1 = 0,
  V2 = 1,
}
export class Account {
  free(): void;
  constructor();
  static from_pickle(pickle: string, pickle_key: Uint8Array): Account;
  static from_libolm_pickle(pickle: string, pickle_key: Uint8Array): Account;
  pickle(pickle_key: Uint8Array): string;
  pickle_libolm(pickle_key: Uint8Array): string;
  sign(message: string): string;
  generate_one_time_keys(count: number): OneTimeKeyGenerationResult;
  generate_fallback_key(): void;
  mark_keys_as_published(): void;
  create_outbound_session(identity_key: string, one_time_key: string, session_version: SessionConfigVersion): Session;
  create_inbound_session(identity_key: string, message: OlmMessage): InboundCreationResult;
  readonly ed25519_key: string;
  readonly curve25519_key: string;
  readonly max_number_of_one_time_keys: number;
  readonly one_time_keys: any;
  readonly fallback_key: any;
}
export class DecryptedMessage {
  private constructor();
  free(): void;
  plaintext: string;
  message_index: number;
}
export class EstablishedSas {
  private constructor();
  free(): void;
  bytes(info: string): SasBytes;
  calculate_mac(input: string, info: string): string;
  calculate_mac_invalid_base64(input: string, info: string): string;
  verify_mac(input: string, info: string, tag: string): void;
}
export class GroupSession {
  free(): void;
  constructor(version: GroupSessionVersion);
  encrypt(plaintext: string): string;
  pickle(pickle_key: Uint8Array): string;
  static from_pickle(pickle: string, pickle_key: Uint8Array): GroupSession;
  static from_libolm_pickle(pickle: string, pickle_key: Uint8Array): GroupSession;
  readonly session_id: string;
  readonly session_key: string;
  readonly message_index: number;
}
export class InboundCreationResult {
  private constructor();
  free(): void;
  readonly session: Session;
  readonly plaintext: string;
}
export class InboundGroupSession {
  free(): void;
  constructor(session_key: string, group_session_version: GroupSessionVersion);
  static import(session_key: string, group_session_version: GroupSessionVersion): InboundGroupSession;
  export_at(index: number): string | undefined;
  decrypt(ciphertext: string): DecryptedMessage;
  pickle(pickle_key: Uint8Array): string;
  static from_pickle(pickle: string, pickle_key: Uint8Array): InboundGroupSession;
  static from_libolm_pickle(pickle: string, pickle_key: Uint8Array): InboundGroupSession;
  readonly session_id: string;
  readonly first_known_index: number;
}
export class OlmMessage {
  free(): void;
  constructor(message_type: number, ciphertext: Uint8Array);
  ciphertext: Uint8Array;
  message_type: number;
}
export class OneTimeKeyGenerationResult {
  private constructor();
  free(): void;
  readonly created: string[];
  readonly removed: string[];
}
export class Sas {
  free(): void;
  constructor();
  diffie_hellman(key: string): EstablishedSas;
  readonly public_key: string;
}
export class SasBytes {
  private constructor();
  free(): void;
  readonly emoji_indices: Uint8Array;
  readonly decimals: Uint16Array;
}
export class Session {
  private constructor();
  free(): void;
  pickle(pickle_key: Uint8Array): string;
  static from_pickle(pickle: string, pickle_key: Uint8Array): Session;
  static from_libolm_pickle(pickle: string, pickle_key: Uint8Array): Session;
  session_matches(message: OlmMessage): boolean;
  encrypt(plaintext: string): OlmMessage;
  decrypt(message: OlmMessage): string;
  readonly session_id: string;
}

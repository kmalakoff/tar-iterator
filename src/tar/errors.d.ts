/**
 * TAR Error Codes for programmatic error handling
 *
 * Node 0.8 compatible - uses let and object literals.
 */
/**
 * Error with a code property for programmatic handling
 */
export interface TarCodedError extends Error {
  code: string;
}
/**
 * TAR-specific error codes for user-facing errors
 */
export declare const TarErrorCode: {
  /** Invalid tar header checksum - archive may be corrupted or needs decompression */
  INVALID_CHECKSUM: string;
  /** Unknown tar format - not USTAR, GNU, or V7 */
  INVALID_FORMAT: string;
};
/**
 * Create an error with a code property
 *
 * @param message - Human-readable error message
 * @param code - Error code from TarErrorCode
 * @returns Error with code property
 */
export declare function createTarError(message: string, code: string): TarCodedError;

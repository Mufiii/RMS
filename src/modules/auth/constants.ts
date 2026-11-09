export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt only uses a password's first 72 bytes; longer inputs would silently collide. */
export const PASSWORD_MAX_LENGTH = 72;

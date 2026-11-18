import "next-auth/jwt";

declare module "next-auth/jwt" {
  interface JWT {
    /** The app user's id (users.id). */
    userId?: string;
    /** When the account was last confirmed active, in ms since epoch. */
    checkedAt?: number;
  }
}

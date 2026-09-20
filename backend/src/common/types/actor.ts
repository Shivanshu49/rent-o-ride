/** Who is making the request. Attached by JwtAuthGuard (Phase 2), and the
 *  only thing repositories are allowed to scope their queries by. */
export interface AuthActor {
  readonly id: string;
  readonly role: 'RENTER' | 'OWNER' | 'ADMIN';
  readonly kycStatus: 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED';
}

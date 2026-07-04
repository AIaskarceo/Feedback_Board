// TODO: Dev A's requireAuth/requireAdmin middleware will populate these once
// merged — confirm the property names/shape match this declaration and
// update if they differ.
declare namespace Express {
  export interface Request {
    userId: string;
    userRole: 'member' | 'admin';
  }
}

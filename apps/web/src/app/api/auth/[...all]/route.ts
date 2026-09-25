import { auth } from '@/lib/auth';

// Better Auth's endpoints: the Google redirect, its callback, the session, sign-out.
export const GET = (request: Request) => auth().handler(request);
export const POST = (request: Request) => auth().handler(request);

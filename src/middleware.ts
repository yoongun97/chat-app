import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAuth = !!token;
    const isAuthPage = req.nextUrl.pathname === "/";
    const isProtectedRoute = req.nextUrl.pathname.startsWith("/chat");

    if (isAuthPage) {
      if (isAuth) {
        return NextResponse.redirect(new URL("/chat", req.url));
      }
      return NextResponse.next();
    }

    if (!isAuth && isProtectedRoute) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => true, // We'll handle the auth check in the middleware function
    },
  }
);

export const config = {
  matcher: ["/", "/chat/:path*"],
}; 
import { NextResponse, type NextRequest } from "next/server";

const REDIRECT_HOSTS = new Set(["notteco.com", "www.notteco.com"]);

export function middleware(request: NextRequest) {
  const hostHeader = request.headers.get("host");

  if (!hostHeader) {
    return NextResponse.next();
  }

  const hostname = hostHeader.split(":")[0].toLowerCase();

  if (!REDIRECT_HOSTS.has(hostname)) {
    return NextResponse.next();
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.hostname = "app.notteco.com";
  redirectUrl.protocol = "https";
  redirectUrl.port = "";

  return NextResponse.redirect(redirectUrl, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};

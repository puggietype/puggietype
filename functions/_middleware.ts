// Redirect www.puggietype.com -> apex (Pages _redirects can't match on host).
export const onRequest = async (ctx: {
  request: Request;
  next: () => Promise<Response>;
}): Promise<Response> => {
  const url = new URL(ctx.request.url);
  if (url.hostname === "www.puggietype.com") {
    url.hostname = "puggietype.com";
    url.protocol = "https:";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }
  return ctx.next();
};

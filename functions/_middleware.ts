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
  // HSTS on everything the function serves too (robots.txt etc.), so an edge
  // copy cached without _headers can't drop it
  const res = await ctx.next();
  const out = new Response(res.body, res);
  out.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  return out;
};

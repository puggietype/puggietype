/**
 * Cloudflare's Email Address Obfuscation rewrites addresses in served html into
 * /cdn-cgi/l/email-protection links (a 404 for crawlers) unless they sit
 * between these comments.
 */
export const EMAIL_OFF = "<!--email_off-->";
export const EMAIL_ON = "<!--/email_off-->";

/** html-minifier-terser's default kept comments, plus the email_off markers */
export const KEEP_COMMENTS = [/^!/, /^\s*#/, /^\/?email_off$/];

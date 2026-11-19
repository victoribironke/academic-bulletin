import { SITE_URL } from "@/lib/site-config";

/**
 * The www address reaches the same Railway service as the main one, but
 * sign-in only works on the main address (AUTH_URL): its cookies belong to
 * that host. So a request that arrives on www goes to the same page on the
 * main address.
 *
 * Returns the address to send the visitor to, or null to carry on. Only
 * www.<main host> is redirected, and always to SITE_URL, so a forged Host
 * header can't turn this into a redirect to another site.
 */
export function wwwRedirectTarget(
  hosts: (string | null | undefined)[],
  pathAndQuery: string,
  siteUrl: string = SITE_URL,
): string | null {
  const main = new URL(siteUrl);
  const www = `www.${main.host}`;
  const arrivedOnWww = hosts.some(
    (host) => host?.split(",")[0].trim().toLowerCase() === www,
  );
  if (!arrivedOnWww) return null;
  // Only the path and query are copied onto the main address. Resolving the
  // path as a URL instead would read "//other.site/x" as another host.
  const target = new URL(main.origin);
  const queryStart = pathAndQuery.indexOf("?");
  target.pathname =
    queryStart === -1 ? pathAndQuery : pathAndQuery.slice(0, queryStart);
  target.search = queryStart === -1 ? "" : pathAndQuery.slice(queryStart);
  return target.href;
}

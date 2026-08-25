import axios, { AxiosHeaders, type AxiosRequestConfig, type AxiosResponse } from "axios";
import { sendMessage } from "@/messages.ts";

type TSafariRequestConfig = AxiosRequestConfig & {
  ptdSafariCookieCount?: number;
  ptdSafariCookieSource?: string;
};

export function shouldUseSafariTabRequest(axiosConfig: AxiosRequestConfig): boolean {
  const safariConfig = axiosConfig as TSafariRequestConfig;
  const method = (axiosConfig.method ?? "GET").toUpperCase();
  return safariConfig.ptdSafariCookieCount === 0 && (method === "GET" || method === "HEAD");
}

export async function executeSafariTabRequest<T>(axiosConfig: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  const method = (axiosConfig.method ?? "GET").toUpperCase() as "GET" | "HEAD";
  const headers: Record<string, string> = {};
  for (const [name, value] of AxiosHeaders.from(axiosConfig.headers as any)) {
    if (!/^(cookie|host|origin|referer|user-agent|sec-|proxy-)/i.test(name)) {
      headers[name] = String(value);
    }
  }

  const response = await sendMessage("safariTabRequest", {
    url: axios.getUri(axiosConfig),
    method,
    headers,
    timeout: axiosConfig.timeout,
  });
  const responseHeaders = AxiosHeaders.from(response.headers);
  const responseType = axiosConfig.responseType;
  let data: unknown = response.body;

  if (responseType === "document") {
    data = new DOMParser().parseFromString(response.body, "text/html");
  } else if (
    responseType === "json" ||
    (!responseType && /application\/json/i.test(String(responseHeaders.get("content-type") ?? "")))
  ) {
    data = response.body ? JSON.parse(response.body) : null;
  }

  const safariConfig = axiosConfig as TSafariRequestConfig;
  safariConfig.ptdSafariCookieSource = `${safariConfig.ptdSafariCookieSource ?? ""}/relay=tab`.replace(/^\//, "");

  return {
    data: data as T,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    config: axiosConfig as any,
    request: {
      responseType: responseType ?? "",
      responseURL: response.finalUrl,
      responseText: response.body,
      responseXML: responseType === "document" ? data : null,
    },
  };
}

function cookieMatchesUrl(cookie: chrome.cookies.Cookie, requestUrl: URL): boolean {
  const cookieDomain = cookie.domain.replace(/^\./, "").toLowerCase();
  const requestHost = requestUrl.hostname.toLowerCase();
  const domainMatches = cookie.hostOnly
    ? requestHost === cookieDomain
    : requestHost === cookieDomain || requestHost.endsWith(`.${cookieDomain}`);

  if (!domainMatches || (cookie.secure && requestUrl.protocol !== "https:")) return false;
  if (cookie.expirationDate && cookie.expirationDate <= Date.now() / 1000) return false;

  const cookiePath = cookie.path || "/";
  return (
    requestUrl.pathname === cookiePath ||
    requestUrl.pathname.startsWith(cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`)
  );
}

function uniqueCookies(cookies: chrome.cookies.Cookie[]): chrome.cookies.Cookie[] {
  const seen = new Set<string>();
  return cookies.filter((cookie) => {
    const partitionKey = cookie.partitionKey?.topLevelSite ?? "";
    const key = [cookie.storeId, partitionKey, cookie.domain, cookie.path, cookie.name].join("\n");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function applySafariRequestCookies(axiosConfig: AxiosRequestConfig): Promise<void> {
  const requestUrl = axios.getUri(axiosConfig);
  const parsedRequestUrl = new URL(requestUrl);
  const diagnostics: string[] = [];

  let cookies: chrome.cookies.Cookie[] = [];
  try {
    cookies = await chrome.cookies.getAll({ url: requestUrl });
    diagnostics.push(`url=${cookies.length}`);

    // Safari can return no cookies for a URL query while still exposing the
    // same cookies through a domain or unfiltered query.
    if (cookies.length === 0) {
      cookies = await chrome.cookies.getAll({ domain: parsedRequestUrl.hostname });
      diagnostics.push(`domain=${cookies.length}`);
    }
    if (cookies.length === 0) {
      cookies = await chrome.cookies.getAll({});
      diagnostics.push(`all=${cookies.length}`);
    }
  } catch (error) {
    diagnostics.push(`error=${error instanceof Error ? error.message : String(error)}`);
  }

  cookies = uniqueCookies(cookies.filter((cookie) => cookieMatchesUrl(cookie, parsedRequestUrl)));
  const safariConfig = axiosConfig as TSafariRequestConfig;
  safariConfig.ptdSafariCookieCount = cookies.length;
  safariConfig.ptdSafariCookieSource = diagnostics.join("/");
  if (cookies.length === 0) return;

  const cookieHeader = cookies
    .sort((left, right) => right.path.length - left.path.length)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  const headers = AxiosHeaders.from(axiosConfig.headers as any);
  headers.set("Cookie", cookieHeader);
  axiosConfig.headers = headers;
}

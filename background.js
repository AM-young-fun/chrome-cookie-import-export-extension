const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function responseOk(data) {
  return { ok: true, data };
}

function responseError(error) {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

function normalizeDomain(domain) {
  return String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.$/, "");
}

function isDomainMatch(activeHostname, cookieDomain) {
  const active = normalizeDomain(activeHostname);
  const exported = normalizeDomain(cookieDomain);
  return Boolean(active && exported && (active === exported || active.endsWith(`.${exported}`) || exported.endsWith(`.${active}`)));
}

function isSourceDomainMatch(activeHostname, sourceDomain) {
  const active = normalizeDomain(activeHostname);
  const source = normalizeDomain(sourceDomain);
  return Boolean(active && source && (active === source || active.endsWith(`.${source}`)));
}

async function getCurrentSite() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.url) {
    throw new Error("无法读取当前标签页地址。");
  }

  const url = new URL(tab.url);
  if (!HTTP_PROTOCOLS.has(url.protocol)) {
    throw new Error("请先打开普通网站（http 或 https），当前页面不支持 Cookie 操作。");
  }

  return {
    tabId: tab.id,
    url: url.href,
    protocol: url.protocol,
    hostname: normalizeDomain(url.hostname),
    host: url.host,
    title: tab.title || ""
  };
}

function serializableCookie(cookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    session: cookie.session,
    expirationDate: cookie.expirationDate,
    hostOnly: cookie.hostOnly,
    storeId: cookie.storeId,
    ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {})
  };
}

async function exportCookies() {
  const site = await getCurrentSite();
  const cookies = (await chrome.cookies.getAll({ domain: site.hostname }))
    .filter((cookie) => isDomainMatch(site.hostname, cookie.domain));
  return {
    format: "chrome-cookie-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    domain: site.hostname,
    sourceUrl: site.url,
    cookies: cookies.map(serializableCookie)
  };
}

function cookieUrl(cookie, site) {
  const protocol = cookie.secure ? "https:" : site.protocol;
  const path = typeof cookie.path === "string" && cookie.path.startsWith("/") ? cookie.path : "/";
  return `${protocol}//${site.host}${path}`;
}

function validSameSite(value) {
  return new Set(["unspecified", "no_restriction", "lax", "strict"]).has(value) ? value : "unspecified";
}

async function importCookies(payload) {
  const site = await getCurrentSite();
  const normalizedPayload = Array.isArray(payload) ? { cookies: payload } : payload;
  if (!normalizedPayload || typeof normalizedPayload !== "object" || !Array.isArray(normalizedPayload.cookies)) {
    throw new Error("文件格式不正确：缺少 cookies 数组。");
  }
  if (normalizedPayload.cookies.length > 5000) {
    throw new Error("文件中的 Cookie 数量过多，最多支持 5000 条。");
  }
  if (normalizedPayload.domain && !isSourceDomainMatch(site.hostname, normalizedPayload.domain)) {
    throw new Error(`域名不匹配：文件来自 ${normalizedPayload.domain}，当前页面是 ${site.hostname}。请先打开同一网站域名。`);
  }

  let imported = 0;
  const errors = [];
  for (const [index, cookie] of normalizedPayload.cookies.entries()) {
    try {
      if (!cookie || typeof cookie.name !== "string" || typeof cookie.value !== "string") {
        throw new Error("缺少 name 或 value");
      }
      const domain = typeof cookie.domain === "string" ? cookie.domain : "";
      if (domain && !isDomainMatch(site.hostname, domain)) {
        throw new Error(`Cookie 域名 ${domain} 与当前页面不匹配`);
      }
      const details = {
        url: cookieUrl(cookie, site),
        name: cookie.name,
        value: cookie.value,
        path: typeof cookie.path === "string" && cookie.path.startsWith("/") ? cookie.path : "/",
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.httpOnly),
        sameSite: validSameSite(cookie.sameSite),
        ...(cookie.hostOnly ? {} : (domain ? { domain } : {})),
        ...(Number.isFinite(cookie.expirationDate) && cookie.expirationDate > 0 && !cookie.session
          ? { expirationDate: cookie.expirationDate }
          : {}),
        ...(typeof cookie.storeId === "string" ? { storeId: cookie.storeId } : {}),
        ...(cookie.partitionKey && typeof cookie.partitionKey === "object" ? { partitionKey: cookie.partitionKey } : {})
      };
      if (details.sameSite === "no_restriction") {
        details.secure = true;
      }
      const result = await chrome.cookies.set(details);
      if (!result) {
        throw new Error("浏览器拒绝写入");
      }
      imported += 1;
    } catch (error) {
      errors.push({ index: index + 1, name: cookie?.name || "(未知)", error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { imported, total: normalizedPayload.cookies.length, failed: errors.length, errors };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "getCurrentSite":
        return responseOk(await getCurrentSite());
      case "exportCookies":
        return responseOk(await exportCookies());
      case "importCookies":
        return responseOk(await importCookies(message.payload));
      default:
        throw new Error("未知操作。");
    }
  })()
    .then(sendResponse)
    .catch((error) => sendResponse(responseError(error)));
  return true;
});

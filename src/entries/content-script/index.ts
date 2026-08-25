// This file is the entry point for the content script

import { getHostFromUrl } from "@ptd/site";
import { socialPageParserMatchesMap } from "@ptd/social";

import { sendMessage } from "@/messages.ts";
import type { ISafariTabRequest, ISafariTabResponse } from "@/messages.ts";
import type { IMetadataPiniaStorageSchema } from "@/shared/types/storages/metadata.ts";
import type { IConfigPiniaStorageSchema } from "@/shared/types/storages/config.ts";

import { mountApp } from "./app/init.ts";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ptd:safari-tab-probe") {
    sendResponse({ origin: window.location.origin });
    return;
  }

  if (message?.type !== "ptd:safari-tab-request") return;

  const request = message.data as ISafariTabRequest;
  if (new URL(request.url).origin !== window.location.origin) {
    sendResponse({ ok: false, notMatch: true });
    return;
  }

  fetch(request.url, {
    method: request.method,
    headers: request.headers,
    credentials: "include",
    redirect: "follow",
  })
    .then(async (response) => {
      const result: ISafariTabResponse = {
        body: request.method === "HEAD" ? "" : await response.text(),
        finalUrl: response.url,
        headers: Object.fromEntries(response.headers.entries()),
        status: response.status,
        statusText: response.statusText,
      };
      sendResponse({ ok: true, result });
    })
    .catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });

  return true;
});

sendMessage("getExtStorage", "config").then(async (data) => {
  const configStore = data as IConfigPiniaStorageSchema;

  if (configStore?.contentScript?.enabled ?? true) {
    if (configStore?.contentScript?.enabledAtSocialSite ?? true) {
      for (const [socialSite, patternMatches] of Object.entries(socialPageParserMatchesMap)) {
        for (const [pattern, _] of patternMatches) {
          if (new RegExp(pattern, "i").test(window.location.href)) {
            console.debug(`[PTD] Social site detected: ${socialSite}, loading app...`);
            mountApp(document, { socialSite });
            return; // 找到匹配的 social site 后，直接加载应用并退出
          }
        }
      }
    }

    sendMessage("getExtStorage", "metadata").then(async (data) => {
      const metadataStore = data as IMetadataPiniaStorageSchema; // 假设 metadataStore 的类型是 any

      const host = getHostFromUrl(window.location.href); // 获取当前页面的 host

      if (metadataStore.siteHostMap[host]) {
        // 如果当前页面的 host 在 metadataStore 中有对应的 siteId，加载 app
        const siteId = metadataStore.siteHostMap[host];

        if (
          configStore?.contentScript?.allowExceptionSites === true &&
          metadataStore.sites[siteId]?.allowContentScript === false
        ) {
          console.debug(`[PTD] Content script is disabled for site: ${siteId}`);
          return; // 如果允许排除站点，且站点配置中禁用了 contentScript，则不加载应用
        }

        console.debug(`[PTD] host found for site: ${siteId}, loading app...`);
        mountApp(document, { siteId });
      }
    });
  }
});

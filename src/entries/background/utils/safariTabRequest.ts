import { onMessage } from "@/messages.ts";
import type { ISafariTabRequest, ISafariTabResponse } from "@/messages.ts";

interface ISafariRawResponse {
  ok: boolean;
  result?: ISafariTabResponse;
  error?: string;
}

interface ITemporaryTab {
  tabId: number;
  closeTimer?: ReturnType<typeof globalThis.setTimeout>;
}

const temporaryTabs = new Map<string, ITemporaryTab>();
const TEMPORARY_TAB_READY_TIMEOUT = 15_000;
const TEMPORARY_TAB_IDLE_TIMEOUT = 5_000;

// Safari can drop or reorder concurrent tabs.sendMessage responses. Keep the
// complete probe-and-fetch exchange serialized so batch refreshes behave like
// repeated successful single-site refreshes.
let requestTail: Promise<void> = Promise.resolve();

function enqueueRequest<T>(task: () => Promise<T>): Promise<T> {
  const result = requestTail.then(task, task);
  requestTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function withTimeout<T>(promise: Promise<T>, timeout: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(message)), timeout);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function probeTabOrigin(tabId: number): Promise<string | undefined> {
  try {
    const response = await withTimeout(
      chrome.tabs.sendMessage(tabId, { type: "ptd:safari-tab-probe" }),
      1000,
      "Tab probe timed out",
    );
    return typeof response?.origin === "string" ? response.origin : undefined;
  } catch {
    return undefined;
  }
}

async function findSiteTab(requestOrigin: string): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({});
  const candidates = tabs.filter((tab) => {
    if (typeof tab.id !== "number") return false;
    try {
      return typeof tab.url === "string" && new URL(tab.url).origin === requestOrigin;
    } catch {
      return false;
    }
  });

  // Prefer tabs whose URL already matches. This avoids probing every open tab,
  // which is noticeably slow in Safari when many tabs are open.
  const probe = async (tabList: chrome.tabs.Tab[]): Promise<number | undefined> => {
    for (const tab of tabList) {
      if (typeof tab.id !== "number") continue;
      if ((await probeTabOrigin(tab.id)) === requestOrigin) return tab.id;
    }
    return undefined;
  };

  const directMatch = await probe(candidates);
  if (directMatch !== undefined) return directMatch;

  // A tab may still report an extension/opaque URL while loading. Retry the
  // origin probe briefly before reporting that no logged-in tab is available.
  const uncertainTabs = tabs.filter((tab) => {
    if (typeof tab.id !== "number") return false;
    try {
      return typeof tab.url !== "string" || !tab.url || new URL(tab.url).origin === requestOrigin;
    } catch {
      return true;
    }
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const match = await probe(uncertainTabs);
    if (match !== undefined) return match;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
  }
  return undefined;
}

function removeTemporaryTab(requestOrigin: string, tabId: number) {
  const temporaryTab = temporaryTabs.get(requestOrigin);
  if (temporaryTab?.tabId !== tabId) return;
  if (temporaryTab.closeTimer !== undefined) globalThis.clearTimeout(temporaryTab.closeTimer);
  temporaryTabs.delete(requestOrigin);
}

function scheduleTemporaryTabClose(requestOrigin: string, tabId: number) {
  const temporaryTab = temporaryTabs.get(requestOrigin);
  if (temporaryTab?.tabId !== tabId) return;
  if (temporaryTab.closeTimer !== undefined) globalThis.clearTimeout(temporaryTab.closeTimer);
  temporaryTab.closeTimer = globalThis.setTimeout(() => {
    removeTemporaryTab(requestOrigin, tabId);
    chrome.tabs.remove(tabId).catch(() => undefined);
  }, TEMPORARY_TAB_IDLE_TIMEOUT);
}

async function waitForSiteTab(tabId: number, requestOrigin: string): Promise<void> {
  const deadline = Date.now() + TEMPORARY_TAB_READY_TIMEOUT;
  while (Date.now() < deadline) {
    if ((await probeTabOrigin(tabId)) === requestOrigin) return;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
  }
  throw new Error(`The temporary ${requestOrigin} tab did not become ready.`);
}

async function getOrCreateSiteTab(requestOrigin: string): Promise<{ tabId: number; temporary: boolean }> {
  const existingTabId = await findSiteTab(requestOrigin);
  if (existingTabId !== undefined) {
    const temporaryTab = temporaryTabs.get(requestOrigin);
    if (temporaryTab?.tabId === existingTabId && temporaryTab.closeTimer !== undefined) {
      globalThis.clearTimeout(temporaryTab.closeTimer);
      temporaryTab.closeTimer = undefined;
    }
    return { tabId: existingTabId, temporary: temporaryTab?.tabId === existingTabId };
  }

  const tab = await chrome.tabs.create({ url: `${requestOrigin}/`, active: false });
  if (typeof tab.id !== "number") {
    throw new Error(`Safari could not create a temporary ${requestOrigin} tab.`);
  }

  temporaryTabs.set(requestOrigin, { tabId: tab.id });
  try {
    await waitForSiteTab(tab.id, requestOrigin);
    return { tabId: tab.id, temporary: true };
  } catch (error) {
    removeTemporaryTab(requestOrigin, tab.id);
    await chrome.tabs.remove(tab.id).catch(() => undefined);
    throw error;
  }
}

onMessage("safariTabRequest", async ({ data }) =>
  enqueueRequest(async () => {
    const request = data as ISafariTabRequest;
    const requestOrigin = new URL(request.url).origin;
    const siteTab = await getOrCreateSiteTab(requestOrigin);

    try {
      const response = (await withTimeout(
        chrome.tabs.sendMessage(siteTab.tabId, {
          type: "ptd:safari-tab-request",
          data: request,
        }),
        (request.timeout ?? 30_000) + 2000,
        `The ${requestOrigin} tab request timed out.`,
      )) as ISafariRawResponse | undefined;

      if (!response?.ok || !response.result) {
        throw new Error(response?.error || `The ${requestOrigin} tab did not respond to the refresh request.`);
      }

      return response.result;
    } finally {
      if (siteTab.temporary) scheduleTemporaryTabClose(requestOrigin, siteTab.tabId);
    }
  }),
);

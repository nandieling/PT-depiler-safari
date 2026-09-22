import { intersection, toMerged } from "es-toolkit";
import { formatDate } from "date-fns";
import { saveAs } from "file-saver";
import { getBackupServer, IBackupData, IBackupFileInfo } from "@ptd/backupServer";
import { backupDataToJSZipBlob } from "@ptd/backupServer/utils.ts";
import AbstractBackupServer from "@ptd/backupServer/AbstractBackupServer.ts";

import { onMessage, sendMessage } from "@/messages.ts";
import type { IExtensionStorageSchema, TExtensionStorageKey } from "@/storage.ts";
import type {
  IRestoreOptions,
  IMetadataPiniaStorageSchema,
  TBackupFields,
  TBackupServerKey,
  IConfigPiniaStorageSchema,
  TUserInfoStorageSchema,
} from "@/shared/types.ts";

import { logger } from "./logger.ts";
import { ptdIndexDb } from "../adapter/indexdb.ts";

export const storageKey = [
  "config",
  "metadata",
  "userInfo",
  "searchResultSnapshot",
  "keepUploadTask",
] as TExtensionStorageKey[];

/**
 * 判断 cookie 的 domain 是否属于指定站点主机（与 Chrome 的 cookies.getAll({ domain }) 匹配语义保持一致）：
 * - cookie 设置在站点主机或其父级域名上（即该 cookie 会被发送到该站点）
 * - cookie 设置在站点主机的子域名上（属于该站点的子域）
 */
function isCookieDomainMatchSiteHost(cookieDomain: string | undefined, siteHost: string): boolean {
  const cookieHost = (cookieDomain ?? "").replace(/^\./, "").toLowerCase();
  const host = siteHost.toLowerCase();
  if (!cookieHost || !host) {
    return false;
  }
  return host === cookieHost || host.endsWith(`.${cookieHost}`) || cookieHost.endsWith(`.${host}`);
}

export async function createBackupData(backupFields: TBackupFields[] = []): Promise<IBackupData> {
  const metadataStore = (await sendMessage("getExtStorage", "metadata")) as IMetadataPiniaStorageSchema;

  const backupData: IBackupData = {};

  // 备份已添加站点的Cookie
  // 注意：Safari (WebKit) 的 browser.cookies.getAll({ domain }) 只会返回域名等于该 domain
  // 或其子域名的 cookie，无法匹配设置在父级域名上的 cookie（例如站点主机为 www.example.com
  // 而登录 cookie 设置在 example.com 上），导致备份出的 cookies.json 为空。
  // 因此这里一次性获取全部 cookie，再在本地按 Chrome 的 domain 匹配语义进行过滤。
  if (backupFields.includes("cookies")) {
    const allCookies = await sendMessage("getAllCookies", {});
    const cookies = {} as Required<IBackupData>["cookies"];
    for (const siteHost in metadataStore.siteHostMap) {
      const siteHostCookies = allCookies.filter((cookie) => isCookieDomainMatchSiteHost(cookie.domain, siteHost));
      if (siteHostCookies.length > 0) {
        cookies[siteHost] = siteHostCookies;
      }
    }
    backupData.cookies = cookies;
  }

  // 处理直接从 chrome.storage.local 读取的字段
  for (const field of storageKey) {
    if (backupFields.includes(field as TBackupFields)) {
      backupData[field] = await sendMessage("getExtStorage", field);
    }
  }

  // 备份下载历史
  if (backupFields.includes("downloadHistory")) {
    backupData["downloadHistory"] = await (await ptdIndexDb).getAll("download_history");
  }

  backupData.manifest = {
    time: new Date().getTime(),
    version: `PT-Depiler (${__EXT_VERSION__})`,
  };

  logger({
    msg: `A Backup data created at ${formatDate(backupData.manifest.time!, "yyyy-MM-dd HH:mm:ss")}`,
    data: {
      fields: Object.keys(backupData),
      // 用于排查 cookies.json 为空的问题：区分浏览器返回 0 条 cookie 与本地过滤后为 0 条
      cookieCount: backupData.cookies
        ? Object.values(backupData.cookies).reduce((sum, siteCookies) => sum + siteCookies.length, 0)
        : undefined,
    },
  });
  return backupData;
}

export async function getBackupServerInstance(backupServerId: TBackupServerKey): Promise<AbstractBackupServer<any>> {
  logger({ msg: `Get backup server instance for ID: ${backupServerId}` });
  const metadataStore = (await sendMessage("getExtStorage", "metadata")) as IMetadataPiniaStorageSchema;
  const backupServerConfig = metadataStore.backupServers[backupServerId];
  return await getBackupServer(backupServerConfig);
}

export async function exportBackupData(
  backupServerId: string | "local",
  backupFields: TBackupFields[] = [],
): Promise<boolean> {
  const backupData = await createBackupData(backupFields);
  const backupFilename = `PTD_backup_${formatDate(new Date(), "yyyyMMdd'T'HHmm")}.zip`;

  const configStore = (await sendMessage("getExtStorage", "config")) as IConfigPiniaStorageSchema;
  const encryptionKey = configStore?.backup?.encryptionKey ?? "";

  logger({ msg: `Exporting backup data to ${backupServerId}`, data: { backupFields, backupFilename } });
  if (backupServerId === "local") {
    const jsZipBlob = await backupDataToJSZipBlob(backupData, encryptionKey);
    if (__BROWSER__ === "safari") {
      saveAs(jsZipBlob, backupFilename);
    } else {
      const blobUrl = URL.createObjectURL(jsZipBlob);
      try {
        await sendMessage("downloadFile", { url: blobUrl, filename: backupFilename, conflictAction: "uniquify" });
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
    return true;
  } else {
    const backupServerInstance = await getBackupServerInstance(backupServerId);
    backupServerInstance.setEncryptionKey(encryptionKey);
    const backupStatus = await backupServerInstance.addFile(backupFilename, backupData);

    // 更新最后一次备份时间
    if (backupStatus) {
      const metadataStore = (await sendMessage("getExtStorage", "metadata")) as IMetadataPiniaStorageSchema;
      metadataStore.backupServers[backupServerId].lastBackupAt = new Date().getTime();
      await sendMessage("setExtStorage", { key: "metadata", value: metadataStore });
    }

    return backupStatus;
  }
}

onMessage("exportBackupData", async ({ data: { backupServerId, backupFields } }) => {
  return await exportBackupData(backupServerId, backupFields);
});

export async function restoreBackupData(
  restoreData: IBackupData, // 已经解密了的数据
  restoreOptions: IRestoreOptions = {},
): Promise<boolean> {
  const { fields = [], expandCookieMinutes = -1, keepExistUserInfo = true } = restoreOptions;

  const restoreDataExistFields = Object.keys(restoreData.manifest?.files ?? {});
  const restoreFields = intersection(fields, restoreDataExistFields);

  // 恢复下载历史
  if (restoreFields.includes("downloadHistory")) {
    const db = await ptdIndexDb;
    await db.clear("download_history");
    for (const downloadHistoryElement of restoreData.downloadHistory) {
      await db.put("download_history", downloadHistoryElement);
    }
  }

  // 恢复直接从 chrome.storage.local 读取的字段
  for (const field of storageKey.toReversed()) {
    if (restoreFields.includes(field as TBackupFields)) {
      let fieldData = restoreData[field] as IExtensionStorageSchema[typeof field];
      if (fieldData) {
        if (field === "userInfo" && keepExistUserInfo) {
          const userInfoStore = ((await sendMessage("getExtStorage", "userInfo")) ?? {}) as TUserInfoStorageSchema;
          fieldData = toMerged(fieldData, userInfoStore);
        }

        await sendMessage("setExtStorage", { key: field, value: fieldData });
      }
    }
  }

  // 恢复已添加站点的Cookie
  if (restoreFields.includes("cookies")) {
    const now = new Date().getTime() / 1000;

    for (const cookieData of Object.values(restoreData.cookies!)) {
      for (const cookie of cookieData) {
        // 延长 cookie 过期时间
        if (expandCookieMinutes > 0) {
          cookie.expirationDate = Math.max(cookie.expirationDate ?? 0, now) + expandCookieMinutes * 60;
        }

        await sendMessage("setCookie", cookie as unknown as chrome.cookies.SetDetails);
      }
    }
  }

  return true;
}

onMessage("restoreBackupData", async ({ data: { restoreData, restoreOptions = {} } }) => {
  return await restoreBackupData(restoreData, restoreOptions);
});

export async function getBackupHistory(backupServerId: string): Promise<IBackupFileInfo[]> {
  const backupServerInstance = await getBackupServerInstance(backupServerId);
  return await backupServerInstance.list();
}

onMessage("getBackupHistory", async ({ data: backupServerId }) => {
  return await getBackupHistory(backupServerId);
});

export async function deleteBackupHistory(backupServerId: string, path: string): Promise<boolean> {
  const backupServerInstance = await getBackupServerInstance(backupServerId);
  return await backupServerInstance.deleteFile(path);
}

onMessage("deleteBackupHistory", async ({ data: { backupServerId, path } }) => {
  return await deleteBackupHistory(backupServerId, path);
});

export async function getRemoteBackupData(
  backupServerId: string,
  path: string,
  decryptKey: string = "",
): Promise<IBackupData> {
  const backupServerInstance = await getBackupServerInstance(backupServerId);
  backupServerInstance.setEncryptionKey(decryptKey);
  return await backupServerInstance.getFile(path);
}

onMessage("getRemoteBackupData", async ({ data: { backupServerId, path, decryptKey = "" } }) => {
  return await getRemoteBackupData(backupServerId, path, decryptKey);
});

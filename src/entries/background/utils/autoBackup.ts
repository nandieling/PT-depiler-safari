/**
 * 自动备份的实际执行逻辑（从 alarms.ts 中拆出）。
 *
 * 拆出来是为了让「检查是否到期并执行备份」这段逻辑能被任意上下文驱动：
 * - Chrome / Firefox / Safari 的后台：由 alarms 定时任务驱动（scheduleAutoBackup）；
 * - Safari 的选项页运行时（options/safariRuntime.ts）：额外由页面内的轮询驱动
 *   （startAutoBackupPageTimer）。Safari 的 MV3 后台事件页只在有事件时才被唤起、
 *   并会在空闲时被卸载，只靠后台里的定时任务，自动备份常常一次都不会执行。
 *
 * 两个上下文同时看到「到期」时靠 lastBackupAt 认领去重（见 claimBackup）。
 */
import { defineJobScheduler } from "@webext-core/job-scheduler";

import { extStorage } from "@/storage.ts";
import { sendMessage } from "@/messages.ts";
import type { IBackupServerMetadata, IMetadataPiniaStorageSchema } from "@/shared/types.ts";

import { setupOffscreenDocument } from "./offscreen.ts";

/** alarms 任务名（后台页与 Safari 选项页注册的是同一个任务，不会互相覆盖） */
export const AUTO_BACKUP_JOB_ID = "autoBackup";

/** 页面上下文中的检查间隔（Safari 选项页） */
export const AUTO_BACKUP_PAGE_INTERVAL = 5 * 60 * 1000;

const autoBackupJobs = defineJobScheduler();

function log(msg: string) {
  sendMessage("logger", { msg }).catch();
}

function isAutoBackupDue(serverConfig: IBackupServerMetadata, now: number): boolean {
  // 仅处理已启用且有备份间隔的服务器
  if (!serverConfig.enabled || !serverConfig.backupInterval || serverConfig.backupInterval <= 0) {
    return false;
  }
  return now - (serverConfig.lastBackupAt ?? 0) >= serverConfig.backupInterval * 60 * 60 * 1000;
}

/**
 * 执行前先把 lastBackupAt 提前写成当前时间，相当于「认领」这次备份：
 * 后台页与 Safari 选项页可能同时判定到期，先认领的那个才是执行者，
 * 后到的那一个重新读取存储时会发现已经不再到期。备份失败时回滚，交给下一次检查重试。
 */
async function claimBackup(serverId: string): Promise<{ claimed: boolean; previousAt: number }> {
  const metadataStore = (await extStorage.getItem("metadata")) as IMetadataPiniaStorageSchema | undefined;
  const serverConfig = metadataStore?.backupServers?.[serverId];
  if (!serverConfig) {
    return { claimed: false, previousAt: 0 };
  }

  const now = Date.now();
  const previousAt = serverConfig.lastBackupAt ?? 0;
  if (!isAutoBackupDue(serverConfig, now)) {
    return { claimed: false, previousAt };
  }

  serverConfig.lastBackupAt = now;
  await extStorage.setItem("metadata", metadataStore!);
  return { claimed: true, previousAt };
}

async function releaseBackupClaim(serverId: string, previousAt: number): Promise<void> {
  const metadataStore = (await extStorage.getItem("metadata")) as IMetadataPiniaStorageSchema | undefined;
  if (!metadataStore?.backupServers?.[serverId]) {
    return;
  }
  metadataStore.backupServers[serverId].lastBackupAt = previousAt;
  await extStorage.setItem("metadata", metadataStore);
}

/** 本上下文是否正在跑一轮自动备份（避免上一轮还没结束就被下一个检查点重入） */
let isChecking = false;

/**
 * 检查所有备份服务器，对已启用的、到了间隔的服务器执行一次备份。
 * @param source 触发来源，仅用于日志排查
 * @returns 本轮实际触发的备份数量
 */
export async function runAutoBackupCheck(source: string): Promise<number> {
  if (isChecking) {
    return 0;
  }
  isChecking = true;

  try {
    const metadataStore = (await extStorage.getItem("metadata")) as IMetadataPiniaStorageSchema | undefined;
    if (!metadataStore?.backupServers) {
      return 0;
    }

    let triggeredCount = 0;

    for (const [serverId, serverConfig] of Object.entries(metadataStore.backupServers)) {
      if (!isAutoBackupDue(serverConfig, Date.now())) {
        continue;
      }

      const { claimed, previousAt } = await claimBackup(serverId);
      if (!claimed) {
        continue;
      }

      triggeredCount += 1;
      log(
        `Auto-backup triggered for [${serverConfig.name}] (interval: ${serverConfig.backupInterval}h, checked by ${source})`,
      );

      try {
        const backupStatus = await sendMessage("exportBackupData", {
          backupServerId: serverId,
          backupFields: serverConfig.backupFields ?? [],
        });

        if (!backupStatus) {
          await releaseBackupClaim(serverId, previousAt);
          log(`Auto-backup failed for [${serverConfig.name}] (returned false)`);
        }
      } catch (e) {
        await releaseBackupClaim(serverId, previousAt);
        const errMsg = e instanceof Error ? e.message : String(e);
        log(`Auto-backup failed for [${serverConfig.name}]: ${errMsg}`);
      }
    }

    return triggeredCount;
  } finally {
    isChecking = false;
  }
}

/**
 * 本上下文是否已经跑过启动时的第一次检查。
 *
 * alarms 的 `immediate` 依赖 `delayInMinutes: 0`，各浏览器对「立即触发」的处理并不一致
 * （Safari 就可能直接忽略这条 alarm），所以这里在注册任务之外再显式补一次检查。
 */
let hasRunStartupCheck = false;

async function runStartupCheck(): Promise<void> {
  if (hasRunStartupCheck) {
    return;
  }
  hasRunStartupCheck = true;

  await setupOffscreenDocument();
  await runAutoBackupCheck("startup");
}

/** 注册 alarms 定时任务（每 10 分钟检查一次），并立即补一次检查；后台页和页面上下文都可调用 */
export function scheduleAutoBackup(): Promise<void> {
  const scheduled = autoBackupJobs.scheduleJob({
    id: AUTO_BACKUP_JOB_ID,
    type: "interval",
    duration: 1000 * 60 * 10, // check every 10 minutes
    immediate: true,
    execute: async () => {
      await setupOffscreenDocument();
      await runAutoBackupCheck("alarm");
    },
  });

  runStartupCheck().catch();
  return scheduled;
}

let pageTimerStarted = false;

/** 页面上下文中的轮询：立刻补一次到期的备份，之后按固定间隔继续检查 */
export function startAutoBackupPageTimer(): void {
  if (pageTimerStarted) {
    return;
  }
  pageTimerStarted = true;

  runStartupCheck().catch();
  globalThis.setInterval(() => runAutoBackupCheck("page").catch(), AUTO_BACKUP_PAGE_INTERVAL);
}

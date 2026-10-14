// Safari compatibility runtime. These modules normally live in Firefox's
// background page or Chrome's service worker/offscreen document.
import "../background/utils/base.ts";
import "../background/utils/cookies.ts";
import "../background/utils/webRequest.ts";
import "../background/utils/safariTabRequest.ts";
import "../offscreen/offscreen.ts";

import { scheduleAutoBackup, startAutoBackupPageTimer } from "../background/utils/autoBackup.ts";

// Safari 的 MV3 后台事件页只在有事件时被唤起，空闲下来又会被卸载，所以只靠后台里的
// alarms 任务，自动备份常常一次都不会执行。这里在选项页里也注册同一个任务（Safari 之后
// 唤起后台时可以接着用），并在本页打开期间用轮询驱动检查，保证设置好服务器后备份真的会跑。
scheduleAutoBackup().catch();
startAutoBackupPageTimer();

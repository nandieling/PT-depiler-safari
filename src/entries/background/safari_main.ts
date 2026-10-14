/**
 * Safari 的后台入口，等价于上游 Firefox 的 background.page（firefox_main.html）。
 *
 * Safari 的 MV3 只接受 background.scripts，不支持 background.page，而 scripts 入口会被
 * vite-plugin-web-extension 以 build.lib + iife 打成单文件（见上游 f5a6f57a 的说明），
 * 因此 Safari 产物中后台脚本会内联一份 offscreen 依赖图。这里保持与移植前一致的行为。
 *
 * 在绝大多数情况下，你不需要编辑这个文件
 */
import "./main.ts";
import "../offscreen/offscreen.ts";

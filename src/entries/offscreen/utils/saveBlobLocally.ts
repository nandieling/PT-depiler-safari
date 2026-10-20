// Safari 的 WebExtension 没有 chrome.downloads，后台页收到"保存到本地"的请求时只能自己触发下载。
// 上游原先用 file-saver 做这件事，现已改为 blob URL + chrome.downloads（见 options/utils.ts 的
// downloadBlob），移植层继续保留 <a download> 这条 Safari 专用的路。
import { sanitizeFilename } from "@ptd/utils/filename.ts";

/** 在扩展页面上下文内把 Blob 存成文件（Safari 专用，等价于原来 file-saver 的 saveAs）。 */
export function saveBlobLocally(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = sanitizeFilename(filename);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 立即下载端还没读完 Blob，回收太早会导致保存失败，留足时间再释放
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

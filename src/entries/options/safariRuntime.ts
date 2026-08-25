// Safari compatibility runtime. These modules normally live in Firefox's
// background page or Chrome's service worker/offscreen document.
import "../background/utils/base.ts";
import "../background/utils/cookies.ts";
import "../background/utils/webRequest.ts";
import "../background/utils/safariTabRequest.ts";
import "../offscreen/offscreen.ts";

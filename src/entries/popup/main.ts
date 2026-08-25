async function openExtensionPage() {
  // Safari only presents website-access permission prompts from a user gesture.
  // The popup is opened by the toolbar click, so request access before opening
  // the options page where site requests are made.
  if (__BROWSER__ === "safari" && chrome.permissions?.request) {
    try {
      await chrome.permissions.request({ origins: ["*://*/*"] });
    } catch (error) {
      console.warn("Failed to request Safari website access", error);
    }
  }

  const optionsUrl = chrome.runtime.getURL("src/entries/options/index.html");
  await chrome.tabs.create({ url: optionsUrl, active: true });
}

openExtensionPage().catch((error) => console.error("Failed to open PT-Depiler", error));

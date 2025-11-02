// WHMCS PowerTools - Background Script

// Show welcome page on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.get(['hideWelcome'], (result) => {
      if (!result.hideWelcome) {
        chrome.tabs.create({ url: 'welcome.html' });
      }
    });
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'toggle-whmcs-modal' }).catch((error) => {
    // Content script may not be loaded on this page, ignore silently
    if (chrome.runtime.lastError) {
      console.log('WHMCS PowerTools: Content script not available on this page');
    }
  });
});

// Handle keyboard command for WHMCS modal
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-whmcs-search') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle-whmcs-modal' }).catch((error) => {
          // Content script may not be loaded on this page, ignore silently
          if (chrome.runtime.lastError) {
            console.log('WHMCS PowerTools: Content script not available on this page');
          }
        });
      }
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'open-settings') {
    chrome.runtime.openOptionsPage();
  }
});
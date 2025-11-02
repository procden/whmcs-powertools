// Welcome Page JavaScript
(function() {
  'use strict';

  function init() {
    const tryNowBtn = document.getElementById('try-now-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const dontShowCheckbox = document.getElementById('dont-show-again');
    const shortcutDisplay = document.getElementById('shortcut-display');

    if (!tryNowBtn || !settingsBtn || !dontShowCheckbox || !shortcutDisplay) {
      console.error('WHMCS PowerTools: Welcome page elements not found');
      return;
    }

    // Load and display current shortcut
    chrome.storage.sync.get(['customShortcut'], (result) => {
      const shortcut = result.customShortcut || 'ctrl+shift+f';
      const formatted = shortcut
        .split('+')
        .map(key => key.charAt(0).toUpperCase() + key.slice(1))
        .join('+');
      if (shortcutDisplay) {
        shortcutDisplay.textContent = formatted;
      }
    });

    // Ok button - closes the welcome page
    tryNowBtn.addEventListener('click', () => {
      // Save preference if checkbox is checked
      if (dontShowCheckbox && dontShowCheckbox.checked) {
        chrome.storage.sync.set({ hideWelcome: true });
      }
      
      // Close the welcome page
      window.close();
    });

    // Settings button
    settingsBtn.addEventListener('click', () => {
      if (dontShowCheckbox && dontShowCheckbox.checked) {
        chrome.storage.sync.set({ hideWelcome: true });
      }
      chrome.runtime.openOptionsPage(() => {
        window.close();
      });
    });

    // Handle checkbox change
    dontShowCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        chrome.storage.sync.set({ hideWelcome: true });
      } else {
        chrome.storage.sync.set({ hideWelcome: false });
      }
    });
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
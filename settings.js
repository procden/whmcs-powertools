// Settings Page JavaScript
(function() {
  'use strict';

  const shortcutInput = document.getElementById('shortcut-input');
  const currentShortcutDisplay = document.getElementById('current-shortcut');
  const clearBtn = document.getElementById('clear-shortcut');
  const saveBtn = document.getElementById('save-settings');
  const resetBtn = document.getElementById('reset-settings');
  const statusMessage = document.getElementById('status-message');
  const presetButtons = document.querySelectorAll('.btn-preset');
  const phoneFieldRadios = document.querySelectorAll('input[name="phone-field-type"]');
  const customFieldWrapper = document.getElementById('custom-field-wrapper');
  const customFieldInput = document.getElementById('phone-field-custom-input');
  const btcAddressInput = document.getElementById('btc-address');
  const trcAddressInput = document.getElementById('trc-address');

  // Detect OS for default shortcut
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const DEFAULT_SHORTCUT = isMac ? 'meta+shift+f' : 'ctrl+shift+f';
  const DEFAULT_FUNCTION_ORDER = ['user', 'domain', 'domainlookup', 'ticket', 'invoice', 'order'];
  const DEFAULT_PHONE_FIELD = 'phone';
  
  // Donation addresses - EDIT THESE WITH YOUR ADDRESSES
  const BTC_ADDRESS = 'bc1q55g3p9zfkxkwca99yn6kupny82c4y4wy5p8k62';
  const TRC_ADDRESS = 'TAvsFEFG5UzfzxW7QjQJn3wJqKxEXXUDVP';
  let recordedKeys = new Set();
  let draggedElement = null;

  // Load saved settings on page load
  loadSettings();

  // Load settings from storage
  function loadSettings() {
    chrome.storage.sync.get(['customShortcut', 'functionOrder', 'phoneField'], (result) => {
      const shortcut = result.customShortcut || DEFAULT_SHORTCUT;
      let functionOrder = result.functionOrder || DEFAULT_FUNCTION_ORDER;
      const phoneField = result.phoneField || DEFAULT_PHONE_FIELD;
      
      // Migrate from old structure (userid, email, phone) to new structure (user)
      if (functionOrder.includes('userid') || functionOrder.includes('email') || functionOrder.includes('phone')) {
        console.log('WHMCS PowerTools Settings: Migrating from old function order structure');
        // Replace userid, email, phone with 'user'
        functionOrder = functionOrder.filter(type => !['userid', 'email', 'phone'].includes(type));
        if (!functionOrder.includes('user')) {
          functionOrder.unshift('user'); // Add user at the beginning
        }
        // Save the migrated order
        chrome.storage.sync.set({ functionOrder: functionOrder });
      }
      
      // Check if the saved order includes the new domain features
      if (!functionOrder.includes('domain')) {
        console.log('WHMCS PowerTools Settings: Adding domain to existing function order');
        functionOrder = [...functionOrder, 'domain'];
        // Save the updated order
        chrome.storage.sync.set({ functionOrder: functionOrder });
      }
      if (!functionOrder.includes('domainlookup')) {
        console.log('WHMCS PowerTools Settings: Adding domainlookup to existing function order');
        functionOrder = [...functionOrder, 'domainlookup'];
        // Save the updated order
        chrome.storage.sync.set({ functionOrder: functionOrder });
      }
      if (!functionOrder.includes('ticket')) {
        console.log('WHMCS PowerTools Settings: Adding ticket to existing function order');
        functionOrder = [...functionOrder, 'ticket'];
        // Save the updated order
        chrome.storage.sync.set({ functionOrder: functionOrder });
      }
      if (!functionOrder.includes('invoice')) {
        console.log('WHMCS PowerTools Settings: Adding invoice to existing function order');
        functionOrder = [...functionOrder, 'invoice'];
        // Save the updated order
        chrome.storage.sync.set({ functionOrder: functionOrder });
      }
      if (!functionOrder.includes('order')) {
        console.log('WHMCS PowerTools Settings: Adding order to existing function order');
        functionOrder = [...functionOrder, 'order'];
        // Save the updated order
        chrome.storage.sync.set({ functionOrder: functionOrder });
      }
      
      displayShortcut(shortcut);
      initializeFunctionOrder(functionOrder);
      setPhoneFieldSelection(phoneField);
      
      // Set pre-defined donation addresses
      if (btcAddressInput) {
        btcAddressInput.value = BTC_ADDRESS;
      }
      if (trcAddressInput) {
        trcAddressInput.value = TRC_ADDRESS;
      }
    });
  }

  // Set phone field selection based on saved value
  function setPhoneFieldSelection(phoneField) {
    // Check if it matches a standard field
    if (phoneField === 'phone') {
      document.getElementById('phone-field-phone').checked = true;
      customFieldWrapper.style.display = 'none';
    } else if (phoneField === 'phone2') {
      document.getElementById('phone-field-phone2').checked = true;
      customFieldWrapper.style.display = 'none';
    } else {
      // It's a custom field
      document.getElementById('phone-field-custom').checked = true;
      customFieldInput.value = phoneField;
      customFieldWrapper.style.display = 'block';
    }
  }

  // Get current phone field value
  function getCurrentPhoneField() {
    const selectedRadio = document.querySelector('input[name="phone-field-type"]:checked');
    if (!selectedRadio) return DEFAULT_PHONE_FIELD;
    
    const fieldType = selectedRadio.value;
    if (fieldType === 'custom') {
      return customFieldInput.value.trim() || DEFAULT_PHONE_FIELD;
    }
    return fieldType;
  }

  // Phone field radio button listeners
  phoneFieldRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        customFieldWrapper.style.display = 'block';
        customFieldInput.focus();
      } else {
        customFieldWrapper.style.display = 'none';
      }
    });
  });

  // Display shortcut in both input and display
  function displayShortcut(shortcut) {
    shortcutInput.value = formatShortcutDisplay(shortcut);
    currentShortcutDisplay.textContent = formatShortcutDisplay(shortcut);
  }

  // Format shortcut for display (capitalize first letter of each key)
  function formatShortcutDisplay(shortcut) {
    return shortcut
      .split('+')
      .map(key => key.charAt(0).toUpperCase() + key.slice(1))
      .join('+');
  }

  // Function order configuration
  const functionConfig = {
    user: { icon: '👥', label: 'User' },
    domain: { icon: '📦', label: 'Product' },
    domainlookup: { icon: '🌐', label: 'Domain' },
    ticket: { icon: '💬', label: 'Ticket' },
    invoice: { icon: '💵', label: 'Invoice' },
    order: { icon: '🛒', label: 'Order' }
  };

  // Initialize function order display
  function initializeFunctionOrder(order) {
    const orderList = document.getElementById('function-order-list');
    orderList.innerHTML = '';

    order.forEach((type, index) => {
      const config = functionConfig[type];
      if (config) {
        const item = document.createElement('div');
        item.className = 'function-order-item';
        item.draggable = true;
        item.dataset.type = type;
        item.dataset.index = index;
        
        item.innerHTML = `
          <span class="function-order-icon">${config.icon}</span>
          <span class="function-order-label">${config.label}</span>
          <span class="function-order-handle">⋮⋮</span>
        `;
        
        orderList.appendChild(item);
      }
    });

    // Add drag and drop event listeners
    addDragAndDropListeners();
  }

  // Add drag and drop functionality
  function addDragAndDropListeners() {
    const items = document.querySelectorAll('.function-order-item');
    
    items.forEach(item => {
      item.addEventListener('dragstart', handleDragStart);
      item.addEventListener('dragend', handleDragEnd);
      item.addEventListener('dragover', handleDragOver);
      item.addEventListener('drop', handleDrop);
      item.addEventListener('dragenter', handleDragEnter);
      item.addEventListener('dragleave', handleDragLeave);
    });
  }

  // Drag and drop event handlers
  function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.outerHTML);
  }

  function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedElement = null;
    
    // Remove drag-over class from all items
    document.querySelectorAll('.function-order-item').forEach(item => {
      item.classList.remove('drag-over');
    });
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDragEnter(e) {
    e.preventDefault();
    if (this !== draggedElement) {
      this.classList.add('drag-over');
    }
  }

  function handleDragLeave(e) {
    this.classList.remove('drag-over');
  }

  function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    
    if (draggedElement && this !== draggedElement) {
      const orderList = document.getElementById('function-order-list');
      const draggedIndex = Array.from(orderList.children).indexOf(draggedElement);
      const targetIndex = Array.from(orderList.children).indexOf(this);
      
      if (draggedIndex < targetIndex) {
        orderList.insertBefore(draggedElement, this.nextSibling);
      } else {
        orderList.insertBefore(draggedElement, this);
      }
      
      // Update indices
      updateItemIndices();
    }
  }

  // Update item indices after reordering
  function updateItemIndices() {
    const items = document.querySelectorAll('.function-order-item');
    items.forEach((item, index) => {
      item.dataset.index = index;
    });
  }

  // Get current function order
  function getCurrentFunctionOrder() {
    const items = document.querySelectorAll('.function-order-item');
    return Array.from(items).map(item => item.dataset.type);
  }

  // Normalize key name
  function normalizeKey(key) {
    const keyMap = {
      'Control': 'ctrl',
      'Alt': 'alt',
      'Shift': 'shift',
      'Meta': 'meta',
      'Command': 'meta',
      'Win': 'meta',
      'OS': 'meta'
    };
    
    return keyMap[key] || key.toLowerCase();
  }

  // Record keyboard shortcut
  shortcutInput.addEventListener('focus', () => {
    shortcutInput.classList.add('recording');
    recordedKeys.clear();
  });

  shortcutInput.addEventListener('blur', () => {
    shortcutInput.classList.remove('recording');
  });

  shortcutInput.addEventListener('keydown', (e) => {
    e.preventDefault();
    
    const key = normalizeKey(e.key);
    
    // Add modifier keys
    if (e.ctrlKey) recordedKeys.add('ctrl');
    if (e.altKey) recordedKeys.add('alt');
    if (e.shiftKey) recordedKeys.add('shift');
    if (e.metaKey) recordedKeys.add('meta');
    
    // Add the actual key if it's not a modifier
    if (!['ctrl', 'alt', 'shift', 'meta', 'control'].includes(key)) {
      recordedKeys.add(key);
    }
    
    // Build shortcut string
    const modifiers = ['ctrl', 'alt', 'shift', 'meta'].filter(mod => recordedKeys.has(mod));
    const regularKeys = Array.from(recordedKeys).filter(k => !['ctrl', 'alt', 'shift', 'meta'].includes(k));
    
    if (regularKeys.length > 0) {
      const shortcut = [...modifiers, ...regularKeys].join('+');
      
      // Validate: must have at least one modifier
      if (modifiers.length > 0) {
        displayShortcut(shortcut);
      } else {
        showStatus('Please include at least one modifier key (Ctrl, Alt, Shift, or Meta)', 'error');
      }
    }
  });

  shortcutInput.addEventListener('keyup', () => {
    recordedKeys.clear();
  });

  // Clear shortcut
  clearBtn.addEventListener('click', () => {
    displayShortcut(DEFAULT_SHORTCUT);
    showStatus('Shortcut cleared. Click Save to apply default.', 'success');
  });

  // Preset buttons
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const shortcut = btn.dataset.shortcut;
      displayShortcut(shortcut);
      showStatus('Preset selected. Click Save to apply.', 'success');
    });
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    const shortcut = shortcutInput.value.toLowerCase().replace(/\s/g, '');
    const functionOrder = getCurrentFunctionOrder();
    const phoneField = getCurrentPhoneField();
    
    if (!shortcut) {
      showStatus('Please set a keyboard shortcut first', 'error');
      return;
    }
    
    // Validate shortcut format
    const keys = shortcut.split('+');
    const modifiers = keys.filter(k => ['ctrl', 'alt', 'shift', 'meta'].includes(k));
    
    if (modifiers.length === 0) {
      showStatus('Shortcut must include at least one modifier key', 'error');
      return;
    }
    
    // Save to storage
    chrome.storage.sync.set({ 
      customShortcut: shortcut,
      functionOrder: functionOrder,
      phoneField: phoneField
    }, () => {
      displayShortcut(shortcut);
      showStatus('Settings saved successfully!', 'success');
      
      // Notify content scripts to reload shortcut and function order
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
            action: 'update-settings', 
            shortcut: shortcut,
            functionOrder: functionOrder,
            phoneField: phoneField
          }).catch(() => {
            // Ignore errors for tabs that don't have content script
          });
        });
      });
    });
  });

  // Reset to default
  // Donation copy functionality
  const copyButtons = document.querySelectorAll('.btn-copy-address');
  const donationMessage = document.getElementById('donation-copy-message');

  copyButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const targetId = button.getAttribute('data-copy');
      const addressInput = document.getElementById(targetId);
      
      if (!addressInput) return;

      const address = addressInput.value.trim();
      
      // Check if address is empty
      if (!address || address === '') {
        donationMessage.textContent = 'Please enter a donation address first!';
        donationMessage.style.background = '#fee2e2';
        donationMessage.style.color = '#991b1b';
        donationMessage.style.borderColor = '#fecaca';
        donationMessage.style.display = 'block';
        addressInput.focus();
        
        setTimeout(() => {
          donationMessage.style.display = 'none';
        }, 3000);
        return;
      }

      try {
        await navigator.clipboard.writeText(address);
        
        // Show success message
        donationMessage.textContent = 'Address copied to clipboard! ✅';
        donationMessage.style.background = '#d1fae5';
        donationMessage.style.color = '#065f46';
        donationMessage.style.borderColor = '#a7f3d0';
        donationMessage.style.display = 'block';
        
        // Temporarily change button text
        const copyText = button.querySelector('.copy-text');
        const originalText = copyText.textContent;
        copyText.textContent = 'Copied!';
        button.style.background = '#10b981';
        
        setTimeout(() => {
          donationMessage.style.display = 'none';
          copyText.textContent = originalText;
          button.style.background = '';
        }, 2000);
      } catch (error) {
        console.error('Failed to copy address:', error);
        
        // Fallback for older browsers
        addressInput.select();
        addressInput.setSelectionRange(0, 99999); // For mobile devices
        document.execCommand('copy');
        
        donationMessage.textContent = 'Address copied to clipboard! ✅';
        donationMessage.style.background = '#d1fae5';
        donationMessage.style.color = '#065f46';
        donationMessage.style.borderColor = '#a7f3d0';
        donationMessage.style.display = 'block';
        
        setTimeout(() => {
          donationMessage.style.display = 'none';
        }, 2000);
      }
    });
  });

  resetBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all settings to default?')) {
      chrome.storage.sync.set({ 
        customShortcut: DEFAULT_SHORTCUT,
        functionOrder: DEFAULT_FUNCTION_ORDER,
        phoneField: DEFAULT_PHONE_FIELD
      }, () => {
        displayShortcut(DEFAULT_SHORTCUT);
        initializeFunctionOrder(DEFAULT_FUNCTION_ORDER);
        setPhoneFieldSelection(DEFAULT_PHONE_FIELD);
        showStatus('Settings reset to default', 'success');
        
        // Notify content scripts
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { 
              action: 'update-settings', 
              shortcut: DEFAULT_SHORTCUT,
              functionOrder: DEFAULT_FUNCTION_ORDER,
              phoneField: DEFAULT_PHONE_FIELD
            }).catch(() => {});
          });
        });
      });
    }
  });

  // Show status message
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type} show`;
    
    setTimeout(() => {
      statusMessage.classList.remove('show');
    }, 3000);
  }


})();

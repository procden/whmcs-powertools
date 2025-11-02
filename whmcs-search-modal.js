// WHMCS Search Modal - Content Script - Properly Scoped
(function() {
  'use strict';

  // Only run on WHMCS admin pages to avoid conflicts
  // Check for any of the admin directory patterns that match manifest.json
  const adminPatterns = ['/whmadmin/', '/admin/', '/whmcs/', '/admincp/', '/panel/', '/control/', '/secure-admin/', '/adminarea/', '/manager/'];
  const isWhmcsAdminPage = adminPatterns.some(pattern => window.location.pathname.includes(pattern));
  
  if (!isWhmcsAdminPage) {
    return;
  }

  // Prevent multiple instances
  if (document.getElementById('whmcs-search-modal-overlay')) return;

  // Detect the base URL and admin path dynamically from the current page
  // This allows the extension to work with any WHMCS installation
  const getWhmcsConfig = () => {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    
    // Detect admin directory (can be /whmadmin/, /admin/, or any custom path)
    // Look for common WHMCS admin patterns
    const adminPatterns = [
      /\/(whmadmin|admin|whmcs|secure-admin|panel|control|adminarea|admincp|manager)\/[^/]*/i
    ];
    
    let adminPath = '/whmadmin'; // default fallback
    let basePath = '';
    
    // Try to extract admin path from current URL
    for (const pattern of adminPatterns) {
      const match = pathname.match(pattern);
      if (match) {
        const fullMatch = match[0];
        const lastSlash = fullMatch.lastIndexOf('/');
        adminPath = fullMatch.substring(0, lastSlash);
        basePath = pathname.substring(0, pathname.indexOf(adminPath));
        break;
      }
    }
    
    // If no pattern matched, try to find any directory before a known WHMCS file
    if (adminPath === '/whmadmin' && !pathname.includes('/whmadmin/')) {
      const knownFiles = ['clientssummary.php', 'clients.php', 'index.php', 'supporttickets.php', 'invoices.php'];
      for (const file of knownFiles) {
        if (pathname.includes(file)) {
          const fileIndex = pathname.lastIndexOf('/' + file);
          const pathBeforeFile = pathname.substring(0, fileIndex);
          const lastSlashIndex = pathBeforeFile.lastIndexOf('/');
          if (lastSlashIndex > 0) {
            basePath = pathBeforeFile.substring(0, lastSlashIndex);
            adminPath = pathBeforeFile.substring(lastSlashIndex);
          } else {
            adminPath = pathBeforeFile;
          }
          break;
        }
      }
    }
    
    const baseUrl = origin + basePath;
    
    return {
      baseUrl: baseUrl,
      adminPath: adminPath,
      fullAdminUrl: baseUrl + adminPath
    };
  };

  const WHMCS_CONFIG = getWhmcsConfig();
  const BASE_URL = WHMCS_CONFIG.baseUrl;
  const ADMIN_PATH = WHMCS_CONFIG.adminPath;
  
  console.log('WHMCS PowerTools: Detected configuration:', {
    baseUrl: BASE_URL,
    adminPath: ADMIN_PATH,
    fullAdminUrl: WHMCS_CONFIG.fullAdminUrl
  });

  // Prevent conflicts with WHMCS native modals
  const originalModalMethods = {
    show: window.showModalDialog,
    alert: window.alert,
    confirm: window.confirm
  };

  // Auto-refresh prevention system
  const refreshPrevention = {
    isActive: false,
    originalReload: null,
    originalReplace: null,
    originalLocationHrefGetter: null,
    originalLocationHrefSetter: null,
    originalLocationPathnameGetter: null,
    originalLocationPathnameSetter: null,
    originalLocationSearchGetter: null,
    originalLocationSearchSetter: null,
    originalDocumentLocation: null,
    locationDescriptor: null,
    metaRefreshTag: null,
    metaRefreshObserver: null,
    modifiedLocationPrototype: false,
    originalHistoryGo: null,
    originalHistoryBack: null,
    originalHistoryForward: null,
    originalOnBeforeUnload: null,
    originalOnBeforeUnloadDescriptor: null,
    originalAddEventListener: null,
    originalEventTargetAddEventListener: null,
    originalDispatchEvent: null,
    beforeUnloadListeners: new Map(),
    onbeforeunloadWatcher: null,
    
    init() {
      // Store original functions IMMEDIATELY to prevent addons from storing references
      this.originalReload = window.location.reload.bind(window.location);
      this.originalReplace = window.location.replace.bind(window.location);
      this.originalDocumentLocation = document.location;
      
      // Store history methods that might be used for refresh
      try {
        this.originalHistoryGo = window.history.go;
        this.originalHistoryBack = window.history.back;
        this.originalHistoryForward = window.history.forward;
      } catch (e) {
        // Ignore if history API is not available
      }
      
      // Store original window.onbeforeunload to prevent prompts
      try {
        this.originalOnBeforeUnload = window.onbeforeunload;
        // Also try to get the property descriptor to intercept future assignments
        this.originalOnBeforeUnloadDescriptor = Object.getOwnPropertyDescriptor(window, 'onbeforeunload');
      } catch (e) {
        // Ignore if we can't access it
      }
      
      // Store original addEventListener to intercept beforeunload listeners
      try {
        this.originalAddEventListener = window.addEventListener;
        // Also override EventTarget.prototype.addEventListener to catch ALL beforeunload listeners
        if (EventTarget && EventTarget.prototype && EventTarget.prototype.addEventListener) {
          this.originalEventTargetAddEventListener = EventTarget.prototype.addEventListener;
        }
        // CRITICAL: Override dispatchEvent to intercept beforeunload events BEFORE they reach listeners
        if (EventTarget && EventTarget.prototype && EventTarget.prototype.dispatchEvent) {
          this.originalDispatchEvent = EventTarget.prototype.dispatchEvent;
        }
      } catch (e) {
        console.warn('WHMCS PowerTools: Could not store addEventListener:', e);
      }
      
      // Helper function to wrap beforeunload listeners
      const createWrappedListener = (self, originalListener) => {
        return function(e) {
          // If modal is active, block the event completely
          if (self.isActive) {
            console.log('WHMCS PowerTools: Intercepted beforeunload event from tracked listener (modal is active)');
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.returnValue = null;
            return null; // Return null, not a string, to prevent prompt
          }
          // When modal is not active, call original listener but ensure it doesn't return a string
          const result = originalListener.call(this, e);
          // If it returns a string (which triggers browser prompt), return null instead when modal is active
          if (self.isActive && typeof result === 'string' && result.length > 0) {
            return null;
          }
          return result;
        };
      };
      
      // IMMEDIATELY override addEventListener at prototype level to catch ALL beforeunload listeners
      // This must happen before any addon can register its beforeunload handler
      if (this.originalEventTargetAddEventListener) {
        const self = this;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
          // Track all beforeunload listeners so we can suppress them later
          if (type === 'beforeunload' || type === 'unload') {
            const key = `${type}_${Date.now()}_${Math.random()}`;
            const wrappedListener = createWrappedListener(self, listener);
            self.beforeUnloadListeners.set(key, { type, originalListener: listener, wrappedListener, options });
            // Add the wrapped listener instead
            return self.originalEventTargetAddEventListener.call(this, type, wrappedListener, options);
          }
          // For other events, use original addEventListener
          return self.originalEventTargetAddEventListener.call(this, type, listener, options);
        };
        console.log('WHMCS PowerTools: Intercepting ALL beforeunload listeners at EventTarget level');
      }
      
      // Also override window.addEventListener specifically
      if (this.originalAddEventListener) {
        const self = this;
        window.addEventListener = function(type, listener, options) {
          // Track all beforeunload listeners so we can suppress them later
          if (type === 'beforeunload' || type === 'unload') {
            const key = `${type}_${Date.now()}_${Math.random()}`;
            const wrappedListener = createWrappedListener(self, listener);
            self.beforeUnloadListeners.set(key, { type, originalListener: listener, wrappedListener, options });
            // Add the wrapped listener instead
            return self.originalAddEventListener.call(window, type, wrappedListener, options);
          }
          // For other events, use original addEventListener
          return self.originalAddEventListener.call(window, type, listener, options);
        };
        console.log('WHMCS PowerTools: Intercepting window beforeunload listeners');
      }
      
      // Store location property descriptors
      const locationHrefDesc = Object.getOwnPropertyDescriptor(window.location, 'href') || 
                               Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window.location), 'href');
      if (locationHrefDesc) {
        this.originalLocationHrefGetter = locationHrefDesc.get;
        this.originalLocationHrefSetter = locationHrefDesc.set;
      }
      
      const locationPathnameDesc = Object.getOwnPropertyDescriptor(window.location, 'pathname') || 
                                   Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window.location), 'pathname');
      if (locationPathnameDesc) {
        this.originalLocationPathnameGetter = locationPathnameDesc.get;
        this.originalLocationPathnameSetter = locationPathnameDesc.set;
      }
      
      const locationSearchDesc = Object.getOwnPropertyDescriptor(window.location, 'search') || 
                                 Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window.location), 'search');
      if (locationSearchDesc) {
        this.originalLocationSearchGetter = locationSearchDesc.get;
        this.originalLocationSearchSetter = locationSearchDesc.set;
      }
      
      // Store location descriptor for intercepting location changes
      this.locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location') || 
                                Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'location');
      
      // Find and store meta refresh tag if it exists
      this.findMetaRefreshTag();
      
      // Set up observer for dynamically added meta refresh tags
      this.setupMetaRefreshObserver();
    },
    
    setupMetaRefreshObserver() {
      // Watch for new meta refresh tags being added to the document
      this.metaRefreshObserver = new MutationObserver((mutations) => {
        if (this.isActive) {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === 1 && node.tagName === 'META') {
                const httpEquiv = node.getAttribute('http-equiv');
                if (httpEquiv && httpEquiv.toLowerCase() === 'refresh') {
                  console.log('WHMCS PowerTools: Detected new meta refresh tag, blocking it');
                  node.style.display = 'none';
                  const content = node.getAttribute('content');
                  if (content) {
                    node.setAttribute('data-whmcs-original-content', content);
                    node.removeAttribute('content');
                  }
                  this.metaRefreshTag = node;
                }
              }
            });
          });
        }
      });
      
      if (document.head || document.documentElement) {
        this.metaRefreshObserver.observe(document.head || document.documentElement, {
          childList: true,
          subtree: true
        });
      }
    },
    
    findMetaRefreshTag() {
      const metaTags = document.querySelectorAll('meta[http-equiv="refresh"]');
      if (metaTags.length > 0) {
        this.metaRefreshTag = metaTags[0];
      }
    },
    
    blockBeforeUnload(e) {
      if (refreshPrevention.isActive) {
        console.log('WHMCS PowerTools: Blocked beforeunload event (modal is active)');
        
        // Aggressively prevent the prompt
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        
        // Clear returnValue to prevent prompt in modern browsers
        e.returnValue = null;
        
        // Return null instead of empty string (more reliable)
        return null;
      }
    },
    
    blockUnload(e) {
      if (refreshPrevention.isActive) {
        console.log('WHMCS PowerTools: Blocked unload event (modal is active)');
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    
    enable() {
      if (this.isActive) return;
      this.isActive = true;
      
      console.log('WHMCS PowerTools: Auto-refresh prevention enabled');
      
      // Override location.reload() - be careful not to break anything
      try {
        const blockReload = (forcedReload) => {
          if (this.isActive) {
            console.log('WHMCS PowerTools: Blocked page reload (modal is active)');
            return;
          }
          return this.originalReload(forcedReload);
        };
        
        window.location.reload = blockReload;
        
        // Try to override prototype, but don't fail if it doesn't work
        try {
          if (typeof Location !== 'undefined' && Location.prototype && Location.prototype.reload && Location.prototype.reload !== blockReload) {
            Location.prototype.reload = blockReload;
            this.modifiedLocationPrototype = true;
          }
        } catch (e) {
          // Ignore prototype errors - window.location override is more important
        }
      } catch (e) {
        // Silently handle: location.reload may be non-configurable in some browsers
      }
      
      // Override location.replace()
      try {
        const blockReplace = (url) => {
          if (this.isActive) {
            console.log('WHMCS PowerTools: Blocked location.replace() (modal is active)');
            return;
          }
          return this.originalReplace(url);
        };
        
        window.location.replace = blockReplace;
        
        // Try to override prototype, but don't fail if it doesn't work
        try {
          if (typeof Location !== 'undefined' && Location.prototype && Location.prototype.replace && Location.prototype.replace !== blockReplace) {
            Location.prototype.replace = blockReplace;
            this.modifiedLocationPrototype = true;
          }
        } catch (e) {
          // Ignore prototype errors - window.location override is more important
        }
      } catch (e) {
        // Silently handle: location.replace may be read-only in some browsers
      }
      
      // Intercept location.href assignments
      if (this.originalLocationHrefSetter) {
        try {
          Object.defineProperty(window.location, 'href', {
            get: () => this.originalLocationHrefGetter ? this.originalLocationHrefGetter.call(window.location) : window.location.href,
            set: (value) => {
              if (this.isActive && typeof value === 'string') {
                console.log('WHMCS PowerTools: Blocked location.href assignment (modal is active):', value);
                return;
              }
              if (this.originalLocationHrefSetter) {
                this.originalLocationHrefSetter.call(window.location, value);
              }
            },
            configurable: true,
            enumerable: true
          });
        } catch (e) {
          // Silently handle: location.href may be non-configurable in some browsers
        }
      }
      
      // Intercept location.pathname assignments (some addons use this)
      if (this.originalLocationPathnameSetter) {
        try {
          Object.defineProperty(window.location, 'pathname', {
            get: () => this.originalLocationPathnameGetter ? this.originalLocationPathnameGetter.call(window.location) : window.location.pathname,
            set: (value) => {
              if (this.isActive && typeof value === 'string') {
                console.log('WHMCS PowerTools: Blocked location.pathname assignment (modal is active):', value);
                return;
              }
              if (this.originalLocationPathnameSetter) {
                this.originalLocationPathnameSetter.call(window.location, value);
              }
            },
            configurable: true,
            enumerable: true
          });
        } catch (e) {
          // pathname might not be writable, that's ok
        }
      }
      
      // Intercept document.location (some addons use this instead of window.location)
      try {
        const documentLocationDesc = Object.getOwnPropertyDescriptor(document, 'location') || 
                                     Object.getOwnPropertyDescriptor(Object.getPrototypeOf(document), 'location');
        if (documentLocationDesc && documentLocationDesc.set) {
          const originalDocLocationSetter = documentLocationDesc.set;
          Object.defineProperty(document, 'location', {
            get: () => documentLocationDesc.get ? documentLocationDesc.get.call(document) : document.location,
            set: (value) => {
              if (this.isActive && typeof value === 'string') {
                console.log('WHMCS PowerTools: Blocked document.location assignment (modal is active):', value);
                return;
              }
              originalDocLocationSetter.call(document, value);
            },
            configurable: true,
            enumerable: true
          });
        }
      } catch (e) {
        // Silently handle: document.location may be non-configurable in some browsers
      }
      
      // Intercept window.location assignments
      if (this.locationDescriptor && this.locationDescriptor.set) {
        try {
          Object.defineProperty(window, 'location', {
            get: () => {
              return this.locationDescriptor ? this.locationDescriptor.get.call(window) : window.location;
            },
            set: (value) => {
              if (this.isActive && typeof value === 'string') {
                console.log('WHMCS PowerTools: Blocked window.location assignment (modal is active):', value);
                return;
              }
              if (this.locationDescriptor && this.locationDescriptor.set) {
                this.locationDescriptor.set.call(window, value);
              }
            },
            configurable: true,
            enumerable: true
          });
        } catch (e) {
          // Silently handle: window.location may be non-configurable in some browsers
        }
      }
      
      // Block history API methods that might be used for navigation/refresh
      if (this.originalHistoryGo) {
        try {
          const self = this;
          window.history.go = function(delta) {
            // history.go(0) is a common way to reload the page
            if (self.isActive && delta === 0) {
              console.log('WHMCS PowerTools: Blocked history.go(0) page reload (modal is active)');
              return;
            }
            return self.originalHistoryGo.call(window.history, delta);
          };
        } catch (e) {
          console.warn('WHMCS PowerTools: Could not override history.go:', e);
        }
      }
      
      // The addEventListener is already overridden in init() to track all beforeunload listeners
      // Now we just need to make sure all tracked listeners are blocked when modal is active
      // This is already handled by the wrapped listeners, but we'll add extra protection
      
      // Temporarily disable window.onbeforeunload to prevent prompts
      // This is critical because if window.onbeforeunload returns a string, browser will show a prompt
      try {
        // Set to null immediately
        window.onbeforeunload = null;
        
        // Intercept any future assignments to window.onbeforeunload
        if (this.originalOnBeforeUnloadDescriptor) {
          const self = this;
          Object.defineProperty(window, 'onbeforeunload', {
            get: () => {
              // Always return null when modal is active
              if (self.isActive) {
                return null;
              }
              return self.originalOnBeforeUnloadDescriptor ? 
                     (self.originalOnBeforeUnloadDescriptor.get ? self.originalOnBeforeUnloadDescriptor.get.call(window) : null) : 
                     null;
            },
            set: (value) => {
              // Block any assignments when modal is active
              if (self.isActive) {
                console.log('WHMCS PowerTools: Blocked assignment to window.onbeforeunload (modal is active)');
                return;
              }
              // Allow assignment when modal is not active
              if (self.originalOnBeforeUnloadDescriptor && self.originalOnBeforeUnloadDescriptor.set) {
                self.originalOnBeforeUnloadDescriptor.set.call(window, value);
                // Update stored value
                self.originalOnBeforeUnload = value;
              } else {
                window.onbeforeunload = value;
              }
            },
            configurable: true,
            enumerable: true
          });
        } else {
          // Fallback: just set to null
          window.onbeforeunload = null;
        }
        
        // Also remove any existing beforeunload listeners that might cause prompts
        // We need to do this more aggressively - remove ALL beforeunload listeners
        // by cloning the window and removing all event listeners (not possible directly)
        // Instead, we'll make sure our handler runs first and stops everything
        
        console.log('WHMCS PowerTools: Suppressed window.onbeforeunload (modal is active)');
      } catch (e) {
        console.warn('WHMCS PowerTools: Could not suppress window.onbeforeunload:', e);
        // Fallback: try simple assignment
        try {
          window.onbeforeunload = null;
        } catch (e2) {
          console.warn('WHMCS PowerTools: Could not set window.onbeforeunload to null:', e2);
        }
      }
      
      // CRITICAL: Override dispatchEvent to prevent beforeunload events from reaching ANY listeners
      // This is the most aggressive approach - intercept at the lowest level
      if (this.originalDispatchEvent) {
        const self = this;
        EventTarget.prototype.dispatchEvent = function(event) {
          // If this is a beforeunload event and modal is active, prevent it completely
          if (self.isActive && event && event.type === 'beforeunload') {
            console.log('WHMCS PowerTools: Intercepted beforeunload event at dispatchEvent level (modal is active)');
            // Modify the event to prevent prompt
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            event.returnValue = null;
            // Still call dispatchEvent but with modified event that won't trigger prompt
            // However, to be safe, just return true without dispatching
            // This tells the browser the event was "handled" without actually dispatching
            try {
              const result = self.originalDispatchEvent.call(this, event);
              // Ensure return value doesn't trigger prompt
              return result;
            } catch (e) {
              // If dispatch fails, just return true to indicate "handled"
              return true;
            }
          }
          // For other events or when modal is not active, use original dispatchEvent
          return self.originalDispatchEvent.call(this, event);
        };
        console.log('WHMCS PowerTools: Overrode dispatchEvent to block beforeunload (modal is active)');
      }
      
      // Block beforeunload events that might trigger navigation
      // Use capture phase with highest priority to intercept EARLIEST, and multiple listeners for better coverage
      // We MUST use {capture: true, passive: false} and add FIRST to run before other handlers
      const blockHandler = (e) => {
        if (this.isActive) {
          console.log('WHMCS PowerTools: Blocked beforeunload event at earliest stage (modal is active)');
          e.preventDefault();
          e.stopImmediatePropagation();
          e.stopPropagation();
          e.returnValue = null;
          // Prevent any default behavior
          return null;
        }
      };
      
      // Add with highest priority - must be FIRST
      window.addEventListener('beforeunload', blockHandler, {capture: true, passive: false, once: false});
      window.addEventListener('beforeunload', this.blockBeforeUnload, true); // Capture phase
      window.addEventListener('beforeunload', this.blockBeforeUnload, false); // Bubble phase
      
      // Also block unload events
      window.addEventListener('unload', this.blockUnload, true);
      
      // CRITICAL: Continuously monitor and suppress window.onbeforeunload
      // The addon might try to set it again, so we need to keep it null
      const self = this;
      this.onbeforeunloadWatcher = setInterval(() => {
        if (self.isActive && window.onbeforeunload !== null && window.onbeforeunload !== undefined) {
          console.log('WHMCS PowerTools: Detected window.onbeforeunload was set, suppressing it again');
          try {
            window.onbeforeunload = null;
          } catch (e) {
            console.warn('WHMCS PowerTools: Could not suppress window.onbeforeunload:', e);
          }
        }
      }, 100); // Check every 100ms
      
      // Note: setTimeout/setInterval overrides are not needed since location.reload() 
      // and location.replace() overrides above will catch any refresh attempts from 
      // timers, whether they were set before or after the modal opens
      
      // Remove meta refresh tag if it exists (re-check in case new ones were added)
      this.findMetaRefreshTag();
      if (this.metaRefreshTag && this.metaRefreshTag.parentNode) {
        this.metaRefreshTag.style.display = 'none';
        // Remove the content attribute to disable it
        const content = this.metaRefreshTag.getAttribute('content');
        if (content) {
          this.metaRefreshTag.setAttribute('data-whmcs-original-content', content);
          this.metaRefreshTag.removeAttribute('content');
        }
      }
    },
    
    disable() {
      if (!this.isActive) return;
      this.isActive = false;
      
      console.log('WHMCS PowerTools: Auto-refresh prevention disabled');
      
      // Restore dispatchEvent
      if (this.originalDispatchEvent) {
        EventTarget.prototype.dispatchEvent = this.originalDispatchEvent;
        console.log('WHMCS PowerTools: Restored EventTarget.prototype.dispatchEvent');
      }
      
      // Restore addEventListener
      if (this.originalEventTargetAddEventListener) {
        EventTarget.prototype.addEventListener = this.originalEventTargetAddEventListener;
        console.log('WHMCS PowerTools: Restored EventTarget.prototype.addEventListener');
      }
      
      if (this.originalAddEventListener) {
        window.addEventListener = this.originalAddEventListener;
        console.log('WHMCS PowerTools: Restored window.addEventListener');
      }
      
      // Note: We don't need to re-add the wrapped listeners because they're already added
      // They will just call the original listeners now that modal is not active
      this.beforeUnloadListeners.clear();
      
      // Restore window.onbeforeunload
      try {
        // Restore the property descriptor if we modified it
        if (this.originalOnBeforeUnloadDescriptor) {
          Object.defineProperty(window, 'onbeforeunload', this.originalOnBeforeUnloadDescriptor);
        } else {
          // Fallback: restore the value
          window.onbeforeunload = this.originalOnBeforeUnload;
        }
        console.log('WHMCS PowerTools: Restored window.onbeforeunload');
      } catch (e) {
        console.warn('WHMCS PowerTools: Could not restore window.onbeforeunload:', e);
        // Fallback: try simple assignment
        try {
          window.onbeforeunload = this.originalOnBeforeUnload;
        } catch (e2) {
          console.warn('WHMCS PowerTools: Could not restore window.onbeforeunload value:', e2);
        }
      }
      
      // Stop monitoring window.onbeforeunload
      if (this.onbeforeunloadWatcher) {
        clearInterval(this.onbeforeunloadWatcher);
        this.onbeforeunloadWatcher = null;
        console.log('WHMCS PowerTools: Stopped monitoring window.onbeforeunload');
      }
      
      // Remove event listeners (both capture and bubble phases)
      window.removeEventListener('beforeunload', this.blockBeforeUnload, true);
      window.removeEventListener('beforeunload', this.blockBeforeUnload, false);
      window.removeEventListener('unload', this.blockUnload, true);
      
      // Restore history API methods
      if (this.originalHistoryGo) {
        window.history.go = this.originalHistoryGo;
      }
      if (this.originalHistoryBack) {
        window.history.back = this.originalHistoryBack;
      }
      if (this.originalHistoryForward) {
        window.history.forward = this.originalHistoryForward;
      }
      
      // Restore original functions
      // Note: location.reload and location.replace may be read-only in some browsers
      try {
        if (this.originalReload) {
          window.location.reload = this.originalReload;
        }
      } catch (e) {
        console.warn('WHMCS PowerTools: Could not restore location.reload (read-only property):', e);
      }
      
      try {
        if (this.originalReplace) {
          window.location.replace = this.originalReplace;
        }
      } catch (e) {
        console.warn('WHMCS PowerTools: Could not restore location.replace (read-only property):', e);
      }
      
      // Restore Location.prototype only if we modified it
      // Note: We can't easily restore the original prototype methods, so we'll leave them
      // The overrides on window.location are more important anyway
      
      // Restore location.href descriptor
      if (this.originalLocationHrefSetter) {
        try {
          Object.defineProperty(window.location, 'href', {
            get: this.originalLocationHrefGetter,
            set: this.originalLocationHrefSetter,
            configurable: true,
            enumerable: true
          });
        } catch (e) {
          console.warn('WHMCS PowerTools: Could not restore location.href descriptor:', e);
        }
      }
      
      // Restore location.pathname descriptor
      if (this.originalLocationPathnameSetter) {
        try {
          Object.defineProperty(window.location, 'pathname', {
            get: this.originalLocationPathnameGetter,
            set: this.originalLocationPathnameSetter,
            configurable: true,
            enumerable: true
          });
        } catch (e) {
          // pathname might not be writable, that's ok
        }
      }
      
      // Restore document.location
      try {
        const documentLocationDesc = Object.getOwnPropertyDescriptor(document, 'location') || 
                                     Object.getOwnPropertyDescriptor(Object.getPrototypeOf(document), 'location');
        if (documentLocationDesc && documentLocationDesc.set) {
          Object.defineProperty(document, 'location', documentLocationDesc);
        }
      } catch (e) {
        // document.location might not be configurable
      }
      
      // Restore window.location descriptor
      if (this.locationDescriptor) {
        try {
          Object.defineProperty(window, 'location', this.locationDescriptor);
        } catch (e) {
          console.warn('WHMCS PowerTools: Could not restore window.location descriptor:', e);
        }
      }
      
      // Restore meta refresh tag
      if (this.metaRefreshTag) {
        this.metaRefreshTag.style.display = '';
        const originalContent = this.metaRefreshTag.getAttribute('data-whmcs-original-content');
        if (originalContent) {
          this.metaRefreshTag.setAttribute('content', originalContent);
          this.metaRefreshTag.removeAttribute('data-whmcs-original-content');
        }
      }
    }
  };
  
  // Initialize refresh prevention (with error handling to not break the extension)
  try {
    refreshPrevention.init();
  } catch (e) {
    console.warn('WHMCS PowerTools: Error initializing refresh prevention:', e);
    // Continue even if refresh prevention fails to initialize
  }

  // Detect platform for keyboard shortcuts
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const DEFAULT_SHORTCUT = isMac ? 'meta+shift+f' : 'ctrl+shift+f';
  let customShortcut = DEFAULT_SHORTCUT;

  // Load custom shortcut from storage
  chrome.storage.sync.get(['customShortcut'], (result) => {
    customShortcut = result.customShortcut || DEFAULT_SHORTCUT;
    updateKeyboardHints();
  });

  // Load phone field from storage
  chrome.storage.sync.get(['phoneField'], (result) => {
    if (result.phoneField) {
      phoneField = result.phoneField;
      console.log('WHMCS PowerTools: Loaded phone field:', phoneField);
    }
  });

  // Load function order from storage - but don't update modal yet
  chrome.storage.sync.get(['functionOrder'], (result) => {
    if (result.functionOrder) {
      // Migrate from old structure (userid, email, phone) to new structure (user)
      let migratedOrder = result.functionOrder;
      
      // Check if we need to migrate from old structure
      if (migratedOrder.includes('userid') || migratedOrder.includes('email') || migratedOrder.includes('phone')) {
        // Replace userid, email, phone with 'user'
        migratedOrder = migratedOrder.filter(type => !['userid', 'email', 'phone'].includes(type));
        if (!migratedOrder.includes('user')) {
          migratedOrder.unshift('user'); // Add user at the beginning
        }
        // Save the migrated order
        chrome.storage.sync.set({ functionOrder: migratedOrder });
      }
      
      // Check if the saved order includes the new domain features
      if (!migratedOrder.includes('domain')) {
        migratedOrder = [...migratedOrder, 'domain'];
        // Save the updated order
        chrome.storage.sync.set({ functionOrder: migratedOrder });
      }
      if (!migratedOrder.includes('domainlookup')) {
        migratedOrder = [...migratedOrder, 'domainlookup'];
        // Save the updated order
        chrome.storage.sync.set({ functionOrder: migratedOrder });
      }
      if (!migratedOrder.includes('ticket')) {
        migratedOrder = [...migratedOrder, 'ticket'];
        // Save the updated order
        chrome.storage.sync.set({ functionOrder: migratedOrder });
      }
      if (!migratedOrder.includes('invoice')) {
        migratedOrder = [...migratedOrder, 'invoice'];
        // Save the updated order
        chrome.storage.sync.set({ functionOrder: migratedOrder });
      }
      if (!migratedOrder.includes('order')) {
        migratedOrder = [...migratedOrder, 'order'];
        // Save the updated order
        chrome.storage.sync.set({ functionOrder: migratedOrder });
      }
      
      functionOrder = migratedOrder;
      
      // Set current search type to first function in custom order
      currentSearchType = functionOrder[0];
    }
    // Don't call updateModalFunctionOrder() here - modal HTML doesn't exist yet
  });

  const modalHTML = `
    <div id="whmcs-search-modal-overlay" class="whmcs-modal-overlay">
      <div class="whmcs-modal">
        <div class="whmcs-modal-header">
          <div class="whmcs-modal-title">
            <span class="whmcs-title-icon">🔍</span>
            <span>WHMCS PowerTools</span>
          </div>
          <div class="whmcs-header-actions">
            <button class="whmcs-settings-btn" id="whmcs-settings-btn" title="Settings">⚙️</button>
            <button class="whmcs-close-btn" id="whmcs-close-modal">&times;</button>
          </div>
        </div>
        
        <div class="whmcs-modal-body">
          <div class="whmcs-search-type-selector">
            <button class="whmcs-type-btn active" data-type="user" tabindex="1">
              <span class="whmcs-btn-icon">👤</span>
              <span>User</span>
            </button>
            <button class="whmcs-type-btn" data-type="domain" tabindex="2">
              <span class="whmcs-btn-icon">🌐</span>
              <span>Product</span>
            </button>
            <button class="whmcs-type-btn" data-type="domainlookup" tabindex="3">
              <span class="whmcs-btn-icon">🔍</span>
              <span>Domain</span>
            </button>
          </div>
          
          <div class="whmcs-search-input-container">
            <div class="whmcs-search-input-wrapper">
              <input 
                type="text" 
                id="whmcs-search-input" 
                class="whmcs-search-input" 
                placeholder="Enter User ID..."
                tabindex="4"
                autofocus
              />
              <div class="whmcs-search-icon">🔎</div>
            </div>
          </div>
          
          <div class="whmcs-keyboard-hints">
            <span>↵ Enter to search</span>
            <span>Esc to cancel</span>
            <span>Tab to navigate</span>
            <span id="function-hint">Ctrl+1-6 to switch</span>
            <span id="toggle-hint">Ctrl+Shift+F to toggle</span>
          </div>
          
          <div id="whmcs-search-status" class="whmcs-search-status"></div>
          
          <div id="whmcs-results-container" class="whmcs-results-container"></div>
        </div>
        
        <div class="whmcs-modal-footer">
          <button class="whmcs-btn whmcs-btn-secondary" id="whmcs-cancel-btn">
            <span>Cancel</span>
            <span class="whmcs-keyboard-hint">Esc</span>
          </button>
          <button class="whmcs-btn whmcs-btn-primary" id="whmcs-search-btn">
            <span>🔍</span>
            <span>Search</span>
            <span class="whmcs-keyboard-hint">Enter</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);

  const overlay = document.getElementById('whmcs-search-modal-overlay');
  const closeBtn = document.getElementById('whmcs-close-modal');
  const settingsBtn = document.getElementById('whmcs-settings-btn');
  const cancelBtn = document.getElementById('whmcs-cancel-btn');
  const searchBtn = document.getElementById('whmcs-search-btn');
  const searchInput = document.getElementById('whmcs-search-input');
  const statusDiv = document.getElementById('whmcs-search-status');
  const resultsContainer = document.getElementById('whmcs-results-container');
  const toggleHint = document.getElementById('toggle-hint');
  const functionHint = document.getElementById('function-hint');

  let currentSearchType = 'user';
  let functionOrder = ['user', 'domain', 'domainlookup', 'ticket', 'invoice', 'order'];
  let phoneField = 'customfields[24]'; // Default phone field, can be customized in settings
  
  const placeholders = {
    userid: 'Enter User ID, Email, or Phone...',
    email: 'Enter User ID, Email, or Phone...',
    phone: 'Enter User ID, Email, or Phone...',
    domain: 'Enter domain / ip / hostname to find products...',
    domainlookup: 'Enter domain to lookup...',
    ticket: 'Enter Ticket ID...',
    invoice: 'Enter Invoice ID...',
    order: 'Enter Order ID...'
  };

  const functionConfig = {
    user: { icon: '👥', label: 'User' },
    domain: { icon: '📦', label: 'Product' },
    domainlookup: { icon: '🌐', label: 'Domain' },
    ticket: { icon: '💬', label: 'Ticket' },
    invoice: { icon: '💵', label: 'Invoice' },
    order: { icon: '🛒', label: 'Order' }
  };


  // Set modifier key display based on platform
  const modifierKey = isMac ? '⌘' : 'Ctrl';

  // Update modal function order
  function updateModalFunctionOrder() {
    const selector = document.querySelector('.whmcs-search-type-selector');
    if (!selector) {
      return;
    }

    selector.innerHTML = '';
    
    let buttonIndex = 0; // Track actual button position
    functionOrder.forEach((type) => {
      const config = functionConfig[type];
      if (config) {
        // Create regular button (including User button)
        const button = document.createElement('button');
        button.className = 'whmcs-type-btn';
        button.dataset.type = type;
        button.tabIndex = buttonIndex + 1;
        
        if (type === currentSearchType) {
          button.classList.add('active');
        }
        
        // Add keyboard shortcut hint for first 6 functions using actual button position
        const shortcutHint = buttonIndex < 6 ? `<span class="whmcs-shortcut-hint">${modifierKey}+${buttonIndex + 1}</span>` : '';
        
        button.innerHTML = `
          <span class="whmcs-btn-icon">${config.icon}</span>
          <span>${config.label}</span>
          ${shortcutHint}
        `;
        
        selector.appendChild(button);
        buttonIndex++; // Increment only when button is actually created
      }
    });
    // Re-attach event listeners
    attachTypeButtonListeners();
  }

  // Attach event listeners to type buttons
  function attachTypeButtonListeners() {
    const typeButtons = document.querySelectorAll('.whmcs-type-btn');
    
    typeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        selectSearchType(btn);
      });

      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          selectSearchType(btn);
        }
      });
    });
  }

  function toggleModal() {
    const isActive = overlay.classList.contains('whmcs-active');
    if (isActive) {
      closeModal();
    } else {
      openModal();
    }
  }

  // Function to get selected text from the page
  function getSelectedText() {
    try {
      // Try window.getSelection() first (most common)
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        return selection.toString().trim();
      }
      
      // Fallback to document.getSelection()
      const docSelection = document.getSelection();
      if (docSelection && docSelection.toString().trim()) {
        return docSelection.toString().trim();
      }
      
      // Fallback to activeElement (for input fields)
      const activeElement = document.activeElement;
      if (activeElement) {
        if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
          const start = activeElement.selectionStart || 0;
          const end = activeElement.selectionEnd || 0;
          if (start !== end && activeElement.value) {
            const selectedText = activeElement.value.substring(start, end).trim();
            if (selectedText) {
              return selectedText;
            }
          }
        }
      }
      
      return '';
    } catch (error) {
      console.warn('WHMCS PowerTools: Error getting selected text:', error);
      return '';
    }
  }

  function openModal() {
    // Enable refresh prevention when modal opens (with error handling)
    try {
      refreshPrevention.enable();
    } catch (e) {
      console.warn('WHMCS PowerTools: Error enabling refresh prevention:', e);
      // Continue opening modal even if refresh prevention fails
    }
    
    // Get selected text before opening modal (selection may be lost when modal opens)
    const selectedText = getSelectedText();
    
    // Ensure no other modals are interfering
    overlay.classList.add('whmcs-active');
    
    // Reset modal position to center
    const modal = document.querySelector('.whmcs-modal');
    if (modal) {
      modal.style.position = '';
      modal.style.left = '';
      modal.style.top = '';
      modal.style.transform = '';
      modal.style.margin = '';
      modal.style.zIndex = '';
    }
    
    // Reset overlay positioning (keep it fixed)
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      // Update modal function order to ensure all buttons are present
      updateModalFunctionOrder();
      
      // If there was selected text, put it in the input field
      if (selectedText) {
        searchInput.value = selectedText;
      }
      
      // Focus on the search input for immediate typing
      searchInput.focus();
      
      // Set initial placeholder based on current search type
      searchInput.placeholder = placeholders[currentSearchType] || placeholders.userid;
      
      clearResults();
    }, 100);
  }

  function closeModal() {
    // Disable refresh prevention when modal closes (with error handling)
    try {
      refreshPrevention.disable();
    } catch (e) {
      console.warn('WHMCS PowerTools: Error disabling refresh prevention:', e);
      // Continue closing modal even if refresh prevention fails
    }
    
    overlay.classList.remove('whmcs-active');
    searchInput.value = '';
    clearResults();
    // Remove focus from all modal elements to avoid conflicts
    document.activeElement.blur();
  }

  function clearResults() {
    statusDiv.textContent = '';
    statusDiv.className = 'whmcs-search-status';
    resultsContainer.innerHTML = '';
    // Remove any focus from result items when clearing
    const focusedElement = document.activeElement;
    if (focusedElement && focusedElement.classList.contains('whmcs-result-item')) {
      focusedElement.blur();
    }
  }

  function updateKeyboardHints() {
    const formattedShortcut = customShortcut
      .split('+')
      .map(key => key.charAt(0).toUpperCase() + key.slice(1))
      .join('+');
    toggleHint.textContent = `${formattedShortcut} to toggle`;
    
    // Update function shortcut hint based on platform
    if (functionHint) {
      functionHint.textContent = `${modifierKey}+1-6 to switch`;
    }
  }

  // Detect if text starts with Persian/Arabic characters
  function startsWithPersianArabic(text) {
    if (!text) return false;
    
    // Persian and Arabic Unicode ranges
    const persianArabicRegex = /^[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return persianArabicRegex.test(text.trim());
  }

  // Convert numbers from any language to English numbers
  function convertToEnglishNumbers(text) {
    if (!text) return text;
    
    // Mapping for different number systems to English numbers
    const numberMaps = {
      // Persian/Farsi digits
      '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
      '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
      
      // Arabic digits
      '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
      '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
      
      // Bengali digits
      '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
      '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
      
      // Devanagari digits
      '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
      '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
      
      // Chinese digits
      '零': '0', '一': '1', '二': '2', '三': '3', '四': '4',
      '五': '5', '六': '6', '七': '7', '八': '8', '九': '9',
      
      // Japanese digits
      '〇': '0', '一': '1', '二': '2', '三': '3', '四': '4',
      '五': '5', '六': '6', '七': '7', '八': '8', '九': '9'
    };
    
    let result = text;
    for (const [foreign, english] of Object.entries(numberMaps)) {
      result = result.replace(new RegExp(foreign, 'g'), english);
    }
    
    return result;
  }


  function checkShortcut(e) {
    const keys = customShortcut.split('+');
    const modifiers = {
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey
    };

    // Check if all required modifiers are pressed
    const modifierKeys = keys.filter(k => ['ctrl', 'alt', 'shift', 'meta'].includes(k));
    const regularKey = keys.find(k => !['ctrl', 'alt', 'shift', 'meta'].includes(k));

    let allModifiersMatch = true;
    for (const [modifier, isPressed] of Object.entries(modifiers)) {
      if (modifierKeys.includes(modifier) && !isPressed) {
        allModifiersMatch = false;
        break;
      }
      if (!modifierKeys.includes(modifier) && isPressed) {
        allModifiersMatch = false;
        break;
      }
    }

    // Check if the regular key matches
    const keyPressed = e.key.toLowerCase();
    const keyMatch = regularKey ? keyPressed === regularKey : true;

    return allModifiersMatch && keyMatch;
  }

  function selectSearchType(btn) {
    // Remove active class from all type buttons
    document.querySelectorAll('.whmcs-type-btn').forEach(b => b.classList.remove('active'));
    
    // Add active class to selected button
    btn.classList.add('active');
    currentSearchType = btn.dataset.type;
    
    // Update placeholder based on search type
    searchInput.placeholder = placeholders[currentSearchType] || placeholders.userid;
    
    searchInput.focus();
    clearResults();
  }

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  
  // Settings button click handler
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'open-settings' });
  });

  // Overlay click handler - close modal when clicking background
  overlay.addEventListener('click', (e) => {
    // Only close if clicking directly on the overlay (not child elements)
    if (e.target === overlay) {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    }
  });

  // Convert numbers to English as user types
  searchInput.addEventListener('input', (e) => {
    const originalValue = e.target.value;
    const convertedValue = convertToEnglishNumbers(originalValue);
    
    // Only update if conversion changed something
    if (originalValue !== convertedValue) {
      const cursorPosition = e.target.selectionStart;
      e.target.value = convertedValue;
      
      // Restore cursor position after conversion
      e.target.setSelectionRange(cursorPosition, cursorPosition);
    }
  });


  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggle-whmcs-modal') {
      toggleModal();
    } else if (request.action === 'update-shortcut') {
      customShortcut = request.shortcut || DEFAULT_SHORTCUT;
      updateKeyboardHints();
    } else if (request.action === 'update-settings') {
      customShortcut = request.shortcut || DEFAULT_SHORTCUT;
      if (request.functionOrder) {
        // Migrate from old structure if needed
        let migratedOrder = request.functionOrder;
        if (migratedOrder.includes('userid') || migratedOrder.includes('email') || migratedOrder.includes('phone')) {
          migratedOrder = migratedOrder.filter(type => !['userid', 'email', 'phone'].includes(type));
          if (!migratedOrder.includes('user')) {
            migratedOrder.unshift('user');
          }
        }
        functionOrder = migratedOrder;
        // Set current search type to first function in custom order
        currentSearchType = functionOrder[0];
        updateModalFunctionOrder();
      }
      if (request.phoneField) {
        phoneField = request.phoneField;
        console.log('WHMCS PowerTools: Updated phone field to:', phoneField);
      }
      updateKeyboardHints();
    }
  });

  // Keyboard listener with custom shortcut support - Scoped to avoid WHMCS conflicts
  document.addEventListener('keydown', (e) => {
    // Only handle our modal's keyboard events when it's active
    const isOurModalActive = overlay.classList.contains('whmcs-active');
    
    // Check custom shortcut
    if (checkShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      toggleModal();
      return;
    }
    
    // Only handle keyboard events when our modal is active
    if (isOurModalActive) {
      // Handle Ctrl/Command + 1-6 for quick function switching
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 6) {
          e.preventDefault();
          e.stopPropagation();
          
          // Get the button at index (num - 1)
          const buttons = document.querySelectorAll('.whmcs-type-btn');
          if (buttons[num - 1]) {
            selectSearchType(buttons[num - 1]);
          }
          return;
        }
      }
      
      // Handle Tab navigation within modal (type buttons, search input, and results)
      if (e.key === 'Tab') {
        const resultItems = document.querySelectorAll('.whmcs-result-item');
        const typeButtons = document.querySelectorAll('.whmcs-type-btn');
        const focusableElements = [
          ...typeButtons,
          searchInput,
          ...resultItems
        ];
        
        const currentIndex = focusableElements.indexOf(document.activeElement);
        
        if (e.shiftKey) {
          // Shift + Tab (backward)
          e.preventDefault();
          const prevIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
          focusableElements[prevIndex].focus();
        } else {
          // Tab (forward)
          e.preventDefault();
          const nextIndex = currentIndex >= focusableElements.length - 1 ? 0 : currentIndex + 1;
          focusableElements[nextIndex].focus();
        }
        return;
      }
      
      // Handle Escape key to cancel/close modal
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
        return;
      }
      
      // Handle Enter key - only trigger search when input is focused
      if (e.key === 'Enter') {
        if (e.target === searchInput) {
          // Enter on input field triggers search
          e.preventDefault();
          e.stopPropagation();
          performSearch();
          return;
        } else if (e.target.classList.contains('whmcs-result-item')) {
          // Enter on result item triggers its keydown handler (which opens the page)
          // Don't prevent default - let the result item's keydown handler handle it
          return;
        } else {
          // Enter on other elements triggers their default action (click)
          e.preventDefault();
          e.stopPropagation();
          e.target.click();
          return;
        }
      }
    }
  }, true); // Use capture phase to handle before WHMCS

  searchBtn.addEventListener('click', performSearch);

  async function validateUserId(userId) {
    try {
      const response = await fetch(`${BASE_URL}${ADMIN_PATH}/clientssummary.php?userid=${userId}`, {
        credentials: 'include'
      });
      
      // IMPORTANT: Check for access denied
      // If the response URL contains "accessdenied.php", it means the user was redirected due to lack of permissions
      // This is more accurate than checking response.redirected alone, as some features may redirect for legitimate reasons
      // This applies to all features - always check response.url for "accessdenied.php" before processing
      if (response.url.includes('accessdenied.php')) {
        throw new Error('ACCESS_DENIED');
      }
      
      const html = await response.text();
      
      if (html.includes('Client Not Found') || 
          html.includes('Invalid Client') || 
          html.includes('does not exist') ||
          response.url.includes('clients.php') ||
          html.includes('No Client Found')) {
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error validating user ID:', error);
      if (error.message === 'ACCESS_DENIED') {
        throw error;
      }
      return false;
    }
  }

  async function searchClientByEmail(email) {
    const tokenInput = document.querySelector('input[name="token"]');
    const token = tokenInput ? tokenInput.value : '';
    
    const formData = new URLSearchParams({
      'token': token,
      'status': 'any',
      'name': '',
      'email': email,
      'country-calling-code-phone': '1',
      'phone': '',
      'group': '0',
      'email2': '',
      'address1': '',
      'address2': '',
      'city': '',
      'state': '',
      'postcode': '',
      'country': '',
      'country-calling-code-phone2': '1',
      'phone2': '',
      'group2': '0',
      'paymentmethod': '',
      'cctype': '',
      'cclastfour': '',
      'autoccbilling': '',
      'credit': '',
      'currency': '',
      'signupdaterange': '',
      'language': '',
      'marketingoptin': '',
      'autostatus': '',
      'taxexempt': '',
      'latefees': '',
      'overduenotices': '',
      'separateinvoices': ''
    });
    
    try {
      const response = await fetch(`${BASE_URL}${ADMIN_PATH}/clients.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
        credentials: 'include'
      });
      
      // IMPORTANT: Check for access denied
      // If the response URL contains "accessdenied.php", it means the user was redirected due to lack of permissions
      // This is more accurate than checking response.redirected alone, as some features may redirect for legitimate reasons
      // This applies to all features - always check response.url for "accessdenied.php" before processing
      if (response.url.includes('accessdenied.php')) {
        throw new Error('ACCESS_DENIED');
      }
      
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Check if there's a "no results" message - IMPORTANT: Check this FIRST before other validations
      const bodyText = doc.body.textContent;
      if (bodyText.includes('0 Records Found') || 
          bodyText.includes('No Clients Found') || 
          bodyText.includes('No Results')) {
        console.log('WHMCS PowerTools: Page contains "no results" message');
        return null;
      }
      
      if (response.url.includes('clientssummary.php')) {
        const match = response.url.match(/userid=(\d+)/);
        if (match) {
          const clientDetails = await fetchClientDetails(match[1]);
          return clientDetails;
        }
      }
      
      const rows = doc.querySelectorAll('table.table tbody tr');
      for (const row of rows) {
        const link = row.querySelector('a[href*="clientssummary.php?userid="]');
        if (link) {
          const match = link.href.match(/userid=(\d+)/);
          if (match) {
            const cells = row.querySelectorAll('td');
            const name = cells[0]?.textContent.trim() || '';
            const clientEmail = cells[2]?.textContent.trim() || '';
            const phone = cells[3]?.textContent.trim() || '';
            
            return {
              userId: match[1],
              name: name,
              email: clientEmail,
              phone: phone
            };
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Email search error:', error);
      if (error.message === 'ACCESS_DENIED') {
        throw error; // Re-throw access denied errors to be handled by performSearch
      }
      return null;
    }
  }

  async function searchClientByPhone(phone) {
    const tokenInput = document.querySelector('input[name="token"]');
    const token = tokenInput ? tokenInput.value : '';
    
    const formData = new URLSearchParams({
      'token': token,
      'status': 'any',
      'name': '',
      'email': '',
      'country-calling-code-phone': '1',
      'phone': '',
      'group': '0',
      'email2': '',
      'address1': '',
      'address2': '',
      'city': '',
      'state': '',
      'postcode': '',
      'country': '',
      'country-calling-code-phone2': '1',
      'phone2': '',
      'group2': '0',
      'paymentmethod': '',
      'cctype': '',
      'cclastfour': '',
      'autoccbilling': '',
      'credit': '',
      'currency': '',
      'signupdaterange': '',
      'language': '',
      'marketingoptin': '',
      'autostatus': '',
      'taxexempt': '',
      'latefees': '',
      'overduenotices': '',
      'separateinvoices': '',
      [phoneField]: phone  // Use configurable phone field from settings
    });
    
    try {
      const response = await fetch(`${BASE_URL}${ADMIN_PATH}/clients.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
        credentials: 'include'
      });
      
      // IMPORTANT: Check for access denied
      // If the response URL contains "accessdenied.php", it means the user was redirected due to lack of permissions
      // This is more accurate than checking response.redirected alone, as some features may redirect for legitimate reasons
      // This applies to all features - always check response.url for "accessdenied.php" before processing
      if (response.url.includes('accessdenied.php')) {
        throw new Error('ACCESS_DENIED');
      }
      
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Check if there's a "no results" message - IMPORTANT: Check this FIRST before other validations
      const bodyText = doc.body.textContent;
      if (bodyText.includes('0 Records Found') || 
          bodyText.includes('No Clients Found') || 
          bodyText.includes('No Results')) {
        console.log('WHMCS PowerTools: Page contains "no results" message');
        return [];
      }
      
      const clientIds = [];
      const clients = [];
      const clientDataFromTable = {};
      
      if (response.url.includes('clientssummary.php')) {
        const match = response.url.match(/userid=(\d+)/);
        if (match) {
          clientIds.push(match[1]);
        }
      } else {
        const rows = doc.querySelectorAll('table.table tbody tr, .table-container tbody tr, tbody tr');
        rows.forEach(row => {
          const link = row.querySelector('a[href*="clientssummary.php?userid="]');
          if (link) {
            const match = link.href.match(/userid=(\d+)/);
            if (match) {
              const userId = match[1];
              if (!clientIds.includes(userId)) {
                clientIds.push(userId);
                
                const cells = row.querySelectorAll('td');
                if (cells.length > 0) {
                  const rowData = {
                    name: cells[0]?.textContent.trim() || '',
                    email: cells[1]?.textContent.trim() || cells[2]?.textContent.trim() || ''
                  };
                  
                  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+$/;
                  if (emailRegex.test(rowData.email)) {
                    clientDataFromTable[userId] = rowData;
                  } else if (cells[1] && emailRegex.test(cells[1].textContent.trim())) {
                    clientDataFromTable[userId] = {
                      name: rowData.name,
                      email: cells[1].textContent.trim()
                    };
                  }
                }
              }
            }
          }
        });
        
        if (clientIds.length === 0) {
          const links = doc.querySelectorAll('a[href*="clientssummary.php?userid="]');
          links.forEach(link => {
            const match = link.href.match(/userid=(\d+)/);
            if (match && !clientIds.includes(match[1])) {
              clientIds.push(match[1]);
            }
          });
        }
      }
      
      for (const userId of clientIds) {
        const clientDetails = await fetchClientDetails(userId);
        if (clientDetails) {
          if (clientDataFromTable[userId]) {
            if (!clientDetails.email && clientDataFromTable[userId].email) {
              clientDetails.email = clientDataFromTable[userId].email;
            }
            if (clientDetails.name === `Client #${userId}` && clientDataFromTable[userId].name) {
              clientDetails.name = clientDataFromTable[userId].name;
            }
          }
          clients.push(clientDetails);
        }
      }
      
      return clients;
    } catch (error) {
      console.error('Phone search error:', error);
      if (error.message === 'ACCESS_DENIED') {
        throw error; // Re-throw access denied errors to be handled by performSearch
      }
      return [];
    }
  }

  // Helper function to fetch userid from service detail page
  async function fetchUseridFromServiceDetail(serviceUrl) {
    try {
      const response = await fetch(serviceUrl, {
        credentials: 'include'
      });
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Look for userid in the page - it might be in a link or form
      const useridMatch = html.match(/userid=(\d+)/);
      if (useridMatch) {
        return useridMatch[1];
      }
      
      // Look for client links that might contain userid
      const clientLinks = doc.querySelectorAll('a[href*="clientssummary.php?userid="]');
      if (clientLinks.length > 0) {
        const match = clientLinks[0].href.match(/userid=(\d+)/);
        if (match) {
          return match[1];
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching userid from service detail:', error);
      return null;
    }
  }

  async function searchProductByDomain(domain) {
    const tokenInput = document.querySelector('input[name="token"]');
    const token = tokenInput ? tokenInput.value : '';
    
    // Detect if input is an IP address (simple pattern: digits and dots)
    const isIPAddress = /^(\d{1,3}\.){1,3}\d{1,3}$/.test(domain.trim());
    
    console.log('WHMCS PowerTools: Product search input:', domain, '| Is IP:', isIPAddress);
    
    const formData = new URLSearchParams({
      'token': token,
      'type': '',
      'server': '',
      'package': '',
      'paymentmethod': '',
      'billingcycle': '',
      'status': '',
      'domain': isIPAddress ? '' : domain,  // Send to domain only if NOT an IP
      'dedicatedip': isIPAddress ? domain : '',  // Send to dedicatedip only if IS an IP
      'customfield': '0',
      'clientname': '',
      'customfieldvalue': ''
    });
    
    try {
      const response = await fetch(`${BASE_URL}${ADMIN_PATH}/index.php?rp=${ADMIN_PATH}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
        credentials: 'include'
      });
      
      // IMPORTANT: Check for access denied
      // If the response URL contains "accessdenied.php", it means the user was redirected due to lack of permissions
      // This is more accurate than checking response.redirected alone, as some features may redirect for legitimate reasons
      // This applies to all features - always check response.url for "accessdenied.php" before processing
      if (response.url.includes('accessdenied.php')) {
        throw new Error('ACCESS_DENIED');
      }
      
      const html = await response.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Check if there's a "no results" message - IMPORTANT: Check this FIRST before other validations
      const bodyText = doc.body.textContent;
      if (bodyText.includes('0 Records Found') || 
          bodyText.includes('No Results') || 
          bodyText.includes('No Services Found')) {
        console.log('WHMCS PowerTools: Page contains "no results" message');
        return [];
      }
      
      // Look for service/product results
      const services = [];
      const rows = doc.querySelectorAll('table.table tbody tr, .table-container tbody tr, tbody tr');
      
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
          const serviceData = {
            domain: '',
            client: '',
            clientEmail: '',
            product: '',
            server: '',
            status: '',
            nextDue: '',
            url: '',
            userid: ''
          };
          
          // Extract data from table cells
          cells.forEach((cell, index) => {
            const text = cell.textContent.trim();
            const link = cell.querySelector('a');
            
            // Check if this is a client profile link - this helps identify the client name column
            const clientLink = cell.querySelector('a[href*="clientssummary"]');
            if (clientLink && clientLink.href) {
              // This cell contains the client name
              serviceData.client = clientLink.textContent.trim() || text;
              // Extract userid from the client link
              const useridMatch = clientLink.href.match(/userid=(\d+)/);
              if (useridMatch) {
                serviceData.userid = useridMatch[1];
              }
            }
            
            if (link && link.href) {
              // Use the first link as service URL (if not already a client link)
              if (!link.href.includes('clientssummary')) {
                serviceData.url = link.href;
              }
              // Try to extract userid from the URL if it contains it (fallback)
              const useridMatch = link.href.match(/userid=(\d+)/);
              if (useridMatch && !serviceData.userid) {
                serviceData.userid = useridMatch[1];
              }
            }
            
            // Try to identify columns based on content patterns
            if (text.includes(domain)) {
              // Clean up domain - remove extra www
              serviceData.domain = text.replace(/\s+www$/, '').trim();
            } else if (text.includes('@') && text.includes('.') && text.length > 5) {
              // This looks like an email address (more flexible pattern)
              serviceData.clientEmail = text;
            } else if (text.match(/^(Active|Suspended|Pending|Terminated|Cancelled)$/i)) {
              serviceData.status = text;
            } else if (text.match(/^\d{4}-\d{2}-\d{2}$/)) {
              serviceData.nextDue = text;
            } else if (text.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/) && !text.includes('@') && text.length > 3) {
              // This looks like a server/hostname (domain without @)
              serviceData.server = text;
            } else if (text && !text.match(/^\d+$/) && !text.includes('@') && text.length > 2) {
              // For product name, check if we haven't already assigned client name
              // If we already have a client name, this is likely the product
              // If we don't have a client name and this isn't a known pattern, it might be product or client
              if (!serviceData.client && !serviceData.product) {
                // We don't know yet - this could be either, but prioritize as product
                // since we check for client links first above
                serviceData.product = text;
              } else if (serviceData.client && !serviceData.product) {
                // We have client, so this must be product
                serviceData.product = text;
              } else if (!serviceData.client && serviceData.product) {
                // We have product but not client - this might be client (check if it's different)
                // Only assign if it's different from product
                if (text !== serviceData.product) {
                  serviceData.client = text;
                }
              }
            }
          });
          
          if (serviceData.domain || serviceData.url) {
            services.push(serviceData);
          }
        }
      }
      
      return services;
      
    } catch (error) {
      console.error('Domain search error:', error);
      if (error.message === 'ACCESS_DENIED') {
        throw error; // Re-throw access denied errors to be handled by performSearch
      }
      return [];
    }
  }

  // Helper function to fetch detailed domain information
  async function fetchDomainDetails(userid, domainId) {
    try {
      const url = `${BASE_URL}${ADMIN_PATH}/clientsdomains.php?userid=${userid}&id=${domainId}`;
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include'
      });
      
      if (response.url.includes('accessdenied.php')) {
        return null;
      }
      
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract registration date
      const regDateInput = doc.querySelector('#inputRegDate');
      const registrationDate = regDateInput ? regDateInput.value : '';
      
      // Extract expiry date
      const expiryDateInput = doc.querySelector('#inputExpiryDate');
      const expiryDate = expiryDateInput ? expiryDateInput.value : '';
      
      // Extract next due date
      const nextDueDateInput = doc.querySelector('#inputNextDueDate');
      const nextDueDate = nextDueDateInput ? nextDueDateInput.value : '';
      
      return {
        registrationDate,
        expiryDate,
        nextDueDate
      };
    } catch (error) {
      console.error('WHMCS PowerTools: Error fetching domain details:', error);
      return null;
    }
  }

  async function searchDomainLookup(domain) {
    const tokenInput = document.querySelector('input[name="token"]');
    const token = tokenInput ? tokenInput.value : '';
    
    const formData = new URLSearchParams({
      'token': token,
      'domain': domain,
      'status': '',
      'registrar': '',
      'clientname': ''
    });
    
    try {
      const response = await fetch(`${BASE_URL}${ADMIN_PATH}/index.php?rp=${ADMIN_PATH}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
        credentials: 'include'
      });
      
      // IMPORTANT: Check for access denied
      // If the response URL contains "accessdenied.php", it means the user was redirected due to lack of permissions
      // This is more accurate than checking response.redirected alone, as some features may redirect for legitimate reasons
      // This applies to all features - always check response.url for "accessdenied.php" before processing
      if (response.url.includes('accessdenied.php')) {
        throw new Error('ACCESS_DENIED');
      }
      
      const html = await response.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Check if there's a "no results" message - IMPORTANT: Check this FIRST before other validations
      const bodyText = doc.body.textContent;
      if (bodyText.includes('0 Records Found') || 
          bodyText.includes('No Results') || 
          bodyText.includes('No Domains Found')) {
        console.log('WHMCS PowerTools: Page contains "no results" message');
        return [];
      }
      
      // Look for domain results
      const domains = [];
      const rows = doc.querySelectorAll('table.table tbody tr, .table-container tbody tr, tbody tr');
      
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
          const domainData = {
            domain: '',
            client: '',
            clientEmail: '',
            registrar: '',
            status: '',
            expiryDate: '',
            url: '',
            userid: '',
            domainId: ''
          };
          
          // Extract data from table cells
          cells.forEach((cell, index) => {
            const text = cell.textContent.trim();
            const link = cell.querySelector('a');
            
            if (link && link.href) {
              domainData.url = link.href;
              // Try to extract userid and domainId from the URL
              const useridMatch = link.href.match(/userid=(\d+)/);
              if (useridMatch) {
                domainData.userid = useridMatch[1];
              }
              
              // Extract domain ID from URL like /domains/detail/12345
              const domainIdMatch = link.href.match(/\/domains\/detail\/(\d+)/);
              if (domainIdMatch) {
                domainData.domainId = domainIdMatch[1];
              }
            }
            
            // Try to identify columns based on content patterns
            if (text.includes(domain)) {
              domainData.domain = text.trim();
            } else if (text.includes('@') && text.includes('.') && text.length > 5) {
              // This looks like an email address
              domainData.clientEmail = text;
            } else if (text.match(/^(Pending Registration|Pending Transfer|Pending|Active|Grace Period \(Expired\)|Redemption Period \(Expired\)|Expired|Transferred Away|Cancelled|Fraud|Suspended|Terminated)$/i)) {
              domainData.status = text;
            } else if (text.match(/^\d{4}-\d{2}-\d{2}$/)) {
              domainData.expiryDate = text;
            } else if (text && !domainData.client && !text.match(/^\d+$/) && !text.includes('@') && text.length > 2) {
              domainData.client = text;
            } else if (text && !domainData.registrar && !text.match(/^\d+$/) && !text.includes('@') && text.length > 2) {
              domainData.registrar = text;
            }
          });
          
          if (domainData.domain || domainData.url) {
            domains.push(domainData);
          }
        }
      }
      
      return domains;
      
    } catch (error) {
      console.error('Domain lookup error:', error);
      if (error.message === 'ACCESS_DENIED') {
        throw error; // Re-throw access denied errors to be handled by performSearch
      }
      return [];
    }
  }

  async function searchTicketById(ticketId) {
    const tokenInput = document.querySelector('input[name="token"]');
    const token = tokenInput ? tokenInput.value : '';
    
    // Clean ticket ID - remove any leading 't' or '#' if present
    let cleanTicketId = ticketId.trim();
    if (cleanTicketId.toLowerCase().startsWith('t')) {
      cleanTicketId = cleanTicketId.substring(1);
    }
    if (cleanTicketId.startsWith('#')) {
      cleanTicketId = cleanTicketId.substring(1);
    }
    
    const formData = new URLSearchParams({
      'token': token,
      'client': '',
      'multi_view_exists': '1',
      'subject': '',
      'email': '',
      'ticketid': `t${cleanTicketId}`,
      'searchflag': ''
    });
    
    try {
      console.log('WHMCS PowerTools: Ticket search request:', {
        url: `${BASE_URL}${ADMIN_PATH}/supporttickets.php`,
        payload: formData.toString(),
        searchingFor: `t${cleanTicketId}`
      });
      
      const response = await fetch(`${BASE_URL}${ADMIN_PATH}/supporttickets.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
        credentials: 'include'
      });
      
      console.log('WHMCS PowerTools: Ticket search response:', {
        status: response.status,
        url: response.url,
        redirected: response.redirected
      });
      
      // IMPORTANT: Check for access denied
      // If the response URL contains "accessdenied.php", it means the user was redirected due to lack of permissions
      // This is more accurate than checking response.redirected alone, as some features may redirect for legitimate reasons
      // This applies to all features - always check response.url for "accessdenied.php" before processing
      if (response.url.includes('accessdenied.php')) {
        throw new Error('ACCESS_DENIED');
      }
      
      const html = await response.text();
      console.log('WHMCS PowerTools: Ticket search HTML length:', {
        htmlLength: html.length,
        redirected: response.redirected
      });
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Check if there's a "no results" message - IMPORTANT: Check this FIRST before other validations
      const bodyText = doc.body.textContent;
      if (bodyText.includes('No Tickets Found') || 
          bodyText.includes('No Results') || 
          bodyText.includes('No tickets match') ||
          bodyText.includes('0 Records Found')) {
        console.log('WHMCS PowerTools: Page contains "no results" message');
        return [];
      }
      
      // Simple check: Does the response contain our ticket ID?
      const searchTicketId = `t${cleanTicketId}`;
      const ticketIdExists = html.toLowerCase().includes(searchTicketId.toLowerCase());
      
      console.log('WHMCS PowerTools: Searching for ticket ID:', searchTicketId);
      console.log('WHMCS PowerTools: Ticket ID found in response:', ticketIdExists);
      
      // If ticket ID exists in HTML, it means the search was successful
      if (!ticketIdExists) {
        console.log('WHMCS PowerTools: ❌ Ticket ID not found in response');
        return [];
      }
      
      console.log('WHMCS PowerTools: ✅ Ticket found in response! Extracting details...');
      
      // Extract ticket details from the HTML based on WHMCS structure
      let ticketSubject = '';
      let ticketId = searchTicketId;
      let ticketStatus = '';
      let ticketDepartment = '';
      let clientName = '';
      let clientEmail = '';
      
      // 1. Extract Ticket Subject and ID from element with class "ticket-subject"
      // Format: "#t208363 - ثبت هاست"
      const ticketSubjectElement = doc.querySelector('.ticket-subject');
      if (ticketSubjectElement) {
        // Clone the element to avoid modifying the original
        const clone = ticketSubjectElement.cloneNode(true);
        
        // Remove all child elements (like select, option, etc.) to get only direct text
        const childElements = clone.querySelectorAll('*');
        childElements.forEach(child => child.remove());
        
        const fullText = clone.textContent.trim();
        console.log('WHMCS PowerTools: Found ticket-subject text (cleaned):', fullText);
        
        // Split by " - " to separate ticket ID from subject
        const parts = fullText.split(' - ');
        if (parts.length >= 2) {
          // First part is ticket ID (e.g., "#t208363")
          const idPart = parts[0].trim();
          ticketId = idPart.replace('#', '').trim(); // Remove # if present
          
          // Rest is the subject
          ticketSubject = parts.slice(1).join(' - ').trim();
          
          console.log('WHMCS PowerTools: Extracted Ticket ID:', ticketId);
          console.log('WHMCS PowerTools: Extracted Subject:', ticketSubject);
        } else {
          ticketSubject = fullText;
        }
      }
      
      // 2. Extract Ticket Status from selected option in element with id "ticketstatus"
      const ticketStatusSelect = doc.querySelector('#ticketstatus');
      if (ticketStatusSelect) {
        const selectedOption = ticketStatusSelect.querySelector('option[selected]') || 
                              ticketStatusSelect.options[ticketStatusSelect.selectedIndex];
        if (selectedOption) {
          ticketStatus = selectedOption.textContent.trim();
          console.log('WHMCS PowerTools: Extracted Status:', ticketStatus);
        }
      }
      
      // 2.5. Extract Ticket Department - Find element with "Department", then get select in next div
      const departmentSpans = doc.querySelectorAll('span, label, div');
      for (const element of departmentSpans) {
        if (element.textContent.trim() === 'Department') {
          console.log('WHMCS PowerTools: Found Department element');
          
          // Find the next div element after this element
          let nextElement = element.nextElementSibling;
          while (nextElement) {
            if (nextElement.tagName === 'DIV') {
              // Look for select element inside this div
              const departmentSelect = nextElement.querySelector('select');
              if (departmentSelect) {
                const selectedDeptOption = departmentSelect.querySelector('option[selected]') || 
                                          departmentSelect.options[departmentSelect.selectedIndex];
                if (selectedDeptOption) {
                  ticketDepartment = selectedDeptOption.textContent.trim();
                  console.log('WHMCS PowerTools: Extracted Department:', ticketDepartment);
                }
              }
              break;
            }
            nextElement = nextElement.nextElementSibling;
          }
          break;
        }
      }
      
      // 3. Extract Client Name - Find span with "Requestor", then get next div
      let clientUserId = '';
      const allSpans = doc.querySelectorAll('span');
      for (const span of allSpans) {
        if (span.textContent.trim() === 'Requestor') {
          console.log('WHMCS PowerTools: Found Requestor span');
          
          // Find the next div element after this span
          let nextElement = span.nextElementSibling;
          while (nextElement) {
            if (nextElement.tagName === 'DIV') {
              // Try to extract userId from client link - search in the div and all its children
              const clientLink = nextElement.querySelector('a[href*="clientssummary"]');
              if (clientLink && clientLink.href) {
                const useridMatch = clientLink.href.match(/userid=(\d+)/);
                if (useridMatch) {
                  clientUserId = useridMatch[1];
                  console.log('WHMCS PowerTools: Extracted Client UserId from link:', clientUserId);
                  // If we found the link, use its text content as the client name
                  clientName = clientLink.textContent.trim();
                  console.log('WHMCS PowerTools: Extracted Client Name from link:', clientName);
                }
              }
              
              // If we didn't find client name from link, extract it from the div text
              if (!clientName || !clientUserId) {
                // 4. Extract Client Email first - First div inside the client name div
                const firstDiv = nextElement.querySelector('div');
                if (firstDiv) {
                  clientEmail = firstDiv.textContent.trim();
                  console.log('WHMCS PowerTools: Extracted Client Email:', clientEmail);
                }
                
                // Clone the element to extract only direct text (not nested elements)
                const clone = nextElement.cloneNode(true);
                
                // Remove all child elements to get only direct text nodes
                const childDivs = clone.querySelectorAll('*');
                childDivs.forEach(child => child.remove());
                
                if (!clientName) {
                  clientName = clone.textContent.trim();
                  console.log('WHMCS PowerTools: Extracted Client Name (cleaned):', clientName);
                }
              }
              
              break;
            }
            nextElement = nextElement.nextElementSibling;
          }
          break;
        }
      }
      
      // Fallback: If we didn't find userId from Requestor section, search the entire document
      if (!clientUserId) {
        const allClientLinks = doc.querySelectorAll('a[href*="clientssummary"]');
        for (const link of allClientLinks) {
          const useridMatch = link.href.match(/userid=(\d+)/);
          if (useridMatch) {
            clientUserId = useridMatch[1];
            console.log('WHMCS PowerTools: Extracted Client UserId from fallback search:', clientUserId);
            // Use this link's text if we don't have a client name yet
            if (!clientName) {
              clientName = link.textContent.trim();
              console.log('WHMCS PowerTools: Extracted Client Name from fallback link:', clientName);
            }
            break;
          }
        }
      }
      
      console.log('WHMCS PowerTools: ==================== FINAL EXTRACTED DATA ====================');
      console.log('WHMCS PowerTools: Ticket Subject:', ticketSubject);
      console.log('WHMCS PowerTools: Ticket ID:', ticketId);
      console.log('WHMCS PowerTools: Ticket Status:', ticketStatus);
      console.log('WHMCS PowerTools: Ticket Department:', ticketDepartment);
      console.log('WHMCS PowerTools: Client Name:', clientName);
      console.log('WHMCS PowerTools: Client Email:', clientEmail);
      console.log('WHMCS PowerTools: ================================================================');
      
      // Create ticket result with extracted details
      return [{
        ticketId: ticketId,
        subject: ticketSubject || 'Support Ticket',
        status: ticketStatus || '',
        department: ticketDepartment || '',
        client: clientName || '',
        clientUserId: clientUserId || '',
        email: clientEmail || '',
        url: `${BASE_URL}${ADMIN_PATH}/supporttickets.php?ticketid=${searchTicketId}`,
        priority: '',
        lastReply: ''
      }];
      
    } catch (error) {
      console.error('WHMCS PowerTools: Ticket search error:', error);
      if (error.message === 'ACCESS_DENIED') {
        throw error; // Re-throw access denied errors to be handled by performSearch
      }
      return [];
    }
  }

  async function searchInvoiceById(invoiceId) {
    const tokenInput = document.querySelector('input[name="token"]');
    const token = tokenInput ? tokenInput.value : '';
    
    // Clean invoice ID - remove any leading '#' if present
    let cleanInvoiceId = invoiceId.trim();
    if (cleanInvoiceId.startsWith('#')) {
      cleanInvoiceId = cleanInvoiceId.substring(1);
    }
    
    const formData = new URLSearchParams({
      'token': token,
      'clientid': '',
      'invoicedate': '',
      'invoicenum': cleanInvoiceId,
      'duedate': '',
      'lineitem': '',
      'datepaid': '',
      'paymentmethod': '',
      'last_capture_attempt': '',
      'status': '',
      'date_refunded': '',
      'totalfrom': '',
      'totalto': '',
      'date_cancelled': ''
    });
    
    try {
      console.log('WHMCS PowerTools: Invoice search request:', {
        url: `${BASE_URL}${ADMIN_PATH}/invoices.php`,
        payload: formData.toString(),
        searchingFor: cleanInvoiceId
      });
      
      const response = await fetch(`${BASE_URL}${ADMIN_PATH}/invoices.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
        credentials: 'include'
      });
      
      console.log('WHMCS PowerTools: Invoice search response:', {
        status: response.status,
        url: response.url,
        redirected: response.redirected
      });
      
      // IMPORTANT: Check for access denied
      // If the response URL contains "accessdenied.php", it means the user was redirected due to lack of permissions
      // This is more accurate than checking response.redirected alone, as some features may redirect for legitimate reasons
      // This applies to all features - always check response.url for "accessdenied.php" before processing
      if (response.url.includes('accessdenied.php')) {
        throw new Error('ACCESS_DENIED');
      }
      
      const html = await response.text();
      console.log('WHMCS PowerTools: Invoice search HTML length:', {
        htmlLength: html.length
      });
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Check if there's a "no results" message - IMPORTANT: Check this FIRST before other validations
      const bodyText = doc.body.textContent;
      if (bodyText.includes('No Invoices Found') || 
          bodyText.includes('No Results') || 
          bodyText.includes('0 Records Found')) {
        console.log('WHMCS PowerTools: Page contains "no results" message');
        return [];
      }
      
      // Simple check: Does the response contain our invoice ID?
      const invoiceIdExists = html.includes(cleanInvoiceId);
      
      console.log('WHMCS PowerTools: Searching for invoice ID:', cleanInvoiceId);
      console.log('WHMCS PowerTools: Invoice ID found in response:', invoiceIdExists);
      
      // If invoice ID doesn't exist in HTML, no results
      if (!invoiceIdExists) {
        console.log('WHMCS PowerTools: ❌ Invoice ID not found in response');
        return [];
      }
      
      console.log('WHMCS PowerTools: ✅ Invoice found in response! Extracting details...');
      
      // Extract invoice details from the invoice detail page
      let invoiceNumber = cleanInvoiceId;
      let clientName = '';
      let clientUserId = '';
      let invoiceDate = '';
      let dueDate = '';
      let status = '';
      let paymentDate = '';
      
      // 1. Extract Invoice Number from page title or h1
      const h1Element = doc.querySelector('h1');
      if (h1Element) {
        const h1Text = h1Element.textContent.trim();
        const invoiceMatch = h1Text.match(/Invoice #(\d+)/i);
        if (invoiceMatch) {
          invoiceNumber = invoiceMatch[1];
          console.log('WHMCS PowerTools: Extracted Invoice Number from H1:', invoiceNumber);
        }
      }
      
      // 2. Extract Client Name - Look for "Client Name" label in the summary table
      const allTableRows = doc.querySelectorAll('table.form tr');
      for (const row of allTableRows) {
        const label = row.querySelector('.fieldlabel');
        const value = row.querySelector('.fieldarea');
        
        if (label && value) {
          const labelText = label.textContent.trim();
          
          if (labelText === 'Client Name') {
            // Client name is in a link
            const clientLink = value.querySelector('a[href*="clientssummary"]');
            if (clientLink) {
              clientName = clientLink.textContent.trim();
              console.log('WHMCS PowerTools: Extracted Client Name:', clientName);
              // Extract userId from the link href
              const useridMatch = clientLink.href.match(/userid=(\d+)/);
              if (useridMatch) {
                clientUserId = useridMatch[1];
                console.log('WHMCS PowerTools: Extracted Client UserId from link:', clientUserId);
              }
            }
          } else if (labelText === 'Invoice Date') {
            invoiceDate = value.textContent.trim();
            console.log('WHMCS PowerTools: Extracted Invoice Date:', invoiceDate);
          } else if (labelText === 'Due Date') {
            dueDate = value.textContent.trim();
            console.log('WHMCS PowerTools: Extracted Due Date:', dueDate);
          }
        }
      }
      
      // 3. Extract Status - Look for the large status text in the right column
      // Status is usually in a span with class textgreen, textred, etc.
      const statusSpans = doc.querySelectorAll('span.textgreen, span.textred, span[style*="font-size:20px"]');
      for (const span of statusSpans) {
        const statusText = span.textContent.trim();
        if (statusText.match(/^(Unpaid|Paid|Cancelled|Refunded|Collections|Payment Pending|Draft)$/i)) {
          status = statusText;
          console.log('WHMCS PowerTools: Extracted Status:', status);
          break;
        }
      }
      
      // 4. Extract Payment Date - Look for date/time after status (only if status is Paid)
      if (status.toLowerCase() === 'paid') {
        // Payment date is usually shown as bold text after the status
        const boldElements = doc.querySelectorAll('b');
        for (const bold of boldElements) {
          const text = bold.textContent.trim();
          // Match date patterns like "28/10/2025 03:10" or "28/10/2025"
          if (text.match(/^\d{2}\/\d{2}\/\d{4}/) || text.match(/^\d{4}-\d{2}-\d{2}/)) {
            paymentDate = text;
            console.log('WHMCS PowerTools: Extracted Payment Date:', paymentDate);
            break;
          }
        }
      }
      
      console.log('WHMCS PowerTools: ==================== FINAL INVOICE DATA ====================');
      console.log('WHMCS PowerTools: Invoice Number:', invoiceNumber);
      console.log('WHMCS PowerTools: Client Name:', clientName);
      console.log('WHMCS PowerTools: Invoice Date:', invoiceDate);
      console.log('WHMCS PowerTools: Due Date:', dueDate);
      console.log('WHMCS PowerTools: Status:', status);
      console.log('WHMCS PowerTools: Payment Date:', paymentDate);
      console.log('WHMCS PowerTools: ================================================================');
      
      // Create invoice result with extracted details
      return [{
        invoiceId: invoiceNumber,
        clientName: clientName,
        clientUserId: clientUserId,
        invoiceDate: invoiceDate,
        dueDate: dueDate,
        status: status,
        paymentDate: paymentDate,
        url: `${BASE_URL}${ADMIN_PATH}/invoices.php?action=edit&id=${cleanInvoiceId}`
      }];
      
    } catch (error) {
      console.error('WHMCS PowerTools: Invoice search error:', error);
      if (error.message === 'ACCESS_DENIED') {
        throw error; // Re-throw access denied errors to be handled by performSearch
      }
      return [];
    }
  }

  async function searchOrderById(orderId) {
    const tokenInput = document.querySelector('input[name="token"]');
    const token = tokenInput ? tokenInput.value : '';
    
    // Clean order ID - remove any leading '#' if present
    let cleanOrderId = orderId.trim();
    if (cleanOrderId.startsWith('#')) {
      cleanOrderId = cleanOrderId.substring(1);
    }
    
    const formData = new URLSearchParams({
      'token': token,
      'orderid': cleanOrderId,
      'clientid': '',
      'ordernum': '',
      'paymentstatus': '',
      'orderdate': '',
      'status': '',
      'amount': '',
      'orderip': ''
    });
    
    try {
      console.log('WHMCS PowerTools: Order search request:', {
        url: `${BASE_URL}${ADMIN_PATH}/orders.php`,
        payload: formData.toString(),
        searchingFor: cleanOrderId
      });
      
      const response = await fetch(`${BASE_URL}${ADMIN_PATH}/orders.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
        credentials: 'include'
      });
      
      console.log('WHMCS PowerTools: Order search response:', {
        status: response.status,
        url: response.url,
        redirected: response.redirected
      });
      
      // IMPORTANT: Check for access denied
      if (response.url.includes('accessdenied.php')) {
        throw new Error('ACCESS_DENIED');
      }
      
      const html = await response.text();
      console.log('WHMCS PowerTools: Order search HTML length:', {
        htmlLength: html.length
      });
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Check if there's a "no results" message - IMPORTANT: Check this FIRST before other validations
      const bodyText = doc.body.textContent;
      if (bodyText.includes('No Orders Found') || 
          bodyText.includes('No Results') || 
          bodyText.includes('0 Records Found')) {
        console.log('WHMCS PowerTools: Page contains "no results" message');
        return [];
      }
      
      // Check if order ID exists in HTML
      const orderIdExists = html.includes(`ID: ${cleanOrderId}`);
      
      console.log('WHMCS PowerTools: Searching for order ID:', cleanOrderId);
      console.log('WHMCS PowerTools: Order ID found in response:', orderIdExists);
      
      if (!orderIdExists) {
        console.log('WHMCS PowerTools: ❌ Order ID not found in response');
        return [];
      }
      
      console.log('WHMCS PowerTools: ✅ Order found in response! Extracting details...');
      
      // Extract order details from the order detail page
      let orderNumber = cleanOrderId;
      let orderDate = '';
      let clientName = '';
      let clientUserId = '';
      let invoiceId = '';
      let status = '';
      
      // Extract data from the table.form structure
      const allTableRows = doc.querySelectorAll('table.form tr');
      for (const row of allTableRows) {
        const labels = row.querySelectorAll('.fieldlabel');
        const values = row.querySelectorAll('.fieldarea');
        
        // Iterate through all labels in this row
        for (let i = 0; i < labels.length; i++) {
          if (labels[i] && values[i]) {
            const labelText = labels[i].textContent.trim();
            
            if (labelText === 'Date') {
              orderDate = values[i].textContent.trim();
              console.log('WHMCS PowerTools: Extracted Order Date:', orderDate);
            } else if (labelText === 'Order #') {
              // Format: "7807517279 (ID: 125)"
              const orderText = values[i].textContent.trim();
              const match = orderText.match(/\(ID: (\d+)\)/);
              if (match) {
                orderNumber = match[1];
              }
              console.log('WHMCS PowerTools: Extracted Order Number:', orderNumber);
            } else if (labelText === 'Client') {
              // Client name is in nested anchor tags - get all and take the innermost one
              const clientLinks = values[i].querySelectorAll('a[href*="clientssummary"]');
              if (clientLinks.length > 0) {
                // Get the last (innermost) link which contains the actual client name
                const innerLink = clientLinks[clientLinks.length - 1];
                clientName = innerLink.textContent.trim();
                console.log('WHMCS PowerTools: Extracted Client Name:', clientName);
                // Extract userId from the link href
                const useridMatch = innerLink.href.match(/userid=(\d+)/);
                if (useridMatch) {
                  clientUserId = useridMatch[1];
                  console.log('WHMCS PowerTools: Extracted Client UserId from link:', clientUserId);
                }
              }
            } else if (labelText === 'Invoice #') {
              // Invoice ID is in a link
              const invoiceLink = values[i].querySelector('a[href*="invoices.php"]');
              if (invoiceLink) {
                invoiceId = invoiceLink.textContent.trim();
                console.log('WHMCS PowerTools: Extracted Invoice ID:', invoiceId);
              }
            } else if (labelText === 'Status') {
              // Status is in a select dropdown - get selected option
              const statusSelect = values[i].querySelector('select');
              if (statusSelect) {
                const selectedOption = statusSelect.querySelector('option[selected]') || 
                                      statusSelect.options[statusSelect.selectedIndex];
                if (selectedOption) {
                  status = selectedOption.textContent.trim();
                  console.log('WHMCS PowerTools: Extracted Status:', status);
                }
              }
            }
          }
        }
      }
      
      console.log('WHMCS PowerTools: ==================== FINAL ORDER DATA ====================');
      console.log('WHMCS PowerTools: Order Number:', orderNumber);
      console.log('WHMCS PowerTools: Order Date:', orderDate);
      console.log('WHMCS PowerTools: Client Name:', clientName);
      console.log('WHMCS PowerTools: Invoice ID:', invoiceId);
      console.log('WHMCS PowerTools: Status:', status);
      console.log('WHMCS PowerTools: ================================================================');
      
      // Create order result with extracted details
      return [{
        orderId: orderNumber,
        orderDate: orderDate,
        clientName: clientName,
        clientUserId: clientUserId,
        invoiceId: invoiceId,
        status: status,
        url: `${BASE_URL}${ADMIN_PATH}/orders.php?action=view&id=${cleanOrderId}`
      }];
      
    } catch (error) {
      console.error('WHMCS PowerTools: Order search error:', error);
      if (error.message === 'ACCESS_DENIED') {
        throw error; // Re-throw access denied errors to be handled by performSearch
      }
      return [];
    }
  }

  async function fetchClientDetails(userId) {
    try {
      const response = await fetch(`${BASE_URL}${ADMIN_PATH}/clientssummary.php?userid=${userId}`, {
        credentials: 'include'
      });
      
      // IMPORTANT: Check for access denied
      // If the response URL contains "accessdenied.php", it means the user was redirected due to lack of permissions
      // This is more accurate than checking response.redirected alone, as some features may redirect for legitimate reasons
      // This applies to all features - always check response.url for "accessdenied.php" before processing
      if (response.url.includes('accessdenied.php')) {
        throw new Error('ACCESS_DENIED');
      }
      
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract name
      let name = '';
      const nameSelectors = ['.clientname', '.client-summary-name', 'h2', '.page-header h1', '.clientsummary h2'];
      for (const selector of nameSelectors) {
        const element = doc.querySelector(selector);
        if (element && element.textContent.trim()) {
          name = element.textContent.trim();
          break;
        }
      }
      if (!name) name = `Client #${userId}`;
      
      // Extract email
      let email = '';
      
      const emailLinks = doc.querySelectorAll('a[href^="mailto:"]');
      if (emailLinks.length > 0) {
        email = emailLinks[0].textContent.trim() || emailLinks[0].href.replace('mailto:', '');
      }
      
      if (!email) {
        const emailElements = doc.querySelectorAll('.clientemail, [class*="email"], .client-email');
        for (const element of emailElements) {
          const text = element.textContent.trim();
          if (text && text.includes('@')) {
            email = text;
            break;
          }
        }
      }
      
      if (!email) {
        const emailRegex = /\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+\b/gi;
        const bodyText = doc.body.innerHTML;
        const emailMatches = bodyText.match(emailRegex);
        if (emailMatches && emailMatches.length > 0) {
          const validEmails = emailMatches.filter(e => 
            !e.includes('example.com') && 
            !e.includes('placeholder') &&
            !e.includes('test@')
          );
          if (validEmails.length > 0) {
            email = validEmails[0];
          }
        }
      }
      
      // Extract phone - FIXED VERSION
      let phone = '';
      
      // Strategy 1: Look for phone number in specific contexts (labels, rows with "Phone" text)
      const phoneContextElements = Array.from(doc.querySelectorAll('*')).filter(el => {
        const text = el.textContent.toLowerCase();
        const persianText = el.textContent;
        return (text.includes('phone') || text.includes('tel') || persianText.includes('تلفن همراه') || persianText.includes('تلفن')) && 
               text.length < 100; // Avoid matching large containers
      });
      
      const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
      
      for (const element of phoneContextElements) {
        const match = element.textContent.match(phoneRegex);
        if (match) {
          phone = match[0].trim();
          break;
        }
      }
      
      // Strategy 2: Look in table rows/cells near "Phone" labels
      if (!phone) {
        const tables = doc.querySelectorAll('table');
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const rowText = row.textContent.toLowerCase();
            const persianRowText = row.textContent;
            if ((rowText.includes('phone') || persianRowText.includes('تلفن همراه') || persianRowText.includes('تلفن')) && 
                !rowText.includes('postcode') && !rowText.includes('zip') && !persianRowText.includes('کد پستی')) {
              const cells = row.querySelectorAll('td');
              for (const cell of cells) {
                const match = cell.textContent.match(phoneRegex);
                if (match) {
                  phone = match[0].trim();
                  break;
                }
              }
              if (phone) break;
            }
          }
          if (phone) break;
        }
      }
      
      // Strategy 3: Look for elements with phone-related classes/IDs
      if (!phone) {
        const phoneElements = doc.querySelectorAll('[class*="phone"], [id*="phone"], [class*="tel"], [id*="tel"]');
        for (const element of phoneElements) {
          const text = element.textContent.trim();
          const match = text.match(phoneRegex);
          if (match) {
            phone = match[0].trim();
            break;
          }
        }
      }
      
      // Strategy 4: Only as last resort, search body but exclude postcode section
      if (!phone) {
        const bodyClone = doc.body.cloneNode(true);
        
        // Remove postcode-related elements to avoid matching
        const postcodeElements = bodyClone.querySelectorAll('[class*="postcode"], [id*="postcode"], [class*="zip"]');
        postcodeElements.forEach(el => el.remove());
        
        const remainingText = bodyClone.textContent;
        const phoneMatch = remainingText.match(phoneRegex);
        if (phoneMatch) {
          phone = phoneMatch[0].trim();
        }
      }
      
      return {
        userId: userId,
        name: name,
        email: email,
        phone: phone
      };
    } catch (error) {
      console.error('Error fetching client details:', error);
      return {
        userId: userId,
        name: `Client #${userId}`,
        email: '',
        phone: ''
      };
    }
  }

  // Helper function to get CSS class based on status
  function getStatusClass(status) {
    if (!status) return null;
    
    const statusLower = status.toLowerCase().trim();
    
    // Invoice-specific statuses
    if (statusLower === 'paid') return 'whmcs-status-paid';
    if (statusLower === 'unpaid') return 'whmcs-status-unpaid';
    if (statusLower === 'payment pending') return 'whmcs-status-payment-pending';
    if (statusLower === 'refunded') return 'whmcs-status-refunded';
    if (statusLower === 'collections') return 'whmcs-status-collections';
    
    // Ticket-specific statuses (more specific colors)
    if (statusLower === 'open') return 'whmcs-status-open';
    if (statusLower === 'answered') return 'whmcs-status-answered';
    if (statusLower === 'customer-reply' || statusLower === 'customer reply') return 'whmcs-status-customer-reply';
    if (statusLower === 'in progress') return 'whmcs-status-in-progress';
    if (statusLower === 'on hold') return 'whmcs-status-on-hold';
    if (statusLower === 'closed') return 'whmcs-status-closed';
    
    // General product/domain statuses
    if (statusLower === 'active') return 'whmcs-status-active';
    if (statusLower === 'pending') return 'whmcs-status-pending';
    if (statusLower === 'terminated' || statusLower === 'cancelled') return 'whmcs-status-terminated';
    if (statusLower === 'suspended') return 'whmcs-status-suspended';
    
    return null;
  }

  // Helper function to get status priority for sorting
  function getStatusPriority(status) {
    if (!status) return 999; // No status gets lowest priority
    
    const statusLower = status.toLowerCase();
    const priorityMap = {
      'active': 1,
      'open': 1,
      'answered': 1,
      'pending': 2,
      'customer-reply': 2,
      'in progress': 2,
      'terminated': 3,
      'cancelled': 4,
      'closed': 4,
      'suspended': 5,
      'on hold': 5,
      'expired': 6,
      'transferred': 7
    };
    
    return priorityMap[statusLower] || 999; // Unknown status gets lowest priority
  }

  // Helper function to sort results by status priority
  function sortResultsByStatus(results) {
    return results.sort((a, b) => {
      const priorityA = getStatusPriority(a.status);
      const priorityB = getStatusPriority(b.status);
      return priorityA - priorityB;
    });
  }

  // Helper function to escape HTML characters
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Helper function to format client name as a hyperlink if userId is available
  function formatClientNameLink(clientName, userId) {
    if (!clientName || clientName === 'N/A' || clientName === 'Client') {
      return clientName || 'N/A';
    }
    
    if (userId) {
      const clientUrl = `${BASE_URL}${ADMIN_PATH}/clientssummary.php?userid=${encodeURIComponent(userId)}`;
      const escapedName = escapeHtml(clientName);
      return `<a href="${clientUrl}" target="_blank" class="whmcs-client-link" onclick="event.stopPropagation(); window.open('${clientUrl}', '_blank'); return false;">${escapedName}</a>`;
    }
    
    return escapeHtml(clientName);
  }

  function displayResults(results) {
    resultsContainer.innerHTML = '';
    
    if (!results || results.length === 0) {
      resultsContainer.innerHTML = '<div class="whmcs-no-results">No results found</div>';
      return;
    }

    results.forEach(result => {
      const resultItem = document.createElement('div');
      resultItem.className = 'whmcs-result-item';
      
      // Add status-based CSS class for domain search results
      if (result.status) {
        const statusClass = getStatusClass(result.status);
        if (statusClass) {
          resultItem.classList.add(statusClass);
        }
      }
      
      resultItem.setAttribute('tabindex', '0');
      resultItem.setAttribute('role', 'button');
      resultItem.setAttribute('aria-label', `Open ${result.title} profile`);
      
      let detailsHtml = '';
      if (result.details) {
        detailsHtml = `<div class="whmcs-result-details">${result.details}</div>`;
      }
      
      // Check if result has multiple actions
      let actionsHtml = '';
      if (result.actions && result.actions.length > 0) {
        // Multiple action buttons
        actionsHtml = '<div class="whmcs-result-actions">';
        result.actions.forEach((action, index) => {
          actionsHtml += `<button class="whmcs-action-btn" data-url="${action.url}" title="${action.label}">
            <span class="whmcs-action-icon">${action.icon}</span>
            <span class="whmcs-action-label">${action.label}</span>
          </button>`;
        });
        actionsHtml += '</div>';
      } else {
        // Single action button (default behavior)
        actionsHtml = '<div class="whmcs-result-action" title="Open client profile">→</div>';
      }
      
      // Add direction attribute if specified (for RTL/LTR support)
      const titleDir = result.direction ? `dir="${result.direction}"` : '';
      
      resultItem.innerHTML = `
        <div class="whmcs-result-icon">${result.icon}</div>
        <div class="whmcs-result-content">
          <div class="whmcs-result-title" ${titleDir}>${result.title}</div>
          <div class="whmcs-result-description">${result.description}</div>
          ${detailsHtml}
        </div>
        ${actionsHtml}
      `;
      
      // Add Enter key handler for the result item
      resultItem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (result.actions && result.actions.length > 0) {
            // Open first action by default
            window.open(result.actions[0].url, '_blank');
          } else {
            window.open(result.url, '_blank');
          }
        }
      });
      
      // Handle action button clicks
      if (result.actions && result.actions.length > 0) {
        // Multiple action buttons
        const actionButtons = resultItem.querySelectorAll('.whmcs-action-btn');
        actionButtons.forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = btn.getAttribute('data-url');
            window.open(url, '_blank');
          });
        });
      } else {
        // Single action button (default behavior)
        const actionBtn = resultItem.querySelector('.whmcs-result-action');
        actionBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(result.url, '_blank');
        });
      }
      
      resultsContainer.appendChild(resultItem);
    });
  }

  // Helper function to intelligently detect user input type
  function detectUserInputType(input) {
    const trimmedInput = input.trim();
    
    // Check if it's an email (contains @ and basic email pattern)
    if (trimmedInput.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedInput)) {
      return 'email';
    }
    
    // Extract only digits from the input (to handle formatted numbers like +1-555-123-4567)
    const digitsOnly = trimmedInput.replace(/\D/g, '');
    
    // Check if input contains any letters - if so, it's invalid (unless it's an email)
    const hasLetters = /[a-zA-Z]/.test(trimmedInput);
    if (hasLetters) {
      // Not an email and has letters = invalid
      return null;
    }
    
    // Now we know it only contains digits and possibly phone formatting characters (+, -, spaces, parentheses)
    // Check if it's exactly 5 digits → User ID
    if (digitsOnly.length === 5) {
      return 'userid';
    }
    
    // Check if it's 6 or more digits → Phone Number
    if (digitsOnly.length >= 6) {
      return 'phone';
    }
    
    // Less than 5 digits but has at least 1 digit → treat as User ID
    if (digitsOnly.length > 0 && digitsOnly.length < 5) {
      return 'userid';
    }
    
    // No valid pattern detected - return null
    return null;
  }

  async function performSearch() {
    const query = convertToEnglishNumbers(searchInput.value.trim());
    
    if (!query) {
      showStatus('Please enter a search term', 'error');
      return;
    }

    showStatus('Searching...', 'loading');
    searchBtn.disabled = true;
    resultsContainer.innerHTML = '';

    try {
      let results = [];

      switch (currentSearchType) {
        case 'user':
          // Intelligently detect the input type
          const detectedType = detectUserInputType(query);
          console.log('WHMCS PowerTools: Detected input type:', detectedType, 'for query:', query);
          
          // Check if input is invalid
          if (detectedType === null) {
            showStatus('Please enter a valid User ID (5 digits), Phone Number (6+ digits), or Email address', 'error');
            displayResults([]);
            break;
          }
          
          // Route to appropriate user sub-function based on detected type
          switch (detectedType) {
            case 'userid':
              const userExists = await validateUserId(query);
              if (userExists) {
                const userDetails = await fetchClientDetails(query);
                results = [{
                  icon: '👥',
                  title: userDetails.name || `Client #${query}`,
                  description: userDetails.email ? `Email: ${userDetails.email}` : 'Click to view client profile',
                  details: userDetails.phone ? `📱 ${userDetails.phone}` : '',
                  url: `${BASE_URL}${ADMIN_PATH}/clientssummary.php?userid=${encodeURIComponent(query)}`,
                  actions: [
                    {
                      label: 'Profile',
                      icon: '👥',
                      url: `${BASE_URL}${ADMIN_PATH}/clientssummary.php?userid=${encodeURIComponent(query)}`
                    },
                    {
                      label: 'Tickets',
                      icon: '💬',
                      url: `${BASE_URL}${ADMIN_PATH}/index.php?rp=${ADMIN_PATH}/client/${encodeURIComponent(query)}/tickets`
                    }
                  ]
                }];
                showStatus('Client found (searched by User ID)', 'success');
                displayResults(results);
              } else {
                showStatus(`User ID ${query} not found`, 'error');
                displayResults([]);
              }
              break;

            case 'email':
              const clientData = await searchClientByEmail(query);
              if (clientData) {
                const details = [];
                if (clientData.phone) details.push(`📱 ${clientData.phone}`);
                if (clientData.name && clientData.name !== `Client #${clientData.userId}`) {
                  details.push(`👤 ${clientData.name}`);
                }
                
                results = [{
                  icon: '👥',
                  title: clientData.name || `Client #${clientData.userId}`,
                  description: `Email: ${query}`,
                  details: details.length > 0 ? details.join(' • ') : '',
                  url: `${BASE_URL}${ADMIN_PATH}/clientssummary.php?userid=${clientData.userId}`,
                  actions: [
                    {
                      label: 'Profile',
                      icon: '👥',
                      url: `${BASE_URL}${ADMIN_PATH}/clientssummary.php?userid=${clientData.userId}`
                    },
                    {
                      label: 'Tickets',
                      icon: '💬',
                      url: `${BASE_URL}${ADMIN_PATH}/index.php?rp=${ADMIN_PATH}/client/${clientData.userId}/tickets`
                    }
                  ]
                }];
                showStatus('Client found (searched by Email)', 'success');
                displayResults(results);
              } else {
                showStatus(`No client found for email: ${query}`, 'error');
                displayResults([]);
              }
              break;

            case 'phone':
              const clients = await searchClientByPhone(query);
              if (clients && clients.length > 0) {
                results = clients.map(client => {
                  const details = [];
                  if (client.email) details.push(`📧 ${client.email}`);
                  if (client.name && client.name !== `Client #${client.userId}`) {
                    details.push(`👤 ${client.name}`);
                  }
                  
                  return {
                    icon: '👥',
                    title: client.name || `Client #${client.userId}`,
                    description: `Phone: ${query}`,
                    details: details.length > 0 ? details.join(' • ') : '',
                    url: `${BASE_URL}${ADMIN_PATH}/clientssummary.php?userid=${client.userId}`,
                    actions: [
                      {
                        label: 'Profile',
                        icon: '👥',
                        url: `${BASE_URL}${ADMIN_PATH}/clientssummary.php?userid=${client.userId}`
                      },
                      {
                        label: 'Tickets',
                        icon: '💬',
                        url: `${BASE_URL}${ADMIN_PATH}/index.php?rp=${ADMIN_PATH}/client/${client.userId}/tickets`
                      }
                    ]
                  };
                });
                showStatus(`Found ${clients.length} client(s) (searched by Phone)`, 'success');
                displayResults(results);
              } else {
                showStatus(`No client found for phone: ${query}`, 'error');
                displayResults([]);
              }
              break;
          }
          break;


        case 'domain':
          const services = await searchProductByDomain(query);
          if (services && services.length > 0) {
            results = await Promise.all(services.map(async (service) => {
              const details = [];
              if (service.clientEmail) {
                details.push(`📧 ${service.clientEmail}`);
              }
              // Always show client name if available, with link if userId exists
              if (service.client && service.client.trim()) {
                details.push(`👤 ${formatClientNameLink(service.client.trim(), service.userid)}`);
              }
              // Product name should never be linked - it's just informational
              if (service.product) {
                details.push(`📦 ${escapeHtml(service.product)}`);
              }
              if (service.server) details.push(`🖥️ ${service.server}`);
              if (service.status) details.push(`📊 ${service.status}`);
              if (service.nextDue) details.push(`📅 ${service.nextDue}`);
              
              // Convert URL format from services/detail/ID to clientsservices.php?userid=USERID&id=ID
              let finalUrl = service.url || `${BASE_URL}${ADMIN_PATH}/index.php?rp=${ADMIN_PATH}/services&domain=${encodeURIComponent(query)}`;
              
              if (service.url && service.url.includes('/services/detail/')) {
                // Extract service ID from URL like /whmadmin/services/detail/327143
                const serviceIdMatch = service.url.match(/\/services\/detail\/(\d+)/);
                if (serviceIdMatch) {
                  const serviceId = serviceIdMatch[1];
                  let userid = service.userid; // Use userid from service data if available
                  
                  // If userid is not available, try to fetch it from the service detail page
                  if (!userid) {
                    userid = await fetchUseridFromServiceDetail(service.url);
                  }
                  
                  if (userid) {
                    finalUrl = `${BASE_URL}${ADMIN_PATH}/clientsservices.php?userid=${userid}&id=${serviceId}`;
                  }
                }
              }
              
              return {
                icon: '📦',
                title: service.domain || query,
                description: service.product ? escapeHtml(service.product) : 'Product service',
                details: details.length > 0 ? details.join(' • ') : '',
                status: service.status, // Add status for color coding
                url: finalUrl
              };
            }));
            
            // Sort results by status priority (active > pending > terminated > cancelled > ...)
            results = sortResultsByStatus(results);
            
            showStatus(`Found ${services.length} product(s) for domain: ${query}`, 'success');
            displayResults(results);
          } else {
            showStatus(`No products found for domain: ${query}`, 'error');
            displayResults([]);
          }
          break;

        case 'domainlookup':
          const domains = await searchDomainLookup(query);
          if (domains && domains.length > 0) {
            results = await Promise.all(domains.map(async (domainData) => {
              // Fetch detailed domain information
              let domainDetails = null;
              if (domainData.userid && domainData.domainId) {
                domainDetails = await fetchDomainDetails(domainData.userid, domainData.domainId);
              }
              
              // Build title with domain name and registration date
              let title = domainData.domain || query;
              if (domainDetails && domainDetails.registrationDate) {
                title += ` - Registration Date: ${domainDetails.registrationDate}`;
              }
              
              // Build description with expiry and next due dates
              let descriptionParts = ['Domain registration'];
              if (domainDetails) {
                if (domainDetails.expiryDate) {
                  descriptionParts.push(`Exp: ${domainDetails.expiryDate}`);
                }
                if (domainDetails.nextDueDate) {
                  descriptionParts.push(`Due: ${domainDetails.nextDueDate}`);
                }
              }
              const description = descriptionParts.join(' - ');
              
              // Build details line
              const details = [];
              if (domainData.clientEmail) details.push(`📧 ${domainData.clientEmail}`);
              else if (domainData.client) details.push(`👤 ${formatClientNameLink(domainData.client, domainData.userid)}`);
              if (domainData.registrar) details.push(`🏢 ${domainData.registrar}`);
              if (domainData.status) details.push(`📊 ${domainData.status}`);
              
              // Generate URL for domain management
              let finalUrl = domainData.url || `${BASE_URL}${ADMIN_PATH}/index.php?rp=${ADMIN_PATH}/domains&domain=${encodeURIComponent(query)}`;
              
              if (domainData.url && domainData.url.includes('/domains/detail/')) {
                // Extract domain ID from URL like /whmadmin/domains/detail/12345
                const domainIdMatch = domainData.url.match(/\/domains\/detail\/(\d+)/);
                if (domainIdMatch) {
                  const domainId = domainIdMatch[1];
                  let userid = domainData.userid; // Use userid from domain data if available
                  
                  if (userid) {
                    finalUrl = `${BASE_URL}${ADMIN_PATH}/clientsdomains.php?userid=${userid}&id=${domainId}`;
                  }
                }
              }
              
              return {
                icon: '🌐',
                title: title,
                description: description,
                details: details.length > 0 ? details.join(' • ') : '',
                status: domainData.status, // Add status for color coding
                url: finalUrl
              };
            }));
            
            // Sort results by status priority (active > pending > terminated > cancelled > ...)
            results = sortResultsByStatus(results);
            
            showStatus(`Found ${domains.length} domain(s) for: ${query}`, 'success');
            displayResults(results);
          } else {
            showStatus(`No domains found for: ${query}`, 'error');
            displayResults([]);
          }
          break;

        case 'ticket':
          const tickets = await searchTicketById(query);
          if (tickets && tickets.length > 0) {
            results = tickets.map((ticketData) => {
              // Build details in the exact format requested
              const detailLines = [];
              
              // Format:
              // [Ticket Subject] - shown in title
              // [Ticket ID]
              // [Status]
              // [Department]
              // [Client Name]
              // [Client Email]
              
              detailLines.push(ticketData.ticketId || query);
              detailLines.push(ticketData.status || 'N/A');
              if (ticketData.department) {
                detailLines.push(ticketData.department);
              }
              detailLines.push(formatClientNameLink(ticketData.client, ticketData.clientUserId));
              detailLines.push(ticketData.email || 'N/A');
              
              // Detect text direction based on first character of subject
              const subject = ticketData.subject || 'Support Ticket';
              const isRTL = startsWithPersianArabic(subject);
              
              return {
                icon: '💬',
                title: subject,
                description: '', // No description, subject is in title
                details: detailLines.join('\n'),
                status: ticketData.status, // Add status for color coding
                url: ticketData.url,
                direction: isRTL ? 'rtl' : 'ltr' // Add direction for ticket subjects
              };
            });
            
            // Sort results by status priority
            results = sortResultsByStatus(results);
            
            showStatus(`Found ticket ${query}`, 'success');
            displayResults(results);
          } else {
            showStatus(`No ticket found with ID: ${query}`, 'error');
            displayResults([]);
          }
          break;

        case 'invoice':
          const invoices = await searchInvoiceById(query);
          if (invoices && invoices.length > 0) {
            results = invoices.map((invoiceData) => {
              // Format according to user requirements:
              // Line 1 (title): [invoice number] - [Status] - [payment date (if available)]
              // Line 2 (description): [Client Name]
              // Line 3 (details): [Invoice Date] - [Due Date]
              
              // Build title: Invoice #122 - Paid - 28/10/2025 03:10
              let titleParts = [`Invoice #${invoiceData.invoiceId}`];
              if (invoiceData.status) {
                titleParts.push(invoiceData.status);
              }
              if (invoiceData.paymentDate) {
                titleParts.push(invoiceData.paymentDate);
              }
              const title = titleParts.join(' - ');
              
              // Description: Client Name (hyperlinked if userId available)
              const description = formatClientNameLink(invoiceData.clientName, invoiceData.clientUserId);
              
              // Details: Invoice Date: [Invoice Date] - Due Date: [Due Date]
              let detailsParts = [];
              if (invoiceData.invoiceDate) {
                detailsParts.push(`Invoice Date: ${invoiceData.invoiceDate}`);
              }
              if (invoiceData.dueDate) {
                detailsParts.push(`Due Date: ${invoiceData.dueDate}`);
              }
              const details = detailsParts.length > 0 ? detailsParts.join(' - ') : '';
              
              return {
                icon: '💵',
                title: title,
                description: description,
                details: details,
                status: invoiceData.status, // Add status for color coding
                url: invoiceData.url
              };
            });
            
            // Sort results by status priority
            results = sortResultsByStatus(results);
            
            showStatus(`Found invoice ${query}`, 'success');
            displayResults(results);
          } else {
            showStatus(`No invoice found with ID: ${query}`, 'error');
            displayResults([]);
          }
          break;

        case 'order':
          const orders = await searchOrderById(query);
          if (orders && orders.length > 0) {
            results = orders.map((orderData) => {
              // Format according to user requirements:
              // Line 1 (title): Order: [order id] - [Status] - [Date]
              // Line 2 (description): [Client Name]
              // Line 3 (details): Invoice ID: [Invoice #]
              
              // Build title: Order: 125 - Active - 30/10/2025 04:10
              let titleParts = [`Order: ${orderData.orderId}`];
              if (orderData.status) {
                titleParts.push(orderData.status);
              }
              if (orderData.orderDate) {
                titleParts.push(orderData.orderDate);
              }
              const title = titleParts.join(' - ');
              
              // Description: Client Name (hyperlinked if userId available)
              const description = formatClientNameLink(orderData.clientName, orderData.clientUserId);
              
              // Details: Invoice ID: [Invoice #] - make it clickable
              let details = '';
              if (orderData.invoiceId) {
                const invoiceUrl = `${BASE_URL}${ADMIN_PATH}/invoices.php?action=edit&id=${orderData.invoiceId}`;
                details = `Invoice ID: <a href="${invoiceUrl}" target="_blank" style="color: #3498db; text-decoration: underline; cursor: pointer;" onclick="event.stopPropagation();">${orderData.invoiceId}</a>`;
              }
              
              return {
                icon: '🛒',
                title: title,
                description: description,
                details: details,
                status: orderData.status, // Add status for color coding
                url: orderData.url
              };
            });
            
            // Sort results by status priority
            results = sortResultsByStatus(results);
            
            showStatus(`Found order ${query}`, 'success');
            displayResults(results);
          } else {
            showStatus(`No order found with ID: ${query}`, 'error');
            displayResults([]);
          }
          break;
      }
    } catch (error) {
      // IMPORTANT: Handle ACCESS_DENIED errors specifically
      // When status is not 200 (e.g., 302 redirect), show "Access Denied" instead of generic error
      if (error.message === 'ACCESS_DENIED') {
        showStatus('Access Denied', 'error');
      } else {
        showStatus(`Error: ${error.message}`, 'error');
      }
      displayResults([]);
    } finally {
      searchBtn.disabled = false;
    }
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `whmcs-search-status whmcs-status-${type}`;
  }

  // Cleanup function to restore original modal methods
  function cleanup() {
    if (originalModalMethods.show) window.showModalDialog = originalModalMethods.show;
    if (originalModalMethods.alert) window.alert = originalModalMethods.alert;
    if (originalModalMethods.confirm) window.confirm = originalModalMethods.confirm;
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);

})();
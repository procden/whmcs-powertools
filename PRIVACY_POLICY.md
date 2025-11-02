# Privacy Policy for WHMCS PowerTools

**Last Updated:** 2025/11/02 
**Version:** 1.3.2

## Introduction

This Privacy Policy explains how WHMCS PowerTools ("we", "our", or "the extension") handles information when you use our Chrome extension. We are committed to protecting your privacy and being transparent about our practices.

## Data Collection

**We do not collect, store, or transmit any personal data or information.**

WHMCS PowerTools operates entirely locally within your browser. All processing happens on your device, and no data is sent to external servers or third parties.

## Permissions Explained

WHMCS PowerTools requires the following permissions to function:

### 1. `activeTab` Permission
- **Purpose**: Allows the extension to interact with the active browser tab to inject the search modal interface
- **Usage**: Only activates when you manually open the search modal via keyboard shortcut or extension icon
- **Data Access**: None - this permission is only used to display the search interface

### 2. `scripting` Permission
- **Purpose**: Enables the extension to inject scripts into WHMCS admin pages to provide search functionality
- **Usage**: Only used to add the search modal to WHMCS admin pages
- **Data Access**: None - scripts only create the search interface

### 3. `storage` Permission
- **Purpose**: Stores your preferences and settings locally
- **Usage**: Saves your custom keyboard shortcuts, function order, and phone field configuration
- **Data Stored**: 
  - Keyboard shortcut preference
  - Search function order preference
  - Phone field configuration
  - Welcome page display preference (optional)
- **Location**: All data is stored locally in Chrome's sync storage (associated with your Google account if sync is enabled)

### 4. `<all_urls>` Host Permission
- **Purpose**: Allows the extension to detect WHMCS admin pages and activate only on those pages
- **Usage**: Extension checks URLs to determine if the current page is a WHMCS admin panel
- **Data Access**: URL patterns are checked locally; no URLs are transmitted or stored
- **Activation**: Extension only activates on WHMCS admin directory patterns (whmadmin, admin, whmcs, admincp, panel, control, secure-admin, adminarea, manager)

## Local Data Storage

The extension uses Chrome's `chrome.storage.sync` API to store your settings:

- **Keyboard Shortcuts**: Your custom shortcut preferences
- **Function Order**: Your preferred order of search functions
- **Phone Field Configuration**: Your selected phone field mapping
- **Welcome Page Preference**: Whether to show the welcome page (optional)

**Important Notes:**
- All data is stored locally on your device
- If you have Chrome Sync enabled, settings sync across your devices (this is handled by Chrome, not by us)
- Settings are never transmitted to external servers
- You can clear all data by uninstalling the extension

## Data Transmission

**WHMCS PowerTools does not transmit any data to external servers.**

All search operations are performed directly against your WHMCS installation's API endpoints. The extension acts as a client-side interface and does not:
- Collect search queries
- Log user activity
- Transmit data to third-party services
- Use analytics or tracking services
- Share information with advertisers

## Search Functionality

When you use the search features:

- **User Searches**: Queries are sent directly to your WHMCS installation (clients.php endpoint)
- **Domain Lookups**: Queries are sent directly to your WHMCS installation's domain lookup endpoints
- **Ticket/Invoice/Order Searches**: Queries are sent directly to your WHMCS installation's respective endpoints

All searches use the same authentication and session as your normal WHMCS admin access. The extension does not store or cache any search results or client data.

## Third-Party Services

WHMCS PowerTools does not integrate with any third-party services, analytics platforms, or advertising networks. The extension operates independently and only communicates with your WHMCS installation.

## Cookies

The extension does not set, read, or modify cookies. It relies on your existing WHMCS session cookies for authentication, which are managed entirely by your WHMCS installation.

## Children's Privacy

WHMCS PowerTools is not intended for users under the age of 13. We do not knowingly collect information from children. The extension is designed for WHMCS administrators and support staff.

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by:
- Updating the "Last Updated" date at the top of this policy
- Publishing updates on the extension's GitHub repository
- Notifying users through the Chrome Web Store listing

You are advised to review this Privacy Policy periodically for any changes.

## Your Rights

Since we do not collect any personal data, there is no personal data to access, modify, or delete. However, you have full control over:

- **Settings**: Modify or reset your extension settings at any time through the settings page
- **Data Storage**: Clear all extension data by uninstalling the extension
- **Usage**: Use or stop using the extension at any time

## Data Security

As all processing happens locally on your device:
- No data transmission means no risk of interception
- Your settings are protected by Chrome's built-in storage security
- Search queries never leave your browser session
- No external servers means no server-side security risks

## Contact Information

If you have any questions or concerns about this Privacy Policy or the extension's privacy practices, please contact us:

- **GitHub Issues**: [https://github.com/procden]/issues
- **Email**: [procdendev@gmail.com] (if applicable)
- **Telegram**: [@mdfrx](https://t.me/mdfrx)

## Compliance

This Privacy Policy is designed to comply with:
- Chrome Web Store Developer Program Policies
- General data protection principles
- User privacy expectations

## Summary

**In short:** WHMCS PowerTools does not collect, store, or transmit any personal data. All functionality operates locally in your browser, and all settings are stored locally on your device. Your privacy is fully protected.

---

**Last Updated:** 2025/11/02
**Extension Version:** 1.3.2

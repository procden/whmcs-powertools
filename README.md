# WHMCS PowerTools

A powerful Chrome extension that supercharges your WHMCS admin experience with instant search capabilities. Find clients, domains, tickets, invoices, and orders without navigating away from your current page.

## ✨ Features

### 🔍 Multi-Purpose Search
- **User Search**: Find clients by User ID, Email, or Phone number
- **Domain Lookup**: Get DNS information and registration details
- **Product Search**: Find products by domain, IP, or hostname
- **Ticket Lookup**: Quick access to support tickets
- **Invoice Search**: Look up invoices by ID
- **Order Search**: Find service orders instantly

### 🚀 Smart Features
- **Smart Text Selection**: Select text on any page and it auto-fills the search box
- **Instant Results**: All searches happen without page refreshes
- **Unified Interface**: All search results appear in a beautiful modal

### ⚙️ Customization
- Custom keyboard shortcuts
- Reorder search functions via drag-and-drop
- Configure phone field mapping
- All settings persist automatically

### 🌍 Universal Compatibility
Works with any WHMCS installation, including custom admin directory configurations.

## 📦 Installation

### From Chrome Web Store (Recommended)
1. Visit the [Chrome Web Store listing](https://chrome.google.com/webstore) (link to be added)
2. Click "Add to Chrome"
3. Start using it immediately!

### Manual Installation
1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the extension folder
6. The extension is now installed!

## 🎯 Usage

1. Navigate to your WHMCS admin panel
2. Press `Ctrl+Shift+F` (or your custom shortcut) to open the search modal
3. Select a search type or start typing
4. Results appear instantly in the modal

### Quick Tips
- Select text on any page before opening the modal - it will auto-fill!
- Press `ESC` to close the modal anytime
- Use `Ctrl+1` through `Ctrl+6` to switch between search types quickly
- Click the ⚙️ icon in the modal to access settings

## ⚙️ Configuration

Access settings by:
- Clicking the extension icon in the toolbar → "Options"
- Clicking the ⚙️ icon in the search modal

### Available Settings
- **Keyboard Shortcut**: Customize your preferred shortcut
- **Function Order**: Drag and drop to reorder search functions
- **Phone Field**: Choose between Phone, Phone2, or custom field mapping

## 📁 Project Structure

WHMCS-PowerTools/
├── manifest.json # Extension manifest
├── background.js # Background service worker
├── whmcs-search-modal.js # Main content script
├── whmcs-search-modal.css # Modal styles
├── settings.html # Settings page
├── settings.js # Settings logic
├── settings.css # Settings styles
├── welcome.html # Welcome page
├── welcome.js # Welcome page logic
├── welcome.css # Welcome page styles
├── icon16.png # Extension icon (16x16)
├── icon48.png # Extension icon (48x48)
├── icon128.png # Extension icon (128x128)
└── assets/ # Font assets
├── Vazirmatn-Regular.ttf
└── Vazirmatn-Bold.ttf


## 🛠️ Development

### Requirements
- Google Chrome or Chromium-based browser
- WHMCS installation (for testing)

### Building
No build process required. The extension works directly from source files.

### Testing
1. Load the extension in developer mode
2. Navigate to a WHMCS admin page
3. Test all search functionalities
4. Verify settings persistence

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👤 Author

**t.me/mdfrx**

- GitHub: (https://github.com/procden)
- Telegram: [@mdfrx](https://t.me/mdfrx)

## 🙏 Acknowledgments

- Thanks to all contributors
- Built with ❤️ for the WHMCS community

## 📮 Support

If you find this extension useful, consider:
- ⭐ Starring this repository
- 🐛 Reporting bugs
- 💡 Suggesting new features
- 💰 Making a donation (see settings page)

---

**Made with ❤️ for WHMCS administrators**

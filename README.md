# IP Protocol Tracker

See the IPv4 and IPv6 usage ratio of the websites you visit, directly from a lightweight Chrome extension popup.

## What It Does

IP Protocol Tracker helps you understand whether the websites you open are using IPv4, IPv6, or both. It observes network responses for the active tab, summarizes protocol distribution as percentages, and lists the domains and IP addresses behind the page.

The main goal is simple: when you visit a website, you can quickly see how much of that page's traffic used IPv4 versus IPv6.

## Features

- IPv4 and IPv6 request counters for the active tab
- Percentage bars showing the IPv4/IPv6 usage ratio
- Local network traffic indicator
- Per-domain request list with resolved IP addresses
- Domain, IP, protocol, and LAN filtering
- Click-to-load ASN, service holder, prefix, and source details through RIPEstat
- Automatic light/dark theme support
- Automatic English/Turkish language detection with a manual language selector
- In-memory tab cleanup when a tab is closed or navigated

## Installation

## Installing from Release ZIP

Since Chromium requires unpacked extensions for manual installations, follow these quick steps to set it up:

1. Go to the [Releases](../../releases) page and download the latest `ip-protocol-tracker.zip` asset.
2. **Extract** the downloaded ZIP archive into a permanent folder on your computer like `C:\Program Files\IPProtocolTracker` or `~/Documents/IPProtocolTracker`.
3. Open your Chromium-based browser and navigate to `chrome://extensions/`.
4. Enable **Developer mode** using the toggle switch in the top-right corner.
5. Click the **Load unpacked** button in the top-left corner and select the folder where you extracted the files.
6. Open a website and click the extension icon to view its IPv4/IPv6 usage ratio.

## Usage

1. Visit any regular website.
2. Open the extension popup.
3. Check the IPv4 and IPv6 cards to compare protocol usage.
4. Use the search field to filter by domain, IP, IPv4, IPv6, or LAN.
5. Click an IP address to fetch ASN and prefix details.

## Development

This project has no build step. The extension runs directly from the source files:

- `manifest.json` defines permissions and extension entry points.
- `background.js` observes HTTP/HTTPS network responses and stores per-tab stats in memory.
- `popup.html` contains the popup UI and styling.
- `popup.js` renders stats, filtering, language switching, dynamic layout sizing, and IP lookup results.
- `locales/en.json` and `locales/tr.json` contain UI translations.

After editing files, reload the extension from `chrome://extensions` before testing changes.

## Permissions

The extension uses:

- `webRequest` to observe network response metadata.
- `webNavigation` to reset tab stats on main-frame navigation.
- `tabs` to resolve the active tab for popup requests.
- `<all_urls>` host access to observe HTTP/HTTPS traffic and fetch RIPEstat lookup data.

The extension does not persist browsing history. Active tab stats live in memory and are cleared when the tab is closed or the main page navigates.

## 🛠️ Release & Version Management (For Maintainers)

To release a new version of the extension and trigger the automated GitHub Actions release workflow, follow these steps:

1. **Update Manifest Version:**

Open `manifest.json` and bump the version number according to your changes:

```json
   "version": "1.1.0"
```

2. **Commit and Push Changes:**

Commit your updates and push them to the main branch:

```bash
git add .
git commit -m "chore: bump version to v1.1.0"
git push origin main
```

3. **Create and Push a Version Tag:**

Create a matching Git tag starting with v and push it to the repository to trigger the automated build:

```bash
git tag v1.1.0
git push origin v1.1.0
```

Once the tag is pushed, check the Actions tab in your GitHub repository to monitor the build process. The compiled ZIP package will be automatically attached to a new GitHub Release.

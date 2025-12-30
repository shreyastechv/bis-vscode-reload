# CFC Save Trigger URL Caller

A lightweight VS Code extension that silently calls a fixed URL whenever a `.cfc` (ColdFusion Component) file is saved — with a configurable cooldown to prevent excessive calls.

This extension runs completely in the background and is designed for automation, validation hooks, or integration with external services.

---

## ✨ Features

- 🚀 Automatically triggers on **save** of `.cfc` files
- 🔁 Calls a **fixed HTTP URL** (no browser, no UI)
- ⏱️ Built-in **cooldown** (default: once every 30 seconds)
- 🧠 Lightweight and non-intrusive
- 🛠️ Runs automatically when VS Code starts

---

## 🔧 How It Works

1. You edit a `.cfc` file
2. You save the file
3. The extension checks:
   - Is it a `.cfc` file?
   - Has the cooldown period passed?
4. If yes → it makes an HTTP request to the configured URL

No popups. No Chrome tabs. Completely silent.

---

## 📦 Installation

### Option 1: Install from VSIX (recommended)

1. Package the extension:
   ```bash
   npm run compile
   vsce package

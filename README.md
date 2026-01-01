# BIS Reload – CFC Auto & Manual Application Reload

A lightweight VS Code extension that **automatically or manually triggers an application reload** by calling a fixed HTTP URL when a `.cfc` (ColdFusion Component) file is saved — with configurable settings, cooldown protection, and visual feedback.

Designed for ColdFusion / BIS-style development workflows where saving backend code requires reloading the running application.

---

## ✨ Features

- 🔄 **Auto reload on save** of `.cfc` files  
- ⌨️ **Manual reload command** (bindable to a key)  
- ⏱️ **Configurable cooldown** to prevent excessive reloads  
- 📊 **Status bar spinner** while reload is in progress  
- 🔒 **Execution lock** — prevents parallel reloads  
- 🔔 **Success / failure notifications**  
- ⚙️ Fully configurable via **VS Code Settings UI**  
- 🧠 Lightweight and non-intrusive  

---

## 🔧 How It Works

### Auto Reload
1. You edit and save a `.cfc` file  
2. The extension checks:
   - Is auto reload enabled?
   - Is a reload already in progress?
   - Has the cooldown period elapsed?
3. If yes → it calls the configured reload URL

### Manual Reload
- Run the command **“BIS: Reload Application”**
- Or trigger it via a custom keybinding
- Manual reloads bypass the cooldown but still respect the execution lock

---

## ⚙️ Configuration (via Settings UI)

Open **Settings** → search for **“BIS Reload”**

### Available settings

| Setting | Type | Default | Description |
|------|------|--------|------------|
| `bisReload.autoReload` | boolean | `true` | Enable or disable automatic reload on `.cfc` save |
| `bisReload.cooldownMs` | number | `5000` | Cooldown period between reloads (in milliseconds) |

### Example (`settings.json`)
```json
{
  "bisReload.autoReload": true,
  "bisReload.cooldownMs": 10000
}

# ZenTab

A minimal Chrome extension to save, label, and restore browser windows. Keep your workspace clean by stashing tabs you're not using right now and bringing them back whenever you need them.

---

## Install

No build step needed — clone the repo and load the right folder for your browser.

```bash
git clone https://github.com/Enzoblgz/zentab.git
```

### Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder
4. Pin the ZenTab icon in your toolbar

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Open the `dist-firefox/` folder and select `manifest.json`
4. The extension stays loaded until Firefox restarts — to make it permanent, sign and install it via [about:addons](about:addons)

---

## How to use

### Select and save tabs
Click the ZenTab icon — the popup shows every tab open in the current window, all pre-selected.  
Check or uncheck individual tabs to choose exactly what you want to save.  
Use **Select all / Deselect all** to toggle everything at once.

The save button reflects your selection:
- *"Save & close 3 tabs"* — only those tabs close, the window stays open with the rest
- *"Save & close all tabs"* — the entire window closes

Click it, pick an optional label, then confirm.

### Labels
At the bottom of the popup, click **+ Label** to create a new one.  
Labels are color-coded automatically. Delete any label with the `×` next to it.

### Filter sessions
Once you have labels, a filter bar appears above the saved sessions.  
Click a label to show only sessions tagged with it. Click it again (or **All**) to reset.

### Restore a session
Find the session you want and click **Restore** — all its tabs reopen in a new window and the session is removed from the list.

### Delete a session
Click `×` on any session card to remove it permanently.

---

## Build from source

If you want to modify the extension:

```bash
npm install
npm run build          # Chrome → dist/
npm run build:firefox  # Firefox → dist-firefox/
```

Then reload the unpacked extension in your browser.

---

## Stack

- React 19
- Tailwind CSS v4
- Vite 8
- Chrome Extensions Manifest V3

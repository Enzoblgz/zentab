# ZenTab

A minimal Chrome extension to save, label, and restore browser windows. Keep your workspace clean by stashing tabs you're not using right now and bringing them back whenever you need them.

---

## Install

No build step needed — just load the `dist/` folder directly into Chrome.

1. Clone the repo
   ```bash
   git clone https://github.com/Enzoblgz/zentab.git
   ```

2. Open Chrome and go to `chrome://extensions`

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the `dist/` folder inside the cloned repo

5. The ZenTab icon will appear in your toolbar — pin it for easy access

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
npm run build
```

Then reload the unpacked extension in `chrome://extensions`.

---

## Stack

- React 19
- Tailwind CSS v4
- Vite 8
- Chrome Extensions Manifest V3

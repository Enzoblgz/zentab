import { useEffect, useState } from "react"

const IS_FIREFOX = typeof globalThis.browser !== "undefined"
const NEW_TAB_URL = IS_FIREFOX ? "about:newtab" : "chrome://newtab"

const LABEL_COLORS = [
  "#e2e8f0", "#fecaca", "#fed7aa", "#fef08a",
  "#bbf7d0", "#bae6fd", "#e9d5ff", "#fbcfe8",
]

export default function App() {
  const [sessions, setSessions] = useState([])
  const [labels, setLabels] = useState([])
  const [currentTabs, setCurrentTabs] = useState([])
  const [currentWindowId, setCurrentWindowId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [pendingSave, setPendingSave] = useState(null)
  const [saveMode, setSaveMode] = useState("new")
  const [chosenLabelId, setChosenLabelId] = useState(null)
  const [targetSessionId, setTargetSessionId] = useState(null)
  const [filterLabelId, setFilterLabelId] = useState(null)
  const [newLabelName, setNewLabelName] = useState("")
  const [showAddLabel, setShowAddLabel] = useState(false)

  async function load() {
    const data = await chrome.storage.local.get(["sessions", "labels"])
    setSessions((data.sessions || []).filter(s => Array.isArray(s.windows)))
    setLabels(data.labels || [])

    const win = await chrome.windows.getCurrent({ populate: true })
    setCurrentWindowId(win.id)
    setCurrentTabs(win.tabs || [])
    setSelectedIds(new Set((win.tabs || []).map(t => t.id)))
  }

  function toggleTab(tabId) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(tabId) ? next.delete(tabId) : next.add(tabId)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === currentTabs.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(currentTabs.map(t => t.id)))
    }
  }

  async function startSave() {
    if (selectedIds.size === 0) return
    setSaving(true)
    try {
      const tabs = currentTabs
        .filter(t => selectedIds.has(t.id))
        .map(tab => ({
          title: tab.title,
          url: tab.url,
          favicon: tab.favIconUrl || null,
        }))
      setPendingSave({
        windowId: currentWindowId,
        tabIds: [...selectedIds],
        allSelected: selectedIds.size === currentTabs.length,
        tabs,
      })
      setSaveMode("new")
      setChosenLabelId(null)
      setTargetSessionId(null)
    } finally {
      setSaving(false)
    }
  }

  async function confirmSave() {
    if (!pendingSave) return
    if (saveMode === "existing" && !targetSessionId) return

    const existing = await chrome.storage.local.get("sessions")
    let updated

    if (saveMode === "existing") {
      updated = (existing.sessions || []).map(s => {
        if (s.id !== targetSessionId) return s
        const merged = [...(s.windows[0]?.tabs || []), ...pendingSave.tabs]
        return { ...s, windows: [{ tabs: merged }] }
      })
    } else {
      const session = {
        id: Date.now(),
        createdAt: new Date().toLocaleString(),
        labelId: chosenLabelId,
        windows: [{ tabs: pendingSave.tabs }]
      }
      updated = [session, ...(existing.sessions || [])]
    }

    await chrome.storage.local.set({ sessions: updated })
    setSessions(updated.filter(s => Array.isArray(s.windows)))

    if (pendingSave.allSelected) {
      const allWindows = await chrome.windows.getAll()
      if (allWindows.length === 1) await chrome.tabs.create({ url: NEW_TAB_URL })
      await chrome.windows.remove(pendingSave.windowId)
    } else {
      await chrome.tabs.remove(pendingSave.tabIds)
      const win = await chrome.windows.getCurrent({ populate: true })
      setCurrentTabs(win.tabs || [])
      setSelectedIds(new Set((win.tabs || []).map(t => t.id)))
    }

    setPendingSave(null)
  }

  async function restoreSession(session) {
    for (const winData of session.windows || []) {
      const urls = (winData.tabs || []).map(t => t.url).filter(Boolean)
      if (urls.length > 0) await chrome.windows.create({ url: urls })
    }
    await deleteSession(session.id)
  }

  async function deleteSession(id) {
    const updated = sessions.filter(s => s.id !== id)
    await chrome.storage.local.set({ sessions: updated })
    setSessions(updated)
  }

  async function addLabel() {
    const name = newLabelName.trim()
    if (!name) return
    const color = LABEL_COLORS[labels.length % LABEL_COLORS.length]
    const updated = [...labels, { id: Date.now(), name, color }]
    await chrome.storage.local.set({ labels: updated })
    setLabels(updated)
    setNewLabelName("")
    setShowAddLabel(false)
  }

  async function deleteLabel(id) {
    const updated = labels.filter(l => l.id !== id)
    await chrome.storage.local.set({ labels: updated })
    setLabels(updated)
    if (filterLabelId === id) setFilterLabelId(null)
  }

  useEffect(() => { load() }, [])

  const allSelected = currentTabs.length > 0 && selectedIds.size === currentTabs.length
  const filtered = filterLabelId ? sessions.filter(s => s.labelId === filterLabelId) : sessions

  return (
    <div className="w-[400px] bg-white p-5">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-base font-semibold tracking-tight text-gray-900">ZenTab</h1>
        {sessions.length > 0 && (
          <span className="text-xs text-gray-400">{sessions.length} saved</span>
        )}
      </div>

      {pendingSave ? (
        /* Save mode picker */
        <div className="border border-gray-200 rounded-xl p-3 mb-4">
          <p className="text-sm font-medium text-gray-800 mb-2.5">
            {pendingSave.tabs.length} tab{pendingSave.tabs.length !== 1 ? "s" : ""}
          </p>

          {/* Mode toggle */}
          <div className="flex gap-1.5 mb-3">
            {["new", "existing"].map(mode => (
              <button
                key={mode}
                onClick={() => setSaveMode(mode)}
                disabled={mode === "existing" && sessions.length === 0}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-30 ${
                  saveMode === mode
                    ? "border-gray-800 bg-gray-800 text-white"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {mode === "new" ? "New session" : "Add to existing"}
              </button>
            ))}
          </div>

          {saveMode === "new" ? (
            /* Label picker */
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => setChosenLabelId(null)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  chosenLabelId === null
                    ? "border-gray-800 bg-gray-800 text-white"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                No label
              </button>
              {labels.map(label => (
                <button
                  key={label.id}
                  onClick={() => setChosenLabelId(label.id === chosenLabelId ? null : label.id)}
                  style={chosenLabelId === label.id ? { backgroundColor: label.color } : undefined}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    chosenLabelId === label.id
                      ? "border-transparent text-gray-800"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {label.name}
                </button>
              ))}
            </div>
          ) : (
            /* Existing session picker */
            <div className="max-h-[150px] overflow-y-auto space-y-1 mb-3">
              {sessions.map(session => {
                const count = (session.windows || []).flatMap(w => w.tabs || []).length
                const label = labels.find(l => l.id === session.labelId)
                const isSelected = targetSessionId === session.id
                return (
                  <button
                    key={session.id}
                    onClick={() => setTargetSessionId(isSelected ? null : session.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                      isSelected
                        ? "border-gray-800 bg-gray-50"
                        : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <span className="font-medium text-gray-800">{count} tab{count !== 1 ? "s" : ""}</span>
                    {label && (
                      <span
                        style={{ backgroundColor: label.color }}
                        className="ml-1.5 px-1.5 py-0.5 rounded text-gray-700"
                      >
                        {label.name}
                      </span>
                    )}
                    <span className="text-gray-400 ml-1.5">{session.createdAt}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={confirmSave}
              disabled={saveMode === "existing" && !targetSessionId}
              className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-30"
            >
              Save & close
            </button>
            <button
              onClick={() => setPendingSave(null)}
              className="text-sm text-gray-400 px-3 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Tab selector */
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              This window
            </span>
            <button
              onClick={toggleAll}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>

          <div className="max-h-[180px] overflow-y-auto space-y-0.5 mb-3">
            {currentTabs.map(tab => (
              <label
                key={tab.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(tab.id)}
                  onChange={() => toggleTab(tab.id)}
                  className="w-3.5 h-3.5 flex-shrink-0 accent-gray-900"
                />
                {tab.favIconUrl ? (
                  <img
                    src={tab.favIconUrl}
                    className="w-3.5 h-3.5 flex-shrink-0"
                    onError={e => { e.currentTarget.style.display = "none" }}
                  />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-sm bg-gray-100 flex-shrink-0" />
                )}
                <span className="text-xs text-gray-700 truncate">{tab.title}</span>
              </label>
            ))}
          </div>

          <button
            onClick={startSave}
            disabled={selectedIds.size === 0 || saving}
            className="w-full bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-30 transition-opacity"
          >
            {selectedIds.size === 0
              ? "Select tabs to save"
              : allSelected
              ? "Save & close all tabs"
              : `Save & close ${selectedIds.size} tab${selectedIds.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {/* Label filter pills */}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setFilterLabelId(null)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              filterLabelId === null
                ? "border-gray-800 bg-gray-800 text-white"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            All
          </button>
          {labels.map(label => (
            <button
              key={label.id}
              onClick={() => setFilterLabelId(filterLabelId === label.id ? null : label.id)}
              style={filterLabelId === label.id ? { backgroundColor: label.color } : undefined}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                filterLabelId === label.id
                  ? "border-transparent text-gray-800"
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              {label.name}
            </button>
          ))}
        </div>
      )}

      {/* Sessions list */}
      {filtered.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">
          {sessions.length === 0 ? "No saved sessions yet." : "No sessions with this label."}
        </p>
      ) : (
        <div className="space-y-2 mb-4">
          {filtered.map(session => {
            const allTabs = (session.windows || []).flatMap(w => w.tabs || [])
            const preview = allTabs.slice(0, 3)
            const remaining = allTabs.length - preview.length
            const label = labels.find(l => l.id === session.labelId)

            return (
              <div
                key={session.id}
                className="border border-gray-100 rounded-xl p-3 hover:border-gray-200 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">
                        {allTabs.length} tab{allTabs.length !== 1 ? "s" : ""}
                      </p>
                      {label && (
                        <span
                          style={{ backgroundColor: label.color }}
                          className="text-xs px-1.5 py-0.5 rounded text-gray-700 font-normal"
                        >
                          {label.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{session.createdAt}</p>
                  </div>
                  <div className="flex gap-1.5 ml-2 flex-shrink-0">
                    <button
                      onClick={() => restoreSession(session)}
                      className="text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => deleteSession(session.id)}
                      className="text-xs text-gray-400 hover:text-red-400 px-2 py-1 rounded-lg transition-colors"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="mt-2 space-y-0.5">
                  {preview.map((tab, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {tab.favicon ? (
                        <img
                          src={tab.favicon}
                          className="w-3 h-3 flex-shrink-0"
                          onError={e => { e.currentTarget.style.display = "none" }}
                        />
                      ) : (
                        <div className="w-3 h-3 rounded-sm bg-gray-100 flex-shrink-0" />
                      )}
                      <p className="text-xs text-gray-500 truncate">{tab.title}</p>
                    </div>
                  ))}
                  {remaining > 0 && (
                    <p className="text-xs text-gray-400 pl-[18px]">+{remaining} more</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Label management */}
      <div className="border-t border-gray-100 pt-3">
        {showAddLabel ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={newLabelName}
              onChange={e => setNewLabelName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") addLabel()
                if (e.key === "Escape") { setShowAddLabel(false); setNewLabelName("") }
              }}
              placeholder="Label name…"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-gray-400"
            />
            <button onClick={addLabel} className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-lg">
              Add
            </button>
            <button
              onClick={() => { setShowAddLabel(false); setNewLabelName("") }}
              className="text-sm text-gray-400 px-2 py-1.5 rounded-lg hover:bg-gray-50"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              {labels.map(label => (
                <div
                  key={label.id}
                  style={{ backgroundColor: label.color }}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md text-gray-700"
                >
                  {label.name}
                  <button
                    onClick={() => deleteLabel(label.id)}
                    className="text-gray-500 hover:text-gray-900 ml-0.5 leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowAddLabel(true)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5 flex-shrink-0 ml-2"
            >
              <span className="text-sm leading-none">+</span> Label
            </button>
          </div>
        )}
      </div>

    </div>
  )
}

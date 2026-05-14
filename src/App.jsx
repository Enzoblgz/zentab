import { useEffect, useState } from "react"

const IS_FIREFOX = typeof globalThis.browser !== "undefined"
const NEW_TAB_URL = IS_FIREFOX ? "about:newtab" : "chrome://newtab"

const LABEL_COLORS = [
  "#3f3f46", "#7f1d1d", "#78350f", "#713f12",
  "#14532d", "#164e63", "#3b0764", "#500724",
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
        .map(tab => ({ title: tab.title, url: tab.url, favicon: tab.favIconUrl || null }))
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
    if (!session.starred) await deleteSession(session.id)
  }

  async function deleteSession(id) {
    const updated = sessions.filter(s => s.id !== id)
    await chrome.storage.local.set({ sessions: updated })
    setSessions(updated)
  }

  async function toggleStar(id) {
    const updated = sessions.map(s => s.id === id ? { ...s, starred: !s.starred } : s)
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

  const baseFiltered = filterLabelId ? sessions.filter(s => s.labelId === filterLabelId) : sessions
  const filtered = [
    ...baseFiltered.filter(s => s.starred),
    ...baseFiltered.filter(s => !s.starred),
  ]

  return (
    <div className="w-[400px] bg-[#111] p-5">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-base font-semibold tracking-tight text-[#e8e8e8]">ZenTab</h1>
        {sessions.length > 0 && (
          <span className="text-xs text-[#444]">{sessions.length} saved</span>
        )}
      </div>

      {/* ── SAVE SECTION ── */}
      <div className="mb-5">
        <p className="text-[10px] font-medium text-[#444] uppercase tracking-widest mb-3">
          Save
        </p>

        {pendingSave ? (
          <div className="border border-[#2a2a2a] rounded-xl p-3">
            <p className="text-sm font-medium text-[#e8e8e8] mb-3">
              {pendingSave.tabs.length} tab{pendingSave.tabs.length !== 1 ? "s" : ""}
            </p>

            <div className="flex gap-1.5 mb-3">
              {["new", "existing"].map(mode => (
                <button
                  key={mode}
                  onClick={() => setSaveMode(mode)}
                  disabled={mode === "existing" && sessions.length === 0}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-20 ${
                    saveMode === mode
                      ? "border-white bg-white text-[#111]"
                      : "border-[#2a2a2a] text-[#666] hover:border-[#3a3a3a]"
                  }`}
                >
                  {mode === "new" ? "New session" : "Add to existing"}
                </button>
              ))}
            </div>

            {saveMode === "new" ? (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => setChosenLabelId(null)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    chosenLabelId === null
                      ? "border-white bg-white text-[#111]"
                      : "border-[#2a2a2a] text-[#666] hover:border-[#3a3a3a]"
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
                        ? "border-transparent text-[#e8e8e8]"
                        : "border-[#2a2a2a] text-[#666] hover:border-[#3a3a3a]"
                    }`}
                  >
                    {label.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="max-h-[140px] overflow-y-auto space-y-1 mb-3">
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
                          ? "border-white bg-[#1e1e1e] text-[#e8e8e8]"
                          : "border-[#222] text-[#888] hover:border-[#333]"
                      }`}
                    >
                      <span className="font-medium">{count} tab{count !== 1 ? "s" : ""}</span>
                      {label && (
                        <span style={{ backgroundColor: label.color }} className="ml-1.5 px-1.5 py-0.5 rounded text-[#e8e8e8]">
                          {label.name}
                        </span>
                      )}
                      <span className="text-[#444] ml-1.5">{session.createdAt}</span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={confirmSave}
                disabled={saveMode === "existing" && !targetSessionId}
                className="flex-1 bg-white text-[#111] rounded-lg py-2 text-sm font-medium disabled:opacity-20"
              >
                Save & close
              </button>
              <button
                onClick={() => setPendingSave(null)}
                className="text-sm text-[#555] px-3 rounded-lg hover:bg-[#1a1a1a]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="max-h-[180px] overflow-y-auto space-y-0.5 mb-3">
              {currentTabs.map(tab => (
                <label
                  key={tab.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#1a1a1a] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(tab.id)}
                    onChange={() => toggleTab(tab.id)}
                    className="w-3.5 h-3.5 flex-shrink-0 accent-white"
                  />
                  {tab.favIconUrl ? (
                    <img
                      src={tab.favIconUrl}
                      className="w-3.5 h-3.5 flex-shrink-0"
                      onError={e => { e.currentTarget.style.display = "none" }}
                    />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-sm bg-[#222] flex-shrink-0" />
                  )}
                  <span className="text-xs text-[#aaa] truncate">{tab.title}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between mb-2.5">
              <button onClick={toggleAll} className="text-xs text-[#444] hover:text-[#888]">
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <span className="text-xs text-[#444]">
                {selectedIds.size}/{currentTabs.length} selected
              </span>
            </div>

            <button
              onClick={startSave}
              disabled={selectedIds.size === 0 || saving}
              className="w-full bg-white text-[#111] rounded-xl py-2.5 text-sm font-medium disabled:opacity-20 transition-opacity"
            >
              {selectedIds.size === 0
                ? "Select tabs to save"
                : allSelected
                ? "Save & close all tabs"
                : `Save & close ${selectedIds.size} tab${selectedIds.size !== 1 ? "s" : ""}`}
            </button>
          </>
        )}
      </div>

      {/* ── DIVIDER ── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-[#1e1e1e]" />
        <span className="text-[10px] font-medium text-[#333] uppercase tracking-widest">Sessions</span>
        <div className="flex-1 h-px bg-[#1e1e1e]" />
      </div>

      {/* Label filter pills */}
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setFilterLabelId(null)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              filterLabelId === null
                ? "border-white bg-white text-[#111]"
                : "border-[#2a2a2a] text-[#555] hover:border-[#333]"
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
                  ? "border-transparent text-[#e8e8e8]"
                  : "border-[#2a2a2a] text-[#555] hover:border-[#333]"
              }`}
            >
              {label.name}
            </button>
          ))}
        </div>
      )}

      {/* Sessions list */}
      {filtered.length === 0 ? (
        <p className="text-center text-xs text-[#333] py-8">
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
                className={`rounded-xl p-3 border-l-2 transition-colors ${
                  session.starred
                    ? "bg-[#1a1500] border-l-amber-500 border border-amber-500/20"
                    : "bg-[#1a1a1a] border-l-transparent border border-[#222] hover:border-[#2a2a2a]"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className={`text-sm font-medium ${session.starred ? "text-amber-100" : "text-[#e8e8e8]"}`}>
                        {allTabs.length} tab{allTabs.length !== 1 ? "s" : ""}
                      </p>
                      {label && (
                        <span
                          style={{ backgroundColor: label.color }}
                          className="text-xs px-1.5 py-0.5 rounded text-[#e8e8e8] font-normal"
                        >
                          {label.name}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-0.5 ${session.starred ? "text-amber-900" : "text-[#444]"}`}>
                      {session.createdAt}
                    </p>
                  </div>

                  <div className="flex gap-1 ml-2 flex-shrink-0 items-center">
                    <button
                      onClick={() => toggleStar(session.id)}
                      className="px-1.5 py-1 rounded-lg transition-colors"
                    >
                      <span className={`text-sm ${session.starred ? "text-amber-400" : "text-[#333] hover:text-amber-500"}`}>
                        {session.starred ? "★" : "☆"}
                      </span>
                    </button>
                    <button
                      onClick={() => restoreSession(session)}
                      className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                        session.starred
                          ? "bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                          : "bg-[#222] text-[#888] hover:bg-[#2a2a2a]"
                      }`}
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => deleteSession(session.id)}
                      className="text-xs text-[#333] hover:text-red-500 px-2 py-1 rounded-lg transition-colors"
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
                        <div className="w-3 h-3 rounded-sm bg-[#222] flex-shrink-0" />
                      )}
                      <p className={`text-xs truncate ${session.starred ? "text-amber-200/60" : "text-[#555]"}`}>
                        {tab.title}
                      </p>
                    </div>
                  ))}
                  {remaining > 0 && (
                    <p className={`text-xs pl-[18px] ${session.starred ? "text-amber-900" : "text-[#333]"}`}>
                      +{remaining} more
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Label management */}
      <div className="border-t border-[#1e1e1e] pt-3">
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
              className="flex-1 text-sm bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#444] text-[#e8e8e8] placeholder-[#333]"
            />
            <button onClick={addLabel} className="text-sm bg-white text-[#111] px-3 py-1.5 rounded-lg">
              Add
            </button>
            <button
              onClick={() => { setShowAddLabel(false); setNewLabelName("") }}
              className="text-sm text-[#444] px-2 py-1.5 rounded-lg hover:bg-[#1a1a1a]"
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
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md text-[#e8e8e8]"
                >
                  {label.name}
                  <button
                    onClick={() => deleteLabel(label.id)}
                    className="text-[#aaa] hover:text-white ml-0.5 leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowAddLabel(true)}
              className="text-xs text-[#333] hover:text-[#666] flex items-center gap-0.5 flex-shrink-0 ml-2"
            >
              <span className="text-sm leading-none">+</span> Label
            </button>
          </div>
        )}
      </div>

    </div>
  )
}

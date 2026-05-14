import { useEffect, useState } from "react"

const IS_FIREFOX = typeof globalThis.browser !== "undefined"
const NEW_TAB_URL = IS_FIREFOX ? "about:newtab" : "chrome://newtab"

const LABEL_COLORS = [
  "#4f46e5", "#dc2626", "#c2410c", "#a16207",
  "#15803d", "#1d4ed8", "#7e22ce", "#be185d",
]

const DARK = {
  bg: "#111",
  surface: "#1a1a1a",
  surfaceHover: "#1e1e1e",
  border: "#242424",
  borderHover: "#2e2e2e",
  text: "#e8e8e8",
  textSub: "#555",
  textMuted: "#2e2e2e",
  inputBg: "#181818",
  inputBorder: "#282828",
  placeholder: "#333",
  divider: "#1c1c1c",
  sectionLabel: "#2e2e2e",
  btnPrimary: ["#fff", "#111"],
  btnSecondary: ["#1e1e1e", "#888"],
  btnGhost: "#3a3a3a",
  favBg: "#1a1500",
  favBorder: "rgba(245,158,11,0.25)",
  favText: "#fef3c7",
  favSub: "#78350f",
  starActive: "#f59e0b",
  starInactive: "#2e2e2e",
  checkAccent: "white",
}

const LIGHT = {
  bg: "#ffffff",
  surface: "#f5f5f5",
  surfaceHover: "#efefef",
  border: "#e8e8e8",
  borderHover: "#d8d8d8",
  text: "#111",
  textSub: "#888",
  textMuted: "#ccc",
  inputBg: "#fff",
  inputBorder: "#e0e0e0",
  placeholder: "#bbb",
  divider: "#ebebeb",
  sectionLabel: "#ccc",
  btnPrimary: ["#111", "#fff"],
  btnSecondary: ["#f0f0f0", "#555"],
  btnGhost: "#bbb",
  favBg: "#fffbeb",
  favBorder: "rgba(245,158,11,0.3)",
  favText: "#92400e",
  favSub: "#d97706",
  starActive: "#f59e0b",
  starInactive: "#ddd",
  checkAccent: "#111",
}

export default function App() {
  const [isDark, setIsDark] = useState(true)
  const [sessions, setSessions] = useState([])
  const [labels, setLabels] = useState([])
  const [favorites, setFavorites] = useState([])
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

  const T = isDark ? DARK : LIGHT

  async function load() {
    const data = await chrome.storage.local.get(["sessions", "labels", "favorites", "theme"])
    setSessions((data.sessions || []).filter(s => Array.isArray(s.windows)))
    setLabels(data.labels || [])
    setFavorites(data.favorites || [])
    setIsDark(data.theme !== "light")
    const win = await chrome.windows.getCurrent({ populate: true })
    setCurrentWindowId(win.id)
    setCurrentTabs(win.tabs || [])
    setSelectedIds(new Set((win.tabs || []).map(t => t.id)))
  }

  async function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    await chrome.storage.local.set({ theme: next ? "dark" : "light" })
  }

  function toggleTab(tabId) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(tabId) ? next.delete(tabId) : next.add(tabId)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(
      selectedIds.size === currentTabs.length
        ? new Set()
        : new Set(currentTabs.map(t => t.id))
    )
  }

  async function toggleFavorite(tab) {
    const exists = favorites.find(f => f.url === tab.url)
    const updated = exists
      ? favorites.filter(f => f.url !== tab.url)
      : [...favorites, { id: Date.now(), title: tab.title, url: tab.url, favicon: tab.favIconUrl || null }]
    await chrome.storage.local.set({ favorites: updated })
    setFavorites(updated)
  }

  async function removeFavorite(id) {
    const updated = favorites.filter(f => f.id !== id)
    await chrome.storage.local.set({ favorites: updated })
    setFavorites(updated)
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
        return { ...s, windows: [{ tabs: [...(s.windows[0]?.tabs || []), ...pendingSave.tabs] }] }
      })
    } else {
      updated = [
        { id: Date.now(), createdAt: new Date().toLocaleString(), labelId: chosenLabelId, windows: [{ tabs: pendingSave.tabs }] },
        ...(existing.sessions || [])
      ]
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
  const filtered = [...baseFiltered.filter(s => s.starred), ...baseFiltered.filter(s => !s.starred)]

  const s = (base, hover) => ({ background: base, onMouseEnter: e => e.currentTarget.style.background = hover, onMouseLeave: e => e.currentTarget.style.background = base })

  return (
    <div style={{ background: T.bg, color: T.text }} className="w-[400px] p-5">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 style={{ color: T.text }} className="text-base font-semibold tracking-tight">ZenTab</h1>
        <div className="flex items-center gap-3">
          {sessions.length > 0 && (
            <span style={{ color: T.textSub }} className="text-xs">{sessions.length} sauvegardées</span>
          )}
          <button
            onClick={toggleTheme}
            style={{ color: T.textSub }}
            className="text-base hover:opacity-70 transition-opacity leading-none"
            title={isDark ? "Passer en clair" : "Passer en sombre"}
          >
            {isDark ? "☀" : "☾"}
          </button>
        </div>
      </div>

      {/* ── SAVE ── */}
      <p style={{ color: T.sectionLabel }} className="text-[10px] font-medium uppercase tracking-widest mb-3">
        Sauvegarder
      </p>

      {pendingSave ? (
        <div style={{ background: T.surface, borderColor: T.border }} className="border rounded-xl p-3 mb-5">
          <p style={{ color: T.text }} className="text-sm font-medium mb-3">
            {pendingSave.tabs.length} onglet{pendingSave.tabs.length !== 1 ? "s" : ""}
          </p>

          <div className="flex gap-1.5 mb-3">
            {["new", "existing"].map(mode => (
              <button
                key={mode}
                onClick={() => setSaveMode(mode)}
                disabled={mode === "existing" && sessions.length === 0}
                style={{
                  background: saveMode === mode ? T.btnPrimary[0] : "transparent",
                  color: saveMode === mode ? T.btnPrimary[1] : T.textSub,
                  borderColor: saveMode === mode ? T.btnPrimary[0] : T.border,
                }}
                className="text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-20"
              >
                {mode === "new" ? "Nouvelle session" : "Ajouter à existante"}
              </button>
            ))}
          </div>

          {saveMode === "new" ? (
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => setChosenLabelId(null)}
                style={{
                  background: chosenLabelId === null ? T.btnPrimary[0] : "transparent",
                  color: chosenLabelId === null ? T.btnPrimary[1] : T.textSub,
                  borderColor: chosenLabelId === null ? T.btnPrimary[0] : T.border,
                }}
                className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
              >
                Sans label
              </button>
              {labels.map(label => (
                <button
                  key={label.id}
                  onClick={() => setChosenLabelId(label.id === chosenLabelId ? null : label.id)}
                  style={{
                    background: chosenLabelId === label.id ? label.color : "transparent",
                    color: chosenLabelId === label.id ? "#fff" : T.textSub,
                    borderColor: chosenLabelId === label.id ? label.color : T.border,
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
                >
                  {label.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="max-h-[130px] overflow-y-auto space-y-1 mb-3">
              {sessions.map(session => {
                const count = (session.windows || []).flatMap(w => w.tabs || []).length
                const label = labels.find(l => l.id === session.labelId)
                const isSel = targetSessionId === session.id
                return (
                  <button
                    key={session.id}
                    onClick={() => setTargetSessionId(isSel ? null : session.id)}
                    style={{
                      background: isSel ? T.surfaceHover : "transparent",
                      color: T.text,
                      borderColor: isSel ? T.btnPrimary[0] : T.border,
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition-colors"
                  >
                    <span className="font-medium">{count} onglet{count !== 1 ? "s" : ""}</span>
                    {label && (
                      <span style={{ background: label.color, color: "#fff" }} className="ml-1.5 px-1.5 py-0.5 rounded">
                        {label.name}
                      </span>
                    )}
                    <span style={{ color: T.textSub }} className="ml-1.5">{session.createdAt}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={confirmSave}
              disabled={saveMode === "existing" && !targetSessionId}
              style={{ background: T.btnPrimary[0], color: T.btnPrimary[1] }}
              className="flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-20"
            >
              Sauvegarder & fermer
            </button>
            <button
              onClick={() => setPendingSave(null)}
              style={{ color: T.textSub }}
              className="text-sm px-3 rounded-lg"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-5">
          <div className="max-h-[180px] overflow-y-auto space-y-0.5 mb-2">
            {currentTabs.map(tab => {
              const isFav = favorites.some(f => f.url === tab.url)
              return (
                <div
                  key={tab.id}
                  style={{ borderRadius: "8px" }}
                  className="flex items-center gap-2 px-2 py-1.5 group"
                  onMouseEnter={e => e.currentTarget.style.background = T.surfaceHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(tab.id)}
                      onChange={() => toggleTab(tab.id)}
                      style={{ accentColor: T.checkAccent }}
                      className="w-3.5 h-3.5 flex-shrink-0"
                    />
                    {tab.favIconUrl ? (
                      <img src={tab.favIconUrl} className="w-3.5 h-3.5 flex-shrink-0" onError={e => { e.currentTarget.style.display = "none" }} />
                    ) : (
                      <div style={{ background: T.border }} className="w-3.5 h-3.5 rounded-sm flex-shrink-0" />
                    )}
                    <span style={{ color: T.text }} className="text-xs truncate">{tab.title}</span>
                  </label>
                  <button
                    onClick={() => toggleFavorite(tab)}
                    style={{ color: isFav ? T.starActive : T.starInactive }}
                    className="text-xs flex-shrink-0 transition-colors hover:opacity-80"
                    title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
                  >
                    {isFav ? "♥" : "♡"}
                  </button>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between mb-2.5">
            <button onClick={toggleAll} style={{ color: T.textSub }} className="text-xs hover:opacity-70">
              {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
            </button>
            <span style={{ color: T.textSub }} className="text-xs">
              {selectedIds.size}/{currentTabs.length}
            </span>
          </div>

          <button
            onClick={startSave}
            disabled={selectedIds.size === 0 || saving}
            style={{ background: T.btnPrimary[0], color: T.btnPrimary[1] }}
            className="w-full rounded-xl py-2.5 text-sm font-medium disabled:opacity-20 transition-opacity"
          >
            {selectedIds.size === 0
              ? "Sélectionner des onglets"
              : allSelected
              ? "Sauvegarder & fermer tous"
              : `Sauvegarder & fermer ${selectedIds.size} onglet${selectedIds.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {/* ── FAVORIS ── */}
      <div className="flex items-center gap-3 mb-3">
        <div style={{ background: T.divider }} className="flex-1 h-px" />
        <span style={{ color: T.sectionLabel }} className="text-[10px] font-medium uppercase tracking-widest">
          Favoris
        </span>
        <div style={{ background: T.divider }} className="flex-1 h-px" />
      </div>

      {favorites.length === 0 ? (
        <p style={{ color: T.textMuted }} className="text-xs text-center py-4 mb-3">
          Ajoutez des onglets avec ♡
        </p>
      ) : (
        <div className="space-y-1 mb-4">
          {favorites.map(fav => (
            <div
              key={fav.id}
              style={{ background: T.surface, borderColor: T.border }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border"
            >
              {fav.favicon ? (
                <img src={fav.favicon} className="w-3.5 h-3.5 flex-shrink-0" onError={e => { e.currentTarget.style.display = "none" }} />
              ) : (
                <div style={{ background: T.border }} className="w-3.5 h-3.5 rounded-sm flex-shrink-0" />
              )}
              <span style={{ color: T.text }} className="text-xs truncate flex-1">{fav.title}</span>
              <button
                onClick={() => chrome.tabs.create({ url: fav.url })}
                style={{ background: T.surface, color: T.textSub, borderColor: T.border }}
                className="text-xs px-2 py-0.5 rounded border flex-shrink-0 hover:opacity-70 transition-opacity"
              >
                Ouvrir
              </button>
              <button
                onClick={() => removeFavorite(fav.id)}
                style={{ color: T.textMuted }}
                className="text-xs px-1 flex-shrink-0 hover:opacity-70"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── SESSIONS PRÉCÉDENTES ── */}
      <div className="flex items-center gap-3 mb-3">
        <div style={{ background: T.divider }} className="flex-1 h-px" />
        <span style={{ color: T.sectionLabel }} className="text-[10px] font-medium uppercase tracking-widest whitespace-nowrap">
          Sessions précédentes
        </span>
        <div style={{ background: T.divider }} className="flex-1 h-px" />
      </div>

      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => setFilterLabelId(null)}
            style={{
              background: filterLabelId === null ? T.btnPrimary[0] : "transparent",
              color: filterLabelId === null ? T.btnPrimary[1] : T.textSub,
              borderColor: filterLabelId === null ? T.btnPrimary[0] : T.border,
            }}
            className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
          >
            Toutes
          </button>
          {labels.map(label => (
            <button
              key={label.id}
              onClick={() => setFilterLabelId(filterLabelId === label.id ? null : label.id)}
              style={{
                background: filterLabelId === label.id ? label.color : "transparent",
                color: filterLabelId === label.id ? "#fff" : T.textSub,
                borderColor: filterLabelId === label.id ? label.color : T.border,
              }}
              className="text-xs px-2.5 py-1 rounded-lg border transition-colors"
            >
              {label.name}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p style={{ color: T.textMuted }} className="text-center text-xs py-6 mb-3">
          {sessions.length === 0 ? "Aucune session sauvegardée." : "Aucune session avec ce label."}
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
                style={session.starred ? {
                  background: T.favBg,
                  borderColor: T.favBorder,
                  borderLeftColor: T.starActive,
                } : {
                  background: T.surface,
                  borderColor: T.border,
                  borderLeftColor: "transparent",
                }}
                className="rounded-xl p-3 border border-l-2 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p style={{ color: session.starred ? T.favText : T.text }} className="text-sm font-medium">
                        {allTabs.length} onglet{allTabs.length !== 1 ? "s" : ""}
                      </p>
                      {label && (
                        <span style={{ background: label.color, color: "#fff" }} className="text-xs px-1.5 py-0.5 rounded font-normal">
                          {label.name}
                        </span>
                      )}
                    </div>
                    <p style={{ color: session.starred ? T.favSub : T.textSub }} className="text-xs mt-0.5">
                      {session.createdAt}
                    </p>
                  </div>

                  <div className="flex gap-1 ml-2 flex-shrink-0 items-center">
                    <button onClick={() => toggleStar(session.id)} className="px-1.5 py-1 rounded-lg transition-colors">
                      <span style={{ color: session.starred ? T.starActive : T.starInactive }} className="text-sm">
                        {session.starred ? "★" : "☆"}
                      </span>
                    </button>
                    <button
                      onClick={() => restoreSession(session)}
                      style={session.starred
                        ? { background: "rgba(245,158,11,0.12)", color: "#fbbf24" }
                        : { background: T.surface, color: T.textSub }
                      }
                      className="text-xs px-2.5 py-1 rounded-lg transition-colors hover:opacity-80"
                    >
                      Restaurer
                    </button>
                    <button onClick={() => deleteSession(session.id)} style={{ color: T.textMuted }} className="text-xs px-2 py-1 rounded-lg hover:opacity-70">
                      ×
                    </button>
                  </div>
                </div>

                <div className="mt-2 space-y-0.5">
                  {preview.map((tab, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {tab.favicon ? (
                        <img src={tab.favicon} className="w-3 h-3 flex-shrink-0" onError={e => { e.currentTarget.style.display = "none" }} />
                      ) : (
                        <div style={{ background: T.border }} className="w-3 h-3 rounded-sm flex-shrink-0" />
                      )}
                      <p style={{ color: session.starred ? T.favSub : T.textSub }} className="text-xs truncate">
                        {tab.title}
                      </p>
                    </div>
                  ))}
                  {remaining > 0 && (
                    <p style={{ color: session.starred ? T.favSub : T.textMuted }} className="text-xs pl-[18px]">
                      +{remaining} de plus
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Label management */}
      <div style={{ borderTopColor: T.divider }} className="border-t pt-3">
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
              placeholder="Nom du label…"
              style={{ background: T.inputBg, borderColor: T.inputBorder, color: T.text }}
              className="flex-1 text-sm border rounded-lg px-2.5 py-1.5 outline-none"
            />
            <button onClick={addLabel} style={{ background: T.btnPrimary[0], color: T.btnPrimary[1] }} className="text-sm px-3 py-1.5 rounded-lg">
              Ajouter
            </button>
            <button onClick={() => { setShowAddLabel(false); setNewLabelName("") }} style={{ color: T.textSub }} className="text-sm px-2 py-1.5 rounded-lg">
              ✕
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              {labels.map(label => (
                <div key={label.id} style={{ background: label.color }} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md text-white">
                  {label.name}
                  <button onClick={() => deleteLabel(label.id)} className="text-white/60 hover:text-white ml-0.5 leading-none">×</button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowAddLabel(true)} style={{ color: T.textSub }} className="text-xs flex items-center gap-0.5 flex-shrink-0 ml-2 hover:opacity-70">
              <span className="text-sm leading-none">+</span> Label
            </button>
          </div>
        )}
      </div>

    </div>
  )
}

"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, ArrowRight, CalendarDays, Check, CircleHelp, Clock3, Moon, Pencil, Plus, RefreshCw, Sun, Trash2, X } from "lucide-react";
const RANGE_START = "2026-11-01";
const RANGE_END = "2027-01-10";
const MONTHS = [
    { year: 2026, month: 10, name: "November" },
    { year: 2026, month: 11, name: "December" },
    { year: 2027, month: 0, name: "January" },
];
const TEAM_MEMBERS = [
    "Able", "Andrew", "Bill", "Christian", "Clint", "Corbin", "Dave", "Derrick", "Ethan", "Jackson",
    "Jacob G", "Jacob H", "Jake", "John", "Jon", "Josh B", "Josh I", "Kevin", "Kyle", "Preston",
    "Rob", "Ryan", "Seth", "Shane", "Sonny", "Thatcher", "Tim", "Tom", "Victoria", "Zach", 
];
const HOLIDAYS = {
    "2026-11-26": "Thanksgiving",
    "2026-11-27": "Black Friday",
    "2026-12-24": "Christmas Eve",
    "2026-12-25": "Christmas Day",
    "2027-01-01": "New Year’s Day",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function toDate(value) {
    return new Date(`${value}T12:00:00Z`);
}
function isoDate(value) {
    return value.toISOString().slice(0, 10);
}
function makeDates() {
    const dates = [];
    for (let date = toDate(RANGE_START); isoDate(date) <= RANGE_END; date.setUTCDate(date.getUTCDate() + 1)) {
        dates.push(isoDate(date));
    }
    return dates;
}
function makeMonthWeeks(year, month) {
    const first = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const grid = Array((first.getUTCDay() + 6) % 7).fill(null);
    for (let day = 1; day <= lastDay; day += 1) {
        const date = isoDate(new Date(Date.UTC(year, month, day, 12)));
        if (date > RANGE_END)
            break;
        grid.push(date >= RANGE_START ? date : null);
    }
    while (grid.length % 7)
        grid.push(null);
    return Array.from({ length: grid.length / 7 }, (_, index) => grid.slice(index * 7, index * 7 + 7));
}
function fmt(value, options = { month: "short", day: "numeric" }) {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(toDate(value));
}
function rangeLabel(start, end) {
    if (start.slice(0, 4) !== end.slice(0, 4))
        return `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(end, { month: "short", day: "numeric", year: "numeric" })}`;
    if (start.slice(0, 7) === end.slice(0, 7))
        return `${fmt(start)}–${fmt(end, { day: "numeric" })}`;
    return `${fmt(start)} – ${fmt(end, { month: "short", day: "numeric" })}`;
}
async function readBody(response) {
    try {
        return await response.json();
    }
    catch {
        return { error: `The calendar server didn’t respond correctly (${response.status}). Please try again.` };
    }
}
function shortName(value) {
    return value.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
export default function CalendarBoard() {
    const dates = useMemo(makeDates, []);
    const [entries, setEntries] = useState([]);
    const [selectedDate, setSelectedDate] = useState(RANGE_START);
    const [view, setView] = useState("calendar");
    const [showForm, setShowForm] = useState(false);
    const [editingEntry, setEditingEntry] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState("");
    const [currentUser, setCurrentUser] = useState(() => {
        try {
            return window.localStorage.getItem("holiday-coverage-team-member") || "";
        }
        catch {
            return "";
        }
    });
    const [theme, setTheme] = useState("light");
    const [themeReady, setThemeReady] = useState(false);
    const themeOwner = useRef("");
    const [form, setForm] = useState({ employee: "", startDate: RANGE_START, endDate: RANGE_START, cover: "", note: "" });
    async function loadEntries(silent = false) {
        if (!silent)
            setLoading(true);
        try {
            const response = await fetch("/api/time-off", { cache: "no-store", headers: currentUser ? { "X-Team-Member": currentUser } : {} });
            const data = await readBody(response);
            if (!response.ok)
                throw new Error(data.error || "Could not load the calendar.");
            setEntries(data.entries || []);
            setCurrentUser(data.currentUserId || currentUser);
            setNotice("");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Could not load the calendar.");
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => { void loadEntries(); }, [currentUser]);
    const refreshState = useRef({ busy: false, loadEntries });
    refreshState.current = { busy: showForm || saving, loadEntries };
    useEffect(() => {
        const timer = window.setInterval(() => {
            if (!refreshState.current.busy)
                void refreshState.current.loadEntries(true);
        }, 5 * 60 * 1000);
        return () => window.clearInterval(timer);
    }, []);
    useEffect(() => {
        try {
            if (currentUser)
                window.localStorage.setItem("holiday-coverage-team-member", currentUser);
            else
                window.localStorage.removeItem("holiday-coverage-team-member");
        }
        catch {
            // Browser storage can be blocked; the profile still works for this session.
        }
    }, [currentUser]);
    useEffect(() => {
        if (!currentUser)
            return;
        const key = `holiday-coverage-theme:${currentUser}`;
        themeOwner.current = currentUser;
        try {
            setTheme(window.localStorage.getItem(key) === "dark" ? "dark" : "light");
        }
        catch {
            setTheme("light");
        }
        setThemeReady(true);
    }, [currentUser]);
    useEffect(() => {
        if (!currentUser || !themeReady || themeOwner.current !== currentUser)
            return;
        try {
            window.localStorage.setItem(`holiday-coverage-theme:${currentUser}`, theme);
        }
        catch {
            // Keep the selected theme for this session if browser storage is unavailable.
        }
    }, [currentUser, theme, themeReady]);
    const entriesForDate = (date) => entries.filter((entry) => entry.startDate <= date && entry.endDate >= date);
    const selectedEntries = entriesForDate(selectedDate);
    const peopleCount = new Set(entries.map((entry) => entry.employee.toLowerCase())).size;
    const totalDays = entries.reduce((sum, entry) => {
        const first = toDate(entry.startDate).getTime();
        const last = toDate(entry.endDate).getTime();
        return sum + Math.round((last - first) / 86400000) + 1;
    }, 0);
    const activeDate = new Date();
    // Use the viewer's local date; the UTC date flips to tomorrow in the evening for US time zones.
    const today = `${activeDate.getFullYear()}-${String(activeDate.getMonth() + 1).padStart(2, "0")}-${String(activeDate.getDate()).padStart(2, "0")}`;
    const peak = dates.map((date) => ({ date, count: entriesForDate(date).length })).sort((a, b) => b.count - a.count)[0];
    function openForm(date = selectedDate) {
        setEditingEntry(null);
        setNotice("");
        setForm({ employee: currentUser, startDate: date, endDate: date, cover: "", note: "" });
        setShowForm(true);
    }
    function openEdit(entry) {
        setEditingEntry(entry);
        setNotice("");
        setForm({ employee: entry.employee, startDate: entry.startDate, endDate: entry.endDate, cover: entry.cover, note: entry.note || "" });
        setSelectedDate(entry.startDate);
        setShowForm(true);
    }
    async function submitForm(event) {
        event.preventDefault();
        // Fall back to the form's name when nobody is picked in the top bar.
        const actor = currentUser || form.employee;
        setSaving(true);
        setNotice("");
        try {
            const response = await fetch("/api/time-off", {
                method: editingEntry ? "PUT" : "POST",
                headers: { "Content-Type": "application/json", "X-Team-Member": actor },
                body: JSON.stringify(editingEntry ? { ...form, id: editingEntry.id } : form),
            });
            const data = await readBody(response);
            if (!response.ok)
                throw new Error(data.error || "Could not save the request.");
            setEntries((current) => (editingEntry
                ? current.map((entry) => entry.id === data.entry.id ? data.entry : entry)
                : [...current, data.entry]).sort((a, b) => a.startDate.localeCompare(b.startDate)));
            setSelectedDate(form.startDate);
            setShowForm(false);
            setNotice(editingEntry ? "Your time off request was updated." : "Time off added to the team calendar.");
            setEditingEntry(null);
            if (!currentUser)
                setCurrentUser(actor);
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Could not save the request.");
        }
        finally {
            setSaving(false);
        }
    }
    async function removeEntry(id) {
        if (!window.confirm("Remove this time off entry from the calendar?"))
            return;
        try {
            const response = await fetch(`/api/time-off?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-Team-Member": currentUser } });
            const data = await readBody(response);
            if (!response.ok)
                throw new Error(data.error || "Could not remove the entry.");
            setEntries((current) => current.filter((entry) => entry.id !== id));
            setNotice("Entry removed.");
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "Could not remove the entry.");
        }
    }
    return (<main className="app-shell" data-theme={theme}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Holiday cover home">
          <span className="brand-mark"><CalendarDays size={18} strokeWidth={2.1}/></span>
          <span className="brand-name">day<span>off</span></span>
          <span className="brand-divider"/>
          <span className="brand-context">Team planner</span>
        </a>
        <div className="season-pill"><span className="season-dot"/> 2026–27 holiday season</div>
        <div className="topbar-actions">
          <label className="identity-control"><span>I’m</span><select aria-label="Your team member profile" value={currentUser} onChange={(event) => setCurrentUser(event.target.value)}><option value="">Choose your name</option>{TEAM_MEMBERS.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <button className="button button-theme" onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")} aria-pressed={theme === "dark"} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>{theme === "dark" ? <Sun size={16}/> : <Moon size={16}/>}<span>{theme === "dark" ? "Light mode" : "Dark mode"}</span></button>
          <button className="button button-primary top-add" onClick={() => openForm()}><Plus size={17}/> Add time off</button>
        </div>
      </header>

      <div id="top" className="page-content">
        <section className="intro-row">
          <div>
            <p className="eyebrow">TEAM AVAILABILITY <span>·</span> HOLIDAY SEASON</p>
            <h1>Coverage, at a glance.</h1>
            <p className="intro-copy">Plan time away together, and make sure every day has a helping hand.</p>
          </div>
          <div className="date-range-block">
            <span className="date-range-label">PLANNING WINDOW</span>
            <strong>Nov 1, 2026 <span>—</span> Jan 10, 2027</strong>
            <span className="date-range-caption">10 weeks · shared with your team</span>
          </div>
        </section>

        <section className="stats-row" aria-label="Season summary">
          <article className="stat-card"><span className="stat-icon stat-icon-sand"><CalendarDays size={18}/></span><span className="stat-label">Requests logged</span><strong>{entries.length}</strong><small>for the holiday window</small></article>
          <article className="stat-card"><span className="stat-icon stat-icon-sage"><ArrowDownUp size={18}/></span><span className="stat-label">Team members</span><strong>{peopleCount}</strong><small>with planned time away</small></article>
          <article className="stat-card"><span className="stat-icon stat-icon-peach"><Clock3 size={18}/></span><span className="stat-label">Days planned</span><strong>{totalDays}</strong><small>across all requests</small></article>
          <article className="stat-card stat-card-highlight"><span className="stat-icon stat-icon-coral"><CalendarDays size={18}/></span><span className="stat-label">Busiest day</span><strong>{peak?.count ? fmt(peak.date, { month: "short", day: "numeric" }) : "—"}</strong><small>{peak?.count ? `${peak.count} ${peak.count === 1 ? "person" : "people"} out` : "No requests yet"}</small></article>
        </section>

        <div className="section-heading">
          <div><h2>Holiday calendar</h2><p>Select a day to see who’s out and who’s covering.</p></div>
          <div className="view-control" role="tablist" aria-label="Calendar view">
            <button role="tab" aria-selected={view === "calendar"} className={view === "calendar" ? "view-tab active" : "view-tab"} onClick={() => setView("calendar")}><CalendarDays size={15}/> Calendar</button>
            <button role="tab" aria-selected={view === "list"} className={view === "list" ? "view-tab active" : "view-tab"} onClick={() => setView("list")}><ArrowDownUp size={15}/> List</button>
          </div>
        </div>

        {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={15}/></button></div>}

        <div className="content-grid">
          <section className="calendar-card" aria-label="Holiday dates">
            <div className="calendar-toolbar">
              <div className="calendar-title"><strong>Holiday season</strong><span className="calendar-year">Nov 2026 — Jan 2027</span></div>
              <div className="calendar-toolbar-actions"><span className="legend"><i /> Time off</span><button className="icon-button" aria-label="Refresh calendar" onClick={() => void loadEntries()}><RefreshCw size={15}/></button></div>
            </div>
            {view === "calendar" ? <>
              <div className="month-sections">
                {MONTHS.map((month) => <section className="month-section" key={`${month.year}-${month.month}`}>
                  <div className="month-heading"><strong>{month.name}</strong><span>{month.year}</span></div>
                  <div className="weekdays">{WEEKDAYS.map((day) => <div key={day}>{day}</div>)}</div>
                  <div className="calendar-weeks">
                    {makeMonthWeeks(month.year, month.month).map((week, weekIndex) => <div className="week-row" key={weekIndex}>
                      {week.map((date, dayIndex) => {
                        if (!date)
                            return <div className="day-cell empty-cell" key={`empty-${weekIndex}-${dayIndex}`} aria-hidden="true"/>;
                        const dayEntries = entriesForDate(date);
                        const isSelected = selectedDate === date;
                        const isWeekend = [0, 6].includes(toDate(date).getUTCDay());
                        const nonWorkLabel = HOLIDAYS[date] || (isWeekend ? "Weekend" : "");
                        return <button key={date} onClick={() => setSelectedDate(date)} className={`day-cell${isSelected ? " selected" : ""}${isWeekend ? " weekend" : ""}${HOLIDAYS[date] ? " holiday" : ""}${date === today ? " today" : ""}`} aria-label={`${fmt(date, { weekday: "long", month: "long", day: "numeric" })}${nonWorkLabel ? `, ${nonWorkLabel}, non-working day` : ""}`} aria-pressed={isSelected}>
                      <span className="day-number">{toDate(date).getUTCDate()}</span>
                      {nonWorkLabel && <span className={`holiday-label${isWeekend && !HOLIDAYS[date] ? " weekend-label" : ""}`} title={`${nonWorkLabel} · non-working day`}>{nonWorkLabel}</span>}
                      {dayEntries.slice(0, 2).map((entry) => <span className="day-event" key={entry.id}><i>{shortName(entry.employee)}</i><span>{entry.employee.split(" ")[0]} <em>· {entry.cover.split(" ")[0]}</em></span></span>)}
                      {dayEntries.length > 2 && <span className="more-events">+{dayEntries.length - 2} more</span>}
                    </button>;
                    })}
                    </div>)}
                  </div>
                </section>)}
              </div>
              <div className="calendar-footnote"><span><i className="legend-dot"/> Team time off</span><span>Coverage shown after the dot on each entry</span></div>
            </> : <div className="list-view">
              {entries.length === 0 ? <EmptyState onAdd={() => openForm()}/> : entries.map((entry) => <button className={`list-entry${selectedDate >= entry.startDate && selectedDate <= entry.endDate ? " list-entry-selected" : ""}`} key={entry.id} onClick={() => setSelectedDate(entry.startDate)}>
                <span className="list-date"><strong>{fmt(entry.startDate, { day: "numeric" })}</strong><small>{fmt(entry.startDate, { month: "short" })}</small></span>
                <span className="list-entry-main"><strong>{entry.employee}</strong><small>{rangeLabel(entry.startDate, entry.endDate)}</small></span>
                <span className="list-cover"><small>COVERED BY</small><strong>{entry.cover}</strong></span>
                <ArrowRight size={16}/>
              </button>)}
            </div>}
            {loading && <div className="loading-strip"><span /> Syncing team calendar…</div>}
          </section>

          <aside className="detail-column">
            <section className="detail-card">
              <div className="detail-date-head"><div><span className="detail-kicker">DAY DETAILS</span><h3>{fmt(selectedDate, { weekday: "long", month: "long", day: "numeric" })}</h3></div><span className="detail-date-number">{toDate(selectedDate).getUTCDate()}</span></div>
              {(HOLIDAYS[selectedDate] || [0, 6].includes(toDate(selectedDate).getUTCDay())) && <div className="holiday-note"><span className="holiday-spark">✳</span><span>{HOLIDAYS[selectedDate] || "Weekend"}<small>Non-working day</small></span></div>}
              <div className="detail-divider"/>
              <div className="detail-list-heading"><strong>Out of office</strong><span>{selectedEntries.length}</span></div>
              {selectedEntries.length ? <div className="absence-list">{selectedEntries.map((entry) => <article className="absence-item" key={entry.id}>
                <span className="person-avatar">{shortName(entry.employee)}</span>
                <div className="absence-info"><strong>{entry.employee}</strong><span>{rangeLabel(entry.startDate, entry.endDate)}</span><div className="coverage-line"><span className="coverage-check"><Check size={11}/></span> Covered by <strong>{entry.cover}</strong></div>{entry.note && <p className="absence-note">“{entry.note}”</p>}</div>
                {currentUser && entry.createdBy === currentUser && <div className="entry-actions"><button className="edit-entry" aria-label={`Edit ${entry.employee}'s time off`} onClick={() => openEdit(entry)}><Pencil size={14}/></button><button className="remove-entry" aria-label={`Remove ${entry.employee}'s time off`} onClick={() => void removeEntry(entry.id)}><Trash2 size={14}/></button></div>}
              </article>)}</div> : <div className="empty-day"><span className="empty-day-icon"><Check size={16}/></span><div><strong>Everyone’s around</strong><p>No time off logged for this day.</p></div></div>}
              <button className="button button-outline add-day-button" onClick={() => openForm(selectedDate)}><Plus size={16}/> Add time off this day</button>
            </section>

            <section className="tip-card"><span className="tip-icon"><CircleHelp size={17}/></span><div><strong>Keep coverage clear</strong><p>Add your coverage partner when you log time off so everyone knows who to reach.</p></div></section>
            <div className="range-caption-card"><span>PLANNING WINDOW</span><strong>Nov 1 — Jan 10</strong><small>Thanksgiving through the week after New Year’s</small></div>
          </aside>
        </div>

        <footer className="page-footer"><span>Holiday coverage planner <i>·</i> 2026–27</span><span>Shared planning for a smoother season</span></footer>
      </div>

      {showForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget)
            setShowForm(false); }}>
        <section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="form-title">
          <div className="modal-header"><div><span className="detail-kicker">TEAM PLANNER</span><h2 id="form-title">{editingEntry ? "Edit time off" : "Add time off"}</h2><p>{editingEntry ? "Update the dates or coverage details." : "Let the team know when you’ll be away."}</p></div><button className="icon-button close-modal" onClick={() => setShowForm(false)} aria-label="Close form"><X size={18}/></button></div>
          <form onSubmit={submitForm}>
            <label className="form-field"><span>Your name <b>*</b></span><select autoFocus required value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })}><option value="" disabled>Select a team member</option>{TEAM_MEMBERS.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <div className="form-dates"><label className="form-field"><span>First day off <b>*</b></span><input type="date" required min={RANGE_START} max={RANGE_END} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })}/></label><label className="form-field"><span>Last day off <b>*</b></span><input type="date" required min={form.startDate} max={RANGE_END} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}/></label></div>
            <label className="form-field"><span>Who’s covering you? <b>*</b></span><select required value={form.cover} onChange={(e) => setForm({ ...form, cover: e.target.value })}><option value="" disabled>Select a coverage partner</option>{TEAM_MEMBERS.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <label className="form-field"><span>Note <small>Optional</small></span><textarea maxLength={240} rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Anything the team should know?"/></label>
            {notice && <p className="form-error" role="alert">{notice}</p>}
            <div className="form-actions"><button type="button" className="button button-quiet" onClick={() => { setShowForm(false); setEditingEntry(null); }}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : <><Check size={16}/> {editingEntry ? "Save changes" : "Save to calendar"}</>}</button></div>
            <p className="form-footnote"><span>*</span> Your dates and coverage will be visible to the team.</p>
          </form>
        </section>
      </div>}
    </main>);
}
function EmptyState({ onAdd }) {
    return <div className="list-empty"><span><CalendarDays size={22}/></span><strong>Nothing planned just yet</strong><p>Be the first to add time off for the season.</p><button className="button button-outline" onClick={onAdd}><Plus size={15}/> Add time off</button></div>;
}

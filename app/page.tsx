"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type WorkspacePage = "agenda" | "schedule" | "report" | "tasks" | "redmine";
type SaveState = "saved" | "saving" | "error";

type MeetingTask = {
  text: string;
  owner: string;
  due: string;
  workTaskId?: number;
};

type Agenda = {
  title: string;
  decideTarget: string;
  note: string;
  decision: string;
  continueThinking: string;
  tasks: MeetingTask[];
};

type Meeting = {
  id: string;
  title: string;
  date: string;
  time: string;
  participants: string;
  agendas: Agenda[];
  participantNotes: Record<string, Record<string, string>>;
  summary: string;
};

type WorkTask = {
  id: number;
  title: string;
  category: string;
  assignee: string;
  status: "未着手" | "作業中" | "確認中" | "完了";
  priority: "高" | "中" | "低";
  due_date: string | null;
  shooting_date: string | null;
  related_url: string;
  notes: string;
  sort_order: number;
  source_meeting_id: string | null;
  source_label: string;
  created_at: string;
  updated_at: string;
};

const navItems: { key: WorkspacePage; label: string; eyebrow: string }[] = [
  { key: "agenda", label: "会議アジェンダ", eyebrow: "MEETING WORKSPACE" },
  { key: "schedule", label: "業務予定", eyebrow: "WORK SCHEDULE" },
  { key: "report", label: "日報", eyebrow: "DAILY REPORT" },
  { key: "tasks", label: "タスク管理", eyebrow: "TASK MANAGEMENT" },
  { key: "redmine", label: "Redmine文章", eyebrow: "REDMINE TEXT MAKER" },
];

const people = ["羽賀", "佐藤", "安田"];
const emptyAgenda = (): Agenda => ({
  title: "",
  decideTarget: "",
  note: "",
  decision: "",
  continueThinking: "",
  tasks: [],
});

function normalizeAgenda(value: unknown): Agenda {
  const raw = (value ?? {}) as Partial<Agenda>;
  return {
    title: typeof raw.title === "string" ? raw.title : "",
    decideTarget: typeof raw.decideTarget === "string" ? raw.decideTarget : "",
    note: typeof raw.note === "string" ? raw.note : "",
    decision: typeof raw.decision === "string" ? raw.decision : "",
    continueThinking: typeof raw.continueThinking === "string" ? raw.continueThinking : "",
    tasks: Array.isArray(raw.tasks)
      ? raw.tasks.map((task) => ({
          text: typeof task?.text === "string" ? task.text : "",
          owner: typeof task?.owner === "string" ? task.owner : "",
          due: typeof task?.due === "string" ? task.due : "",
          ...(Number.isFinite(task?.workTaskId) ? { workTaskId: task.workTaskId } : {}),
        }))
      : [],
  };
}

function normalizeMeeting(row: Record<string, unknown>): Meeting {
  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    date: typeof row.date === "string" ? row.date : "",
    time: typeof row.time === "string" ? row.time : "",
    participants: typeof row.participants === "string" ? row.participants : "",
    agendas: Array.isArray(row.agendas) ? row.agendas.map(normalizeAgenda) : [],
    participantNotes:
      row.participant_notes && typeof row.participant_notes === "object"
        ? (row.participant_notes as Record<string, Record<string, string>>)
        : {},
    summary: typeof row.summary === "string" ? row.summary : "",
  };
}

function initialPage(): WorkspacePage {
  if (typeof window === "undefined") return "agenda";
  const page = new URLSearchParams(window.location.search).get("page");
  return navItems.some((item) => item.key === page) ? (page as WorkspacePage) : "agenda";
}

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function Home() {
  const [page, setPage] = useState<WorkspacePage>("agenda");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState("");
  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const selected = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedId) ?? meetings[0],
    [meetings, selectedId],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const [meetingResult, taskResult] = await Promise.all([
      supabase.from("meetings").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("work_tasks").select("*").order("sort_order").order("created_at", { ascending: false }),
    ]);
    if (meetingResult.error || taskResult.error) {
      setMessage("データを読み込めませんでした。ログイン状態または通信をご確認ください。");
      setSaveState("error");
    } else {
      const normalized = (meetingResult.data ?? []).map((row) => normalizeMeeting(row));
      setMeetings(normalized);
      setSelectedId((current) => normalized.some((item) => item.id === current) ? current : normalized[0]?.id ?? "");
      setTasks((taskResult.data ?? []) as WorkTask[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setPage(initialPage());
    void loadAll();
    return () => timers.current.forEach(clearTimeout);
  }, [loadAll]);

  function switchPage(nextPage: WorkspacePage) {
    setPage(nextPage);
    const url = new URL(window.location.href);
    url.searchParams.set("page", nextPage);
    window.history.replaceState(null, "", url);
  }

  async function persistMeeting(meeting: Meeting) {
    setSaveState("saving");
    const { error } = await supabase
      .from("meetings")
      .update({
        title: meeting.title.trim(),
        date: meeting.date,
        time: meeting.time,
        participants: meeting.participants,
        agendas: meeting.agendas,
        participant_notes: meeting.participantNotes,
        summary: meeting.summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", meeting.id);

    if (error) {
      setSaveState("error");
      setMessage("変更を保存できませんでした。");
      return;
    }

    const linkedTasks = meeting.agendas.flatMap((agenda) => agenda.tasks);
    const results = await Promise.all(
      linkedTasks
        .filter((task) => Number.isFinite(task.workTaskId))
        .map((task) =>
          supabase
            .from("work_tasks")
            .update({
              title: task.text.trim(),
              assignee: people.includes(task.owner) ? task.owner : "",
              due_date: task.due || null,
              source_label: meeting.title.trim(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", task.workTaskId!),
        ),
    );

    if (results.some((result) => result.error)) {
      setSaveState("error");
      setMessage("会議は保存されましたが、一部のToDo連携を更新できませんでした。");
      return;
    }
    setTasks((current) => current.map((task) => {
      const linked = linkedTasks.find((item) => item.workTaskId === task.id);
      return linked
        ? { ...task, title: linked.text, assignee: people.includes(linked.owner) ? linked.owner : "", due_date: linked.due || null, source_label: meeting.title }
        : task;
    }));
    setMessage("");
    setSaveState("saved");
  }

  function updateMeeting(transform: (meeting: Meeting) => Meeting) {
    if (!selected) return;
    const nextMeeting = transform(selected);
    setMeetings((current) => current.map((meeting) => meeting.id === selected.id ? nextMeeting : meeting));
    setSaveState("saving");
    const existing = timers.current.get(selected.id);
    if (existing) clearTimeout(existing);
    timers.current.set(selected.id, setTimeout(() => {
      void persistMeeting(nextMeeting);
    }, 650));
  }

  async function createMeeting(input: { title: string; date: string; time: string; participants: string }) {
    setSaveState("saving");
    const { data, error } = await supabase
      .from("meetings")
      .insert({ ...input, agendas: [emptyAgenda()], participant_notes: {}, summary: "" })
      .select("*")
      .single();
    if (error || !data) {
      setMessage("会議を作成できませんでした。");
      setSaveState("error");
      return;
    }
    const meeting = normalizeMeeting(data);
    setMeetings((current) => [meeting, ...current]);
    setSelectedId(meeting.id);
    setNewMeetingOpen(false);
    setSaveState("saved");
  }

  async function addAgendaTask(agendaIndex: number, draft: MeetingTask) {
    if (!selected || !draft.text.trim()) return;
    setSaveState("saving");
    const agenda = selected.agendas[agendaIndex];
    const { data, error } = await supabase
      .from("work_tasks")
      .insert({
        title: draft.text.trim(),
        category: "その他",
        assignee: people.includes(draft.owner) ? draft.owner : "",
        status: "未着手",
        priority: "中",
        due_date: draft.due || null,
        source_meeting_id: selected.id,
        source_label: selected.title,
        notes: agenda.title ? `会議アジェンダ: ${agenda.title}` : "会議アジェンダ",
      })
      .select("*")
      .single();
    if (error || !data) {
      setMessage("ToDoをタスク管理へ追加できませんでした。");
      setSaveState("error");
      return;
    }
    const linked = { ...draft, text: draft.text.trim(), workTaskId: Number(data.id) };
    setTasks((current) => [data as WorkTask, ...current]);
    updateMeeting((meeting) => ({
      ...meeting,
      agendas: meeting.agendas.map((item, index) => index === agendaIndex ? { ...item, tasks: [...item.tasks, linked] } : item),
    }));
  }

  async function removeAgendaTask(agendaIndex: number, taskIndex: number) {
    if (!selected) return;
    const task = selected.agendas[agendaIndex].tasks[taskIndex];
    if (task.workTaskId) {
      const { error } = await supabase.from("work_tasks").delete().eq("id", task.workTaskId);
      if (error) {
        setMessage("ToDoを削除できませんでした。");
        return;
      }
      setTasks((current) => current.filter((item) => item.id !== task.workTaskId));
    }
    updateMeeting((meeting) => ({
      ...meeting,
      agendas: meeting.agendas.map((agenda, index) => index === agendaIndex
        ? { ...agenda, tasks: agenda.tasks.filter((_, index) => index !== taskIndex) }
        : agenda),
    }));
  }

  async function updateWorkTask(id: number, patch: Partial<WorkTask>) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
    setSaveState("saving");
    const { error } = await supabase.from("work_tasks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      setSaveState("error");
      setMessage("タスクを保存できませんでした。");
      await loadAll();
    } else {
      setSaveState("saved");
    }
  }

  const nav = navItems.find((item) => item.key === page) ?? navItems[0];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div>
            <p className="eyebrow">{nav.eyebrow}</p>
            <h1>{nav.label}</h1>
          </div>
          <nav className="app-nav" aria-label="メインページ切り替え">
            {navItems.map((item) => (
              <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => switchPage(item.key)}>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="top-actions">
          <span className={`save-state ${saveState}`}>{saveState === "saving" ? "保存中…" : saveState === "error" ? "保存できませんでした" : "✓ 保存済み"}</span>
          {page === "agenda" && <button className="primary-button" onClick={() => setNewMeetingOpen(true)}>＋ 新しい会議</button>}
        </div>
      </header>

      {message && <div className="global-message">{message}<button onClick={() => void loadAll()}>再読み込み</button></div>}

      {page === "agenda" && (
        <AgendaWorkspace
          meetings={meetings}
          selected={selected}
          selectedId={selectedId}
          loading={loading}
          onSelect={setSelectedId}
          onUpdate={updateMeeting}
          onAddTask={addAgendaTask}
          onRemoveTask={removeAgendaTask}
        />
      )}

      {page === "tasks" && <TaskWorkspace tasks={tasks} loading={loading} onUpdate={updateWorkTask} />}

      {(page === "schedule" || page === "report" || page === "redmine") && (
        <section className="coming-soon">
          <span>REBUILD IN PROGRESS</span>
          <h2>{nav.label}</h2>
          <p>既存データを保ったまま、この機能を次の実装単位で移行します。</p>
        </section>
      )}

      {newMeetingOpen && <NewMeetingModal onClose={() => setNewMeetingOpen(false)} onSubmit={createMeeting} />}
    </main>
  );
}

function AgendaWorkspace({ meetings, selected, selectedId, loading, onSelect, onUpdate, onAddTask, onRemoveTask }: {
  meetings: Meeting[];
  selected?: Meeting;
  selectedId: string;
  loading: boolean;
  onSelect: (id: string) => void;
  onUpdate: (transform: (meeting: Meeting) => Meeting) => void;
  onAddTask: (agendaIndex: number, task: MeetingTask) => Promise<void>;
  onRemoveTask: (agendaIndex: number, taskIndex: number) => Promise<void>;
}) {
  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="section-heading"><span>会議一覧</span><strong>{meetings.length}</strong></div>
        <div className="meeting-list">
          {meetings.map((meeting) => (
            <button key={meeting.id} className={`meeting-card ${selectedId === meeting.id ? "active" : ""}`} onClick={() => onSelect(meeting.id)}>
              <small>{meeting.date.replaceAll("-", ".")}</small>
              <strong>{meeting.title}</strong>
              <span>{meeting.time || "時間未定"} ・ {meeting.agendas.length}件の議題</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="content">
        {loading && <div className="empty-state">読み込み中…</div>}
        {!loading && !selected && <div className="empty-state">会議を作成してください。</div>}
        {selected && (
          <>
            <div className="meeting-header">
              <div className="meeting-title-block">
                <span className="status-pill">会議メモ</span>
                <input aria-label="会議名" className="meeting-title" value={selected.title} onChange={(event) => onUpdate((meeting) => ({ ...meeting, title: event.target.value }))} />
                <div className="meeting-meta">
                  <label>日付 <input type="date" value={selected.date} onChange={(event) => onUpdate((meeting) => ({ ...meeting, date: event.target.value }))} /></label>
                  <label>時間 <input type="time" value={selected.time} onChange={(event) => onUpdate((meeting) => ({ ...meeting, time: event.target.value }))} /></label>
                </div>
              </div>
              <label className="participants"><span>参加者</span><input value={selected.participants} onChange={(event) => onUpdate((meeting) => ({ ...meeting, participants: event.target.value }))} /></label>
            </div>

            <div className="agenda-heading">
              <div><p className="eyebrow">AGENDA</p><h2>今回の議題</h2></div>
              <button className="secondary-button" onClick={() => onUpdate((meeting) => ({ ...meeting, agendas: [...meeting.agendas, emptyAgenda()] }))}>＋ 議題を追加</button>
            </div>

            <div className="agenda-list">
              {selected.agendas.map((agenda, agendaIndex) => (
                <AgendaCard
                  key={agendaIndex}
                  agenda={agenda}
                  index={agendaIndex}
                  onChange={(patch) => onUpdate((meeting) => ({
                    ...meeting,
                    agendas: meeting.agendas.map((item, index) => index === agendaIndex ? { ...item, ...patch } : item),
                  }))}
                  onAddTask={(task) => onAddTask(agendaIndex, task)}
                  onRemoveTask={(taskIndex) => onRemoveTask(agendaIndex, taskIndex)}
                />
              ))}
            </div>

            <section className="meeting-summary">
              <p className="eyebrow">MEETING SUMMARY</p>
              <h2>会議の要約</h2>
              <p>会議全体の結論や重要なポイントを、最後にまとめて残せます。</p>
              <textarea aria-label="会議の要約" value={selected.summary} placeholder="会議全体の要約を入力" onChange={(event) => onUpdate((meeting) => ({ ...meeting, summary: event.target.value }))} />
            </section>
          </>
        )}
      </section>
    </div>
  );
}

function AgendaCard({ agenda, index, onChange, onAddTask, onRemoveTask }: {
  agenda: Agenda;
  index: number;
  onChange: (patch: Partial<Agenda>) => void;
  onAddTask: (task: MeetingTask) => Promise<void>;
  onRemoveTask: (taskIndex: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<MeetingTask>({ text: "", owner: "", due: "" });
  const [adding, setAdding] = useState(false);

  function updateTask(taskIndex: number, patch: Partial<MeetingTask>) {
    onChange({ tasks: agenda.tasks.map((task, index) => index === taskIndex ? { ...task, ...patch } : task) });
  }

  async function addTask() {
    if (!draft.text.trim() || adding) return;
    setAdding(true);
    await onAddTask(draft);
    setDraft({ text: "", owner: "", due: "" });
    setAdding(false);
  }

  return (
    <article className="agenda-card">
      <div className="agenda-number">{String(index + 1).padStart(2, "0")}</div>
      <div className="agenda-body">
        <input className="agenda-title" value={agenda.title} placeholder="議題のタイトルを入力" onChange={(event) => onChange({ title: event.target.value })} />
        <Field label="今回決定すること" tone="target" value={agenda.decideTarget} onChange={(value) => onChange({ decideTarget: value })} />
        <Field label="共有・議論メモ" value={agenda.note} onChange={(value) => onChange({ note: value })} />
        <Field label="決定事項" tone="decision" value={agenda.decision} onChange={(value) => onChange({ decision: value })} />
        <Field label="引き続き考えること" tone="continue" value={agenda.continueThinking} onChange={(value) => onChange({ continueThinking: value })} />
        <div className="task-area">
          <strong>ToDo</strong>
          {agenda.tasks.map((task, taskIndex) => (
            <div className="task-row saved" key={`${task.workTaskId ?? "new"}-${taskIndex}`}>
              <span>✓</span>
              <input aria-label="タスク内容" value={task.text} onChange={(event) => updateTask(taskIndex, { text: event.target.value })} />
              <input aria-label="担当者" value={task.owner} onChange={(event) => updateTask(taskIndex, { owner: event.target.value })} />
              <input aria-label="期限" type="date" value={task.due} onChange={(event) => updateTask(taskIndex, { due: event.target.value })} />
              <button aria-label="ToDoを削除" onClick={() => void onRemoveTask(taskIndex)}>×</button>
            </div>
          ))}
          <div className="task-row">
            <input placeholder="タスク内容" value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} />
            <input placeholder="担当者" value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
            <input type="date" aria-label="新しいToDoの期限" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} />
            <button disabled={adding} onClick={() => void addTask()}>{adding ? "追加中" : "追加"}</button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Field({ label, value, tone = "", onChange }: { label: string; value: string; tone?: string; onChange: (value: string) => void }) {
  return <label className={`field ${tone}`}><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TaskWorkspace({ tasks, loading, onUpdate }: { tasks: WorkTask[]; loading: boolean; onUpdate: (id: number, patch: Partial<WorkTask>) => Promise<void> }) {
  const [person, setPerson] = useState("全員");
  const [status, setStatus] = useState("すべて");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => tasks.filter((task) =>
    (person === "全員" || task.assignee === person) &&
    (status === "すべて" || task.status === status) &&
    (!query || `${task.title} ${task.source_label} ${task.notes}`.toLowerCase().includes(query.toLowerCase())),
  ), [tasks, person, status, query]);
  const counts = useMemo(() => ({
    all: tasks.length,
    open: tasks.filter((task) => task.status !== "完了").length,
    done: tasks.filter((task) => task.status === "完了").length,
  }), [tasks]);

  return (
    <section className="task-workspace">
      <div className="task-heading">
        <div><p className="eyebrow">TASK MANAGEMENT</p><h2>タスク管理</h2><p>会議のToDoを含む、すべての業務タスクを管理します。</p></div>
        <div className="task-stats"><span><strong>{counts.all}</strong>すべて</span><span><strong>{counts.open}</strong>未完了</span><span><strong>{counts.done}</strong>完了</span></div>
      </div>
      <div className="person-tabs">{["全員", ...people].map((item) => <button key={item} className={person === item ? "active" : ""} onClick={() => setPerson(item)}>{item}</button>)}</div>
      <div className="task-toolbar">
        <input aria-label="タスク検索" placeholder="タスクを検索" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option>すべて</option><option>未着手</option><option>作業中</option><option>確認中</option><option>完了</option></select>
        <span>{visible.length}件</span>
      </div>
      {loading && <div className="empty-state">読み込み中…</div>}
      <div className="managed-task-list">
        {visible.map((task) => (
          <ManagedTaskCard key={task.id} task={task} onUpdate={onUpdate} />
        ))}
      </div>
    </section>
  );
}

function ManagedTaskCard({ task, onUpdate }: { task: WorkTask; onUpdate: (id: number, patch: Partial<WorkTask>) => Promise<void> }) {
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState(task.category);
  useEffect(() => setTitle(task.title), [task.title]);
  useEffect(() => setCategory(task.category), [task.category]);

  return (
    <article className={`managed-task status-${task.status}`}>
      <div className="task-accent" />
      <div className="managed-task-main">
        <div className="managed-task-top">
          <select aria-label="状態" value={task.status} onChange={(event) => void onUpdate(task.id, { status: event.target.value as WorkTask["status"] })}><option>未着手</option><option>作業中</option><option>確認中</option><option>完了</option></select>
          <select aria-label="優先度" value={task.priority} onChange={(event) => void onUpdate(task.id, { priority: event.target.value as WorkTask["priority"] })}><option>高</option><option>中</option><option>低</option></select>
          {task.source_meeting_id ? <span className="meeting-source">会議ToDo</span> : null}
        </div>
        <input aria-label="タスク名" className="managed-task-title" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => title !== task.title && void onUpdate(task.id, { title })} />
        <div className="managed-fields">
          <label><span>担当者</span><select value={task.assignee} onChange={(event) => void onUpdate(task.id, { assignee: event.target.value })}><option value="">未定</option>{people.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>期限</span><input type="date" value={task.due_date ?? ""} onChange={(event) => void onUpdate(task.id, { due_date: event.target.value || null })} /></label>
          <label><span>分類</span><input value={category} onChange={(event) => setCategory(event.target.value)} onBlur={() => category !== task.category && void onUpdate(task.id, { category })} /></label>
          <label><span>元データ</span><input value={task.source_label} disabled /></label>
        </div>
      </div>
    </article>
  );
}

function NewMeetingModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: { title: string; date: string; time: string; participants: string }) => Promise<void> }) {
  const [form, setForm] = useState({ title: "", date: today(), time: "", participants: "" });
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.date || busy) return;
    setBusy(true);
    await onSubmit({ ...form, title: form.title.trim(), participants: form.participants.trim() });
    setBusy(false);
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading"><div><p className="eyebrow">NEW MEETING</p><h2>新しい会議を作成</h2></div><button type="button" onClick={onClose}>×</button></div>
        <label><span>会議名</span><input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <div className="form-grid"><label><span>日付</span><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label><span>時間</span><input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label></div>
        <label><span>参加者</span><input placeholder="例：羽賀・佐藤・安田" value={form.participants} onChange={(event) => setForm({ ...form, participants: event.target.value })} /></label>
        <button className="primary-button full" disabled={busy}>{busy ? "作成中…" : "会議を作成する"}</button>
      </form>
    </div>
  );
}

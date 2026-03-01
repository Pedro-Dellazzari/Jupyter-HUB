import { useState, useEffect } from "react";
import { Plus, Trash2, Video, MapPin, Users as UsersIcon } from "lucide-react";
import { db, type Meeting, type MeetingInput } from "../lib/db";

export function MeetingsPanel() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("upcoming");

  const emptyForm: MeetingInput = {
    title: "", date: "", time: "", duration: 60,
    participants: [], location: "", type: "virtual", link: "", notes: "",
  };
  const [newMeeting, setNewMeeting] = useState<MeetingInput & { participantsText: string }>({
    ...emptyForm,
    participantsText: "",
  });

  useEffect(() => {
    db.meetings.list().then(setMeetings);
  }, []);

  const addMeeting = async () => {
    if (!newMeeting.title.trim() || !newMeeting.date || !newMeeting.time) return;

    const participants = newMeeting.participantsText
      .split(",")
      .map(p => p.trim())
      .filter(Boolean);

    const meeting = await db.meetings.add({ ...newMeeting, participants });
    setMeetings(prev => [meeting, ...prev]);
    setShowAddModal(false);
    setNewMeeting({ ...emptyForm, participantsText: "" });
  };

  const deleteMeeting = async (id: string) => {
    await db.meetings.delete(id);
    setMeetings(prev => prev.filter(m => m.id !== id));
  };

  const getMeetingDate = (m: Meeting) => new Date(m.start_at.replace(" ", "T"));

  const filterMeetings = () => {
    const now = new Date();
    const sorted = [...meetings].sort(
      (a, b) => getMeetingDate(a).getTime() - getMeetingDate(b).getTime()
    );
    if (filter === "all") return sorted;
    return sorted.filter(m =>
      filter === "upcoming" ? getMeetingDate(m) >= now : getMeetingDate(m) < now
    );
  };

  const getStatus = (m: Meeting) => getMeetingDate(m) >= new Date() ? "upcoming" : "past";

  const formatDateTime = (m: Meeting) => {
    const d = getMeetingDate(m);
    return {
      date: d.toLocaleDateString(),
      time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  };

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-green-600 mb-2">$ meetings</h2>
            <p className="text-sm text-slate-500">
              Total: {meetings.length} | Upcoming:{" "}
              {meetings.filter(m => getMeetingDate(m) > new Date()).length}
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-green-500 rounded-xl text-white hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Meeting
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          {(["all", "upcoming", "past"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm transition-all duration-300 transform hover:scale-105 ${
                filter === f
                  ? "bg-green-100 border border-green-300 text-green-700 font-medium shadow-lg shadow-green-500/20"
                  : "bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-green-300"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {filterMeetings().length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center shadow-lg">
              <p className="text-slate-500">No {filter !== "all" ? filter : ""} meetings found.</p>
            </div>
          ) : (
            filterMeetings().map(meeting => {
              const status = getStatus(meeting);
              const { date, time } = formatDateTime(meeting);
              const isVirtual = meeting.location_type === "online";

              return (
                <div
                  key={meeting.id}
                  className={`bg-white border border-slate-200 rounded-2xl p-4 shadow-lg transition-all duration-300 hover:scale-[1.01] hover:shadow-xl hover:border-green-300 ${
                    status === "past" ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-slate-900 font-medium">{meeting.title}</h3>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          status === "upcoming"
                            ? "bg-green-100 text-green-700 border border-green-300"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}>
                          {status}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          isVirtual
                            ? "bg-blue-100 text-blue-700 border border-blue-300"
                            : "bg-yellow-100 text-yellow-700 border border-yellow-300"
                        }`}>
                          {isVirtual ? "Virtual" : "In-Person"}
                        </span>
                      </div>

                      <div className="space-y-2 text-sm text-slate-700">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">📅</span>
                          <span>{date} at {time}</span>
                        </div>

                        {meeting.participants.length > 0 && (
                          <div className="flex items-center gap-2">
                            <UsersIcon className="w-4 h-4 text-slate-500" />
                            <span>{meeting.participants.join(", ")}</span>
                          </div>
                        )}

                        {meeting.location && (
                          <div className="flex items-center gap-2">
                            {isVirtual
                              ? <Video className="w-4 h-4 text-slate-500" />
                              : <MapPin className="w-4 h-4 text-slate-500" />}
                            <span>{meeting.location}</span>
                          </div>
                        )}

                        {meeting.meeting_url && (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">🔗</span>
                            <a
                              href={meeting.meeting_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:underline"
                            >
                              {meeting.meeting_url}
                            </a>
                          </div>
                        )}

                        {meeting.notes && (
                          <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <span className="text-slate-600 text-xs font-medium">Notes:</span>
                            <p className="text-slate-700 mt-1">{meeting.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => deleteMeeting(meeting.id)}
                      className="text-red-400 hover:text-red-600 transition-all duration-300 transform hover:scale-110 ml-4"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-auto shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-lg font-bold text-green-600 mb-4">$ meetings --add</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-600 font-medium block mb-2">Title *</label>
                  <input
                    type="text"
                    value={newMeeting.title}
                    onChange={e => setNewMeeting({ ...newMeeting, title: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 font-mono transition-all duration-300"
                    placeholder="Meeting title..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-600 font-medium block mb-2">Date *</label>
                    <input
                      type="date"
                      value={newMeeting.date}
                      onChange={e => setNewMeeting({ ...newMeeting, date: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 font-mono transition-all duration-300"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-600 font-medium block mb-2">Time *</label>
                    <input
                      type="time"
                      value={newMeeting.time}
                      onChange={e => setNewMeeting({ ...newMeeting, time: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 font-mono transition-all duration-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-600 font-medium block mb-2">Duration (min)</label>
                    <input
                      type="number"
                      value={newMeeting.duration}
                      onChange={e => setNewMeeting({ ...newMeeting, duration: parseInt(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 font-mono transition-all duration-300"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-slate-600 font-medium block mb-2">Type</label>
                    <select
                      value={newMeeting.type}
                      onChange={e => setNewMeeting({ ...newMeeting, type: e.target.value as "in-person" | "virtual" })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 font-mono transition-all duration-300"
                    >
                      <option value="virtual">Virtual</option>
                      <option value="in-person">In-Person</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-600 font-medium block mb-2">Participants (comma-separated)</label>
                  <input
                    type="text"
                    value={newMeeting.participantsText}
                    onChange={e => setNewMeeting({ ...newMeeting, participantsText: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 font-mono transition-all duration-300"
                    placeholder="john@example.com, jane@example.com"
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-600 font-medium block mb-2">
                    {newMeeting.type === "virtual" ? "Meeting Link" : "Location"}
                  </label>
                  <input
                    type="text"
                    value={newMeeting.location}
                    onChange={e => setNewMeeting({ ...newMeeting, location: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 font-mono transition-all duration-300"
                    placeholder={newMeeting.type === "virtual" ? "Zoom/Meet link..." : "Conference Room A..."}
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-600 font-medium block mb-2">Notes</label>
                  <textarea
                    value={newMeeting.notes}
                    onChange={e => setNewMeeting({ ...newMeeting, notes: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 font-mono resize-none transition-all duration-300"
                    rows={3}
                    placeholder="Meeting agenda, notes..."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={addMeeting}
                  className="flex-1 px-4 py-2 bg-green-500 rounded-xl text-white hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 transform hover:scale-105 active:scale-95"
                >
                  Add Meeting
                </button>
                <button
                  onClick={() => { setShowAddModal(false); setNewMeeting({ ...emptyForm, participantsText: "" }); }}
                  className="flex-1 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-all duration-300 transform hover:scale-105 active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

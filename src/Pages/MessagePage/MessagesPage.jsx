import React, { useEffect, useState, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import TopNavAdmin from "../../Components/Navigation/TopNavAdmin";
import { useAuth } from "../../Components/ServiceLayer/Context/authContext";
import { socket } from "../../Components/Hooks/socket";

const TYPING_TIMEOUT_MS = 2000;
let adminTypingTimeout = null;

function getInitials(firstName, lastName) {
  const f = (firstName || "").trim();
  const l = (lastName || "").trim();
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  if (f) return f[0].toUpperCase();
  return "?";
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-pink-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-rose-500",
];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Sorts conversations: unread first, then by most recent message
function sortConversations(convList, counts) {
  return [...convList].sort((a, b) => {
    const unreadA = counts[a.conversation_id] ?? 0;
    const unreadB = counts[b.conversation_id] ?? 0;
    if (unreadB !== unreadA) return unreadB - unreadA;
    const timeA = new Date(a.last_message_at || 0).getTime();
    const timeB = new Date(b.last_message_at || 0).getTime();
    return timeB - timeA;
  });
}

function MessagesPage() {
  const { apiClient, logout, user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  const [displayOrder, setDisplayOrder] = useState([]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    fetchConversations();
  }, [apiClient, user]);

  // Listen for presence events from socket
  useEffect(() => {
    socket.on("user_online", (data) => {
      setOnlineUsers((prev) => new Set([...prev, data.user_id]));
    });
    socket.on("user_offline", (data) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(data.user_id);
        return next;
      });
    });
    socket.on("online_users", (userIds) => {
      setOnlineUsers(new Set(userIds));
    });
    return () => {
      socket.off("user_online");
      socket.off("user_offline");
      socket.off("online_users");
    };
  }, []);

  const fetchConversations = async () => {
    try {
      setLoadingConversations(true);
      const res = await apiClient.get("/conversations").catch((e) => {
        throw e;
      });
      const convList = Array.isArray(res.data) ? res.data : [];
      setConversations(convList);

      const initial = {};
      convList.forEach((c) => {
        initial[c.conversation_id] = c.unread_count ?? 0;
      });
      setUnreadCounts(initial);

      setDisplayOrder(sortConversations(convList, initial));

      convList.forEach((c) => {
        socket.emit("join_conversation", c.conversation_id);
      });
    } catch (err) {
      console.error("Fetch conversations error:", err);
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  };

  // FIX: fetchMessages no longer clears the badge itself.
  // Badge is cleared here only after /read succeeds, preventing
  // the conversation from being prematurely marked as read.
  const fetchMessages = async (conversationId) => {
    try {
      setLoadingMessages(true);
      const res = await apiClient.get(
        `/conversations/${conversationId}/messages`,
      );
      setMessages(Array.isArray(res.data) ? res.data : []);

      // Only mark read + clear badge after the POST succeeds
      await apiClient.post(`/conversations/${conversationId}/read`);

      setMessages((prev) =>
        prev.map((m) =>
          m.sender_id !== user?.user_id ? { ...m, is_read: 1 } : m,
        ),
      );

      // FIX: Clear badge here (after confirmed read) instead of in
      // handleSelectConversation so the unread highlight is visible
      // until the admin actually opens the conversation.
      setUnreadCounts((prev) => ({ ...prev, [conversationId]: 0 }));
    } catch (err) {
      console.error("Fetch messages error:", err);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Stable handler via useCallback so the same function reference is
  // always passed to socket.on/off, preventing listener stacking.
  const handleNewMessage = useCallback(
    (msg) => {
      const role = (msg.sender_role || "").toLowerCase();
      const isFromUser = role === "pet owner";

      setSelectedConversation((currentSelected) => {
        if (currentSelected?.conversation_id === msg.conversation_id) {
          // Conversation is open — append message
          if (isFromUser) {
            // Mark read immediately since chat is open
            apiClient
              .post(`/conversations/${msg.conversation_id}/read`)
              .catch(() => {});
          }
          setMessages((prev) => {
            const exists = prev.some((m) => m.message_id === msg.message_id);
            return exists
              ? prev
              : [...prev, isFromUser ? { ...msg, is_read: 1 } : msg];
          });
          return currentSelected;
        }

        // Conversation is NOT open — only badge-up incoming user messages
        if (!isFromUser) return currentSelected;

        setUnreadCounts((prevCounts) => {
          const nextCounts = {
            ...prevCounts,
            [msg.conversation_id]: (prevCounts[msg.conversation_id] ?? 0) + 1,
          };

          setConversations((prevConvs) => {
            const updated = prevConvs.map((c) =>
              c.conversation_id === msg.conversation_id
                ? {
                    ...c,
                    last_message_preview: msg.content,
                    last_message_at: msg.created_at,
                  }
                : c,
            );
            setDisplayOrder(sortConversations(updated, nextCounts));
            return updated;
          });

          return nextCounts;
        });

        return currentSelected;
      });
    },
    [apiClient],
  );

  // Global socket: handle new messages from users.
  // Uses the stable handleNewMessage ref so cleanup reliably removes
  // the correct listener and never stacks duplicates.
  useEffect(() => {
    if (!user) return;
    socket.on("new_message", handleNewMessage);
    return () => socket.off("new_message", handleNewMessage);
  }, [user, handleNewMessage]);

  const handleSelectConversation = (conv) => {
    // Keep display order stable — don't re-sort on selection
    setDisplayOrder((prev) => [...prev]);

    setSelectedConversation(conv);

    // FIX: No longer clearing unreadCounts here.
    // It is now cleared inside fetchMessages after /read succeeds,
    // so the sidebar badge stays visible until the admin opens the chat.
    fetchMessages(conv.conversation_id);

    socket.emit("join_conversation", conv.conversation_id);
    socket.off("typing");
    socket.off("stop_typing");
    socket.off("messages_read");

    socket.on("typing", (data) => {
      if (data.conversationId !== conv.conversation_id) return;
      if (data.sender_role === "pet owner") setIsUserTyping(true);
    });
    socket.on("stop_typing", (data) => {
      if (data.conversationId !== conv.conversation_id) return;
      if (data.sender_role === "pet owner") setIsUserTyping(false);
    });
    socket.on("messages_read", (data) => {
      if (data.conversationId !== conv.conversation_id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.sender_id === user?.user_id ? { ...m, is_read: 1 } : m,
        ),
      );
    });

    setTimeout(() => inputRef.current?.focus(), 100);
  };

  useEffect(() => {
    return () => {
      socket.off("new_message");
      socket.off("typing");
      socket.off("stop_typing");
      socket.off("messages_read");
    };
  }, []);

  const handleAdminInputChange = (e) => {
    setNewMessage(e.target.value);
    if (!selectedConversation) return;
    socket.emit("typing", {
      conversationId: selectedConversation.conversation_id,
      sender_role: "admin",
    });
    if (adminTypingTimeout) clearTimeout(adminTypingTimeout);
    adminTypingTimeout = setTimeout(() => {
      socket.emit("stop_typing", {
        conversationId: selectedConversation.conversation_id,
        sender_role: "admin",
      });
    }, TYPING_TIMEOUT_MS);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;
    const content = newMessage.trim();
    setNewMessage("");
    try {
      await apiClient.post(
        `/conversations/${selectedConversation.conversation_id}/messages`,
        { content },
      );
    } catch (err) {
      console.error("Send message error:", err);
    }
  };

  const getLastAdminMessageId = () => {
    const adminMessages = messages.filter(
      (m) => m.sender_role === "admin" || m.sender_id === user?.user_id,
    );
    if (adminMessages.length === 0) return null;
    return adminMessages[adminMessages.length - 1].message_id;
  };
  const lastAdminMessageId = getLastAdminMessageId();

  const convMap = Object.fromEntries(
    conversations.map((c) => [c.conversation_id, c]),
  );
  const orderedConversations = displayOrder
    .map((c) => convMap[c.conversation_id] || c)
    .filter((c) => {
      if (!searchQuery.trim()) return true;
      const name = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
      return name.includes(searchQuery.toLowerCase());
    });

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  if (loadingConversations) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
        <div className="flex flex-col items-center gap-6 p-8">
          <div className="w-20 h-20 bg-[#7c5e3b]/20 rounded-2xl flex items-center justify-center">
            <Loader2 className="h-16 w-16 text-[#7c5e3b] animate-spin" />
          </div>
          <div className="text-xl font-bold text-[#7c5e3b]">
            Loading conversations...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-screen-2xl mx-auto">
        <TopNavAdmin handleSignOut={logout} />

        <div className="px-4 py-4" style={{ height: "calc(100vh - 64px)" }}>
          <div className="flex h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {/* ── LEFT SIDEBAR ── */}
            <div className="w-80 flex-shrink-0 flex flex-col border-r border-gray-200">
              {/* Header */}
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-center justify-between mb-4">
                  <h1 className="text-2xl font-bold text-gray-900">Chats</h1>
                  {totalUnread > 0 && (
                    <span className="min-w-6 h-6 px-2 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                  )}
                </div>
                {/* Search bar */}
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search Messenger"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-gray-100 rounded-full pl-9 pr-4 py-2 text-sm text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-300/50 transition"
                  />
                </div>
              </div>

              {/* Conversation list */}
              <div className="flex-1 overflow-y-auto py-1">
                {orderedConversations.length === 0 ? (
                  <div className="p-6 text-sm text-gray-400 text-center">
                    No conversations found.
                  </div>
                ) : (
                  orderedConversations.map((c) => {
                    const fullName =
                      `${c.first_name || ""} ${c.last_name || ""}`.trim();
                    const displayName = fullName || `User #${c.user_id}`;
                    const initials = getInitials(c.first_name, c.last_name);
                    const isActive =
                      selectedConversation?.conversation_id ===
                      c.conversation_id;
                    const unread = unreadCounts[c.conversation_id] ?? 0;
                    const color = avatarColor(displayName);
                    const isOnline = onlineUsers.has(c.user_id);

                    return (
                      <button
                        key={c.conversation_id}
                        onClick={() => handleSelectConversation(c)}
                        className={`w-full flex items-center gap-3 px-3 py-2 mx-1 rounded-xl transition-colors text-left
                          ${isActive ? "bg-blue-50" : "hover:bg-gray-100"}
                        `}
                        style={{ width: "calc(100% - 8px)" }}
                      >
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          <div
                            className={`w-12 h-12 rounded-full ${color} flex items-center justify-center text-white font-semibold text-sm shadow-sm`}
                          >
                            {initials}
                          </div>
                          {isOnline && (
                            <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full" />
                          )}
                        </div>

                        {/* Name + preview */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-1">
                            <span
                              className={`text-sm truncate ${
                                unread > 0
                                  ? "font-bold text-gray-900"
                                  : "font-medium text-gray-700"
                              }`}
                            >
                              {displayName}
                            </span>
                            <span
                              className={`text-[11px] flex-shrink-0 ${
                                unread > 0
                                  ? "text-blue-500 font-semibold"
                                  : "text-gray-400"
                              }`}
                            >
                              {formatTime(c.last_message_at)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-1 mt-0.5">
                            <p
                              className={`text-xs truncate ${
                                unread > 0
                                  ? "font-semibold text-gray-900"
                                  : "text-gray-500"
                              }`}
                            >
                              {c.last_message_preview || "No messages yet"}
                            </p>
                            {unread > 0 && (
                              <span className="flex-shrink-0 min-w-5 h-5 px-1 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                {unread > 9 ? "9+" : unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── RIGHT CHAT PANEL ── */}
            <div className="flex-1 flex flex-col min-w-0">
              {selectedConversation ? (
                <>
                  {/* Chat header */}
                  <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3 bg-white">
                    {(() => {
                      const name =
                        `${selectedConversation.first_name || ""} ${selectedConversation.last_name || ""}`.trim() ||
                        `User #${selectedConversation.user_id}`;
                      const initials = getInitials(
                        selectedConversation.first_name,
                        selectedConversation.last_name,
                      );
                      const color = avatarColor(name);
                      const isOnline = onlineUsers.has(
                        selectedConversation.user_id,
                      );
                      return (
                        <>
                          <div className="relative">
                            <div
                              className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white font-semibold text-sm`}
                            >
                              {initials}
                            </div>
                            {isOnline && (
                              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-white rounded-full" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm leading-tight">
                              {name}
                            </p>
                            {isOnline && (
                              <p className="text-xs text-green-500 font-medium">
                                Active now
                              </p>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Messages area */}
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1 bg-white">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                        {(() => {
                          const name =
                            `${selectedConversation.first_name || ""} ${selectedConversation.last_name || ""}`.trim();
                          const initials = getInitials(
                            selectedConversation.first_name,
                            selectedConversation.last_name,
                          );
                          const color = avatarColor(name || "User");
                          return (
                            <>
                              <div
                                className={`w-16 h-16 rounded-full ${color} flex items-center justify-center text-white font-bold text-xl`}
                              >
                                {initials}
                              </div>
                              <p className="font-semibold text-gray-800">
                                {name ||
                                  `User #${selectedConversation.user_id}`}
                              </p>
                              <p className="text-sm text-gray-400">
                                No messages yet. Say hello! 👋
                              </p>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      (() => {
                        let lastDate = null;
                        return messages.map((m) => {
                          const isAdmin =
                            m.sender_role === "admin" ||
                            m.sender_id === user?.user_id;
                          const isLastAdmin =
                            isAdmin && m.message_id === lastAdminMessageId;
                          const msgDate = m.created_at
                            ? new Date(m.created_at).toDateString()
                            : null;
                          const showDateDivider =
                            msgDate && msgDate !== lastDate;
                          if (showDateDivider) lastDate = msgDate;

                          return (
                            <React.Fragment key={m.message_id}>
                              {showDateDivider && (
                                <div className="flex items-center gap-3 my-4">
                                  <div className="flex-1 h-px bg-gray-100" />
                                  <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap">
                                    {new Date(m.created_at).toLocaleDateString(
                                      [],
                                      {
                                        weekday: "long",
                                        month: "short",
                                        day: "numeric",
                                      },
                                    )}
                                  </span>
                                  <div className="flex-1 h-px bg-gray-100" />
                                </div>
                              )}

                              <div
                                className={`flex items-end gap-2 ${
                                  isAdmin ? "justify-end" : "justify-start"
                                }`}
                              >
                                {!isAdmin &&
                                  (() => {
                                    const name =
                                      `${selectedConversation.first_name || ""} ${selectedConversation.last_name || ""}`.trim();
                                    const initials = getInitials(
                                      selectedConversation.first_name,
                                      selectedConversation.last_name,
                                    );
                                    const color = avatarColor(name || "User");
                                    return (
                                      <div
                                        className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 mb-1`}
                                      >
                                        {initials}
                                      </div>
                                    );
                                  })()}

                                <div className="flex flex-col max-w-xs lg:max-w-md">
                                  <div
                                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                      isAdmin
                                        ? "bg-blue-500 text-white rounded-br-sm"
                                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                                    }`}
                                  >
                                    {m.content}
                                  </div>
                                  {isLastAdmin && (
                                    <span className="text-[10px] mt-1 text-gray-400 text-right flex items-center justify-end gap-0.5">
                                      {m.is_read ? (
                                        <>
                                          <svg
                                            className="w-3 h-3 text-blue-400"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                          >
                                            <path
                                              fillRule="evenodd"
                                              d="M16.707 5.293a1 1 0 010 1.414L8.414 15 3.293 9.879a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z"
                                              clipRule="evenodd"
                                            />
                                          </svg>
                                          Seen
                                        </>
                                      ) : (
                                        "Sent"
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </React.Fragment>
                          );
                        });
                      })()
                    )}

                    {/* Typing indicator */}
                    {isUserTyping && (
                      <div className="flex items-end gap-2">
                        {(() => {
                          const name =
                            `${selectedConversation.first_name || ""} ${selectedConversation.last_name || ""}`.trim();
                          const color = avatarColor(name || "User");
                          const initials = getInitials(
                            selectedConversation.first_name,
                            selectedConversation.last_name,
                          );
                          return (
                            <div
                              className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0`}
                            >
                              {initials}
                            </div>
                          );
                        })()}
                        <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                          <span
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0ms" }}
                          />
                          <span
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "150ms" }}
                          />
                          <span
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "300ms" }}
                          />
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input bar */}
                  <div className="px-4 py-3 border-t border-gray-200 bg-white">
                    <form
                      onSubmit={handleSend}
                      className="flex items-center gap-2"
                    >
                      <input
                        ref={inputRef}
                        type="text"
                        value={newMessage}
                        onChange={handleAdminInputChange}
                        placeholder="Aa"
                        className="flex-1 bg-gray-100 rounded-full px-5 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-300/50 transition"
                      />
                      <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                          newMessage.trim()
                            ? "bg-blue-500 hover:bg-blue-600 text-white shadow-sm active:scale-95"
                            : "bg-gray-100 text-gray-400 cursor-default"
                        }`}
                      >
                        <svg
                          className="w-4 h-4 translate-x-0.5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                        </svg>
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                    <svg
                      className="w-10 h-10 text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-lg">
                      Your Messages
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      Select a conversation to start chatting
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MessagesPage;

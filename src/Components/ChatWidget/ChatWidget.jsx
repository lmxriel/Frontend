import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../../Components/ServiceLayer/Context/authContext";
import { socket } from "../Hooks/socket";

const TYPING_TIMEOUT_MS = 2000;
let userTypingTimeout = null;

function ChatWidget() {
  const { apiClient, user } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isAdminTyping, setIsAdminTyping] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const messagesEndRef = useRef(null);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  // ---------------- INIT ----------------
  useEffect(() => {
    if (!user) return;

    const init = async () => {
      try {
        const convRes = await apiClient.get("/conversations/me");
        const conv = convRes.data;

        setConversation(conv);
        socket.emit("join_conversation", conv.conversation_id);

        const msgRes = await apiClient.get(
          `/conversations/${conv.conversation_id}/messages`
        );

        const msgs = msgRes.data || [];
        setMessages(msgs);

        const unread = msgs.filter(
          (m) =>
            (m.sender_role || "").toLowerCase() === "admin" && !m.is_read
        ).length;

        if (unread > 0) {
          setHasUnreadMessages(true);
          setUnreadCount(unread);
        }
      } catch (e) {
        console.error("Init error:", e);
      }
    };

    init();

    return () => {
      socket.off("new_message");
      socket.off("typing");
      socket.off("stop_typing");
      socket.off("messages_read");
    };
  }, [apiClient, user]);

  // ---------------- LOAD + MARK READ ----------------
  useEffect(() => {
    if (!isOpen || !conversation || !user) return;

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const msgRes = await apiClient.get(
          `/conversations/${conversation.conversation_id}/messages`
        );

        if (cancelled) return;

        setMessages(msgRes.data || []);

        // MARK AS READ (backend only — IMPORTANT FIX)
        await apiClient.post(
          `/conversations/${conversation.conversation_id}/read`
        );

        if (cancelled) return;

        setHasUnreadMessages(false);
        setUnreadCount(0);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, conversation, apiClient, user]);

  // ---------------- SOCKETS ----------------
  useEffect(() => {
    if (!conversation || !user) return;

    socket.off("new_message");
    socket.off("typing");
    socket.off("stop_typing");
    socket.off("messages_read");

    socket.on("new_message", (msg) => {
      if (msg.conversation_id !== conversation.conversation_id) return;

      const role = (msg.sender_role || "").toLowerCase();
      const isAdminSender = role === "admin";

      setMessages((prev) => {
        const exists = prev.some((m) => m.message_id === msg.message_id);
        return exists ? prev : [...prev, msg];
      });

      if (!isOpenRef.current && isAdminSender) {
        setHasUnreadMessages(true);
        setUnreadCount((c) => c + 1);
      }
    });

    socket.on("typing", (data) => {
      if (data.conversationId !== conversation.conversation_id) return;
      if ((data.sender_role || "").toLowerCase() === "admin") {
        setIsAdminTyping(true);
      }
    });

    socket.on("stop_typing", (data) => {
      if (data.conversationId !== conversation.conversation_id) return;
      if ((data.sender_role || "").toLowerCase() === "admin") {
        setIsAdminTyping(false);
      }
    });

    socket.on("messages_read", (data) => {
      if (data.conversationId !== conversation.conversation_id) return;

      setMessages((prev) =>
        prev.map((m) =>
          m.sender_id !== user.user_id ? { ...m, is_read: 1 } : m
        )
      );
    });

    return () => {
      socket.off("new_message");
      socket.off("typing");
      socket.off("stop_typing");
      socket.off("messages_read");
    };
  }, [conversation, user]);

  // ---------------- HELPERS ----------------
  const getLastUserMessageId = () => {
    const userMsgs = messages.filter((m) => {
      const role = (m.sender_role || "").toLowerCase();
      return role === "pet owner" || m.sender_id === user?.user_id;
    });

    return userMsgs.length
      ? userMsgs[userMsgs.length - 1].message_id
      : null;
  };

  const lastUserMessageId = getLastUserMessageId();

  // ---------------- INPUT ----------------
  const handleUserInputChange = (e) => {
    const value = e.target.value;
    setNewMessage(value);

    if (!conversation) return;

    socket.emit("typing", {
      conversationId: conversation.conversation_id,
      sender_role: "pet owner",
    });

    clearTimeout(userTypingTimeout);
    userTypingTimeout = setTimeout(() => {
      socket.emit("stop_typing", {
        conversationId: conversation.conversation_id,
        sender_role: "pet owner",
      });
    }, TYPING_TIMEOUT_MS);
  };

  // ---------------- SEND ----------------
  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !conversation) return;

    const content = newMessage.trim();
    setNewMessage("");

    try {
      await apiClient.post(
        `/conversations/${conversation.conversation_id}/messages`,
        { content }
      );
    } catch (e) {
      console.error(e);
    }
  };

  const openChat = () => {
    setIsOpen(true);
    setHasUnreadMessages(false);
    setUnreadCount(0);
  };

  const closeChat = () => setIsOpen(false);

  if (!user) return null;

  // ---------------- UI (RESTORED DESIGN) ----------------
  return (
    <>
      {/* FAB */}
      <button
        onClick={hasUnreadMessages ? openChat : () => setIsOpen((p) => !p)}
        className={`fixed bottom-6 right-6 w-14 h-14 rounded-2xl bg-gradient-to-br from-[#560705] to-[#703736] text-white shadow-2xl ${
          hasUnreadMessages ? "ring-4 ring-red-400/50 animate-pulse" : ""
        }`}
      >
        {isOpen ? "×" : "💬"}

        {hasUnreadMessages && unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-xs rounded-full px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </div>
        )}
      </button>

      {/* BACKDROP */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden"
          onClick={closeChat}
        />
      )}

      {/* CHAT PANEL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white shadow-2xl overflow-hidden w-full h-screen md:bottom-20 md:right-4 md:w-96 md:h-[500px] md:max-h-[80vh] md:inset-auto md:rounded-2xl">
          
          {/* HEADER */}
          <div className="bg-gradient-to-r from-[#560705] to-[#703736] px-6 py-4 flex justify-between text-white">
            Chat with Admin
            <button onClick={closeChat}>×</button>
          </div>

          {/* MESSAGES */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-gradient-to-b from-gray-50/50 to-white">
            {messages.map((m) => {
              const isMe =
                (m.sender_role || "").toLowerCase() === "pet owner" ||
                m.sender_id === user.user_id;

              const isLastMine =
                isMe && m.message_id === lastUserMessageId;

              return (
                <div key={m.message_id} className="space-y-1.5">
                  <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-md ${
                        isMe
                          ? "bg-gradient-to-r from-[#560705] to-[#703736] text-white rounded-br-sm"
                          : "bg-white border border-gray-100 rounded-bl-sm"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>

                  {isLastMine && (
                    <div className="text-xs text-gray-500 text-right">
                      {m.is_read ? "Seen by Admin" : "Sent"}
                    </div>
                  )}
                </div>
              );
            })}

            {isAdminTyping && (
              <div className="text-sm text-gray-500">
                Admin is typing...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* INPUT */}
          <form onSubmit={handleSend} className="p-3 flex gap-2">
            <input
              value={newMessage}
              onChange={handleUserInputChange}
              className="flex-1 bg-white/70 border border-gray-200 rounded-2xl px-5 py-3 focus:ring-2 focus:ring-[#560705]/30 outline-none"
              placeholder="Type..."
            />
            <button className="w-12 h-12 bg-gradient-to-r from-[#560705] to-[#703736] text-white rounded-2xl">
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default ChatWidget;
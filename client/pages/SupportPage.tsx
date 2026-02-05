import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, formatDateTime } from "@/lib/utils";
import {
  MessageSquare,
  Plus,
  Send,
  Loader2,
  Inbox,
  MessageCircle,
  User,
  Shield,
} from "lucide-react";
import type { SupportChat, SupportMessage } from "@shared/types";

export function SupportPage() {
  const { user } = useAuth();
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatSubject, setNewChatSubject] = useState("");
  const [newChatMessage, setNewChatMessage] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatsQuery = trpc.support.myChats.useQuery();
  const messagesQuery = trpc.support.getChatMessages.useQuery(
    { chatId: selectedChatId! },
    { enabled: !!selectedChatId, refetchInterval: 5000 }
  );

  const createChatMutation = trpc.support.createChat.useMutation({
    onSuccess: (chat) => {
      setIsNewChatOpen(false);
      setNewChatSubject("");
      setNewChatMessage("");
      setSelectedChatId(chat.id);
      chatsQuery.refetch();
    },
  });

  const sendMessageMutation = trpc.support.sendMessage.useMutation({
    onSuccess: () => {
      setNewMessage("");
      messagesQuery.refetch();
    },
  });

  const chats = chatsQuery.data ?? [];
  const messages = messagesQuery.data ?? [];

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCreateChat = useCallback(() => {
    if (!newChatSubject.trim() || !newChatMessage.trim()) return;
    createChatMutation.mutate({
      subject: newChatSubject.trim(),
      message: newChatMessage.trim(),
    });
  }, [newChatSubject, newChatMessage, createChatMutation]);

  const handleSendMessage = useCallback(() => {
    if (!newMessage.trim() || !selectedChatId) return;
    sendMessageMutation.mutate({
      chatId: selectedChatId,
      content: newMessage.trim(),
    });
  }, [newMessage, selectedChatId, sendMessageMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const selectedChat = chats.find((c) => c.id === selectedChatId);

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-4">
      {/* Left sidebar - Chat list */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 shadow overflow-hidden">
        {/* Sidebar header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Чаты поддержки</h2>
            <Badge variant="secondary">{chats.length}</Badge>
          </div>
          <Button
            onClick={() => setIsNewChatOpen(true)}
            className="w-full"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            Новый чат
          </Button>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {chatsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Inbox className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">Нет чатов</p>
              <p className="text-xs text-gray-400 mt-1">
                Создайте новый чат, чтобы задать вопрос
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {chats.map((chat: SupportChat) => (
                <button
                  key={chat.id}
                  onClick={() => setSelectedChatId(chat.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors",
                    selectedChatId === chat.id && "bg-purple-50 hover:bg-purple-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <MessageCircle
                        className={cn(
                          "w-4 h-4 flex-shrink-0",
                          chat.status === "open" ? "text-green-500" : "text-gray-400"
                        )}
                      />
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {chat.subject}
                      </span>
                    </div>
                    <Badge
                      variant={chat.status === "open" ? "default" : "secondary"}
                      className="text-[10px] flex-shrink-0"
                    >
                      {chat.status === "open" ? "Открыт" : "Закрыт"}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 ml-6">
                    {formatDateTime(chat.updatedAt)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel - Messages */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 shadow overflow-hidden">
        {!selectedChatId ? (
          // Empty state
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              Выберите чат
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              Выберите существующий чат из списка слева или создайте новый, чтобы связаться с поддержкой.
            </p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900">{selectedChat?.subject}</h3>
                <p className="text-xs text-gray-400">
                  Создан {selectedChat ? formatDateTime(selectedChat.createdAt) : ""}
                </p>
              </div>
              {selectedChat && (
                <Badge
                  variant={selectedChat.status === "open" ? "default" : "secondary"}
                >
                  {selectedChat.status === "open" ? "Открыт" : "Закрыт"}
                </Badge>
              )}
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messagesQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-gray-400">Нет сообщений</p>
                </div>
              ) : (
                messages.map((msg: SupportMessage) => {
                  const isUser = msg.senderRole === "user";
                  return (
                    <div
                      key={msg.id}
                      className={cn("flex", isUser ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-2xl px-4 py-2.5",
                          isUser
                            ? "bg-purple-600 text-white rounded-br-md"
                            : "bg-gray-100 text-gray-900 rounded-bl-md"
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {isUser ? (
                            <User className="w-3 h-3 opacity-70" />
                          ) : (
                            <Shield className="w-3 h-3 opacity-70" />
                          )}
                          <span
                            className={cn(
                              "text-[10px] font-medium",
                              isUser ? "text-purple-200" : "text-gray-500"
                            )}
                          >
                            {isUser ? "Вы" : "Поддержка"}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p
                          className={cn(
                            "text-[10px] mt-1",
                            isUser ? "text-purple-200" : "text-gray-400"
                          )}
                        >
                          {formatDateTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            {selectedChat?.status === "open" && (
              <div className="p-4 border-t border-gray-200">
                <div className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Введите сообщение..."
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sendMessageMutation.isPending}
                    size="icon"
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {selectedChat?.status === "closed" && (
              <div className="p-4 border-t border-gray-200 text-center">
                <p className="text-sm text-gray-400">Этот чат закрыт</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* New chat dialog */}
      <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый чат с поддержкой</DialogTitle>
            <DialogDescription>
              Опишите ваш вопрос, и наша команда ответит в ближайшее время.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Тема</Label>
              <Input
                id="subject"
                value={newChatSubject}
                onChange={(e) => setNewChatSubject(e.target.value)}
                placeholder="Кратко опишите тему вопроса"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Сообщение</Label>
              <Textarea
                id="message"
                value={newChatMessage}
                onChange={(e) => setNewChatMessage(e.target.value)}
                placeholder="Подробно опишите ваш вопрос или проблему..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsNewChatOpen(false)}
            >
              Отмена
            </Button>
            <Button
              onClick={handleCreateChat}
              disabled={
                !newChatSubject.trim() ||
                !newChatMessage.trim() ||
                createChatMutation.isPending
              }
            >
              {createChatMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <Send className="w-4 h-4 mr-1" />
              )}
              Создать чат
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Users,
  MessageSquare,
  BookOpen,
  Edit2,
  Trash2,
  Plus,
  Save,
  Send,
  Loader2,
  Shield,
  User as UserIcon,
  Coins,
  ChevronLeft,
  Search,
  X,
} from "lucide-react";
import type { User, SupportChat, SupportMessage, FaqArticle } from "@shared/types";

// ==================== Users Tab ====================
function UsersTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [balanceValue, setBalanceValue] = useState("");
  const [roleValue, setRoleValue] = useState<"user" | "admin">("user");

  const usersQuery = trpc.admin.listUsers.useQuery();
  const updateBalanceMutation = trpc.admin.updateUserBalance.useMutation({
    onSuccess: () => {
      usersQuery.refetch();
      setEditingUser(null);
    },
  });
  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => {
      usersQuery.refetch();
      setEditingUser(null);
    },
  });

  const users = usersQuery.data ?? [];
  const filteredUsers = searchQuery
    ? users.filter(
        (u: User) =>
          u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : users;

  const openEditDialog = useCallback((user: User) => {
    setEditingUser(user);
    setBalanceValue(String(user.tokenBalance));
    setRoleValue(user.role);
  }, []);

  const handleSaveBalance = useCallback(() => {
    if (!editingUser) return;
    const balance = parseInt(balanceValue, 10);
    if (isNaN(balance)) return;
    updateBalanceMutation.mutate({ userId: editingUser.id, amount: balance });
  }, [editingUser, balanceValue, updateBalanceMutation]);

  const handleSaveRole = useCallback(() => {
    if (!editingUser) return;
    updateRoleMutation.mutate({ userId: editingUser.id, role: roleValue });
  }, [editingUser, roleValue, updateRoleMutation]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по имени или email..."
          className="pl-10"
        />
      </div>

      {/* Users table */}
      {usersQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    ID
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    Имя
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    Email
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    Роль
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    Баланс
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    Дата регистрации
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((user: User) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {user.id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center">
                          {user.role === "admin" ? (
                            <Shield className="w-3.5 h-3.5 text-purple-600" />
                          ) : (
                            <UserIcon className="w-3.5 h-3.5 text-purple-600" />
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {user.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={user.role === "admin" ? "default" : "secondary"}
                      >
                        {user.role === "admin" ? "Админ" : "Пользователь"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-yellow-600" />
                        <span className="text-sm font-medium text-gray-900">
                          {user.tokenBalance.toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDateTime(user.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-500">
              Пользователи не найдены
            </div>
          )}
        </div>
      )}

      {/* Edit user dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактирование пользователя</DialogTitle>
            <DialogDescription>
              {editingUser?.name} ({editingUser?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Balance */}
            <div className="space-y-2">
              <Label htmlFor="balance">Баланс токенов</Label>
              <div className="flex gap-2">
                <Input
                  id="balance"
                  type="number"
                  value={balanceValue}
                  onChange={(e) => setBalanceValue(e.target.value)}
                />
                <Button
                  onClick={handleSaveBalance}
                  disabled={updateBalanceMutation.isPending}
                  size="sm"
                >
                  {updateBalanceMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label>Роль</Label>
              <div className="flex gap-2">
                <select
                  value={roleValue}
                  onChange={(e) => setRoleValue(e.target.value as "user" | "admin")}
                  className="flex h-9 w-full rounded-md border border-gray-300 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                >
                  <option value="user">Пользователь</option>
                  <option value="admin">Админ</option>
                </select>
                <Button
                  onClick={handleSaveRole}
                  disabled={updateRoleMutation.isPending}
                  size="sm"
                >
                  {updateRoleMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== Support Chats Tab ====================
function SupportChatsTab() {
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatsQuery = trpc.admin.listSupportChats.useQuery();
  const chatMessagesQuery = trpc.admin.getSupportChat.useQuery(
    { chatId: selectedChatId! },
    { enabled: !!selectedChatId, refetchInterval: 5000 }
  );
  const replyMutation = trpc.admin.replySupportChat.useMutation({
    onSuccess: () => {
      setReplyContent("");
      chatMessagesQuery.refetch();
    },
  });

  const chats = chatsQuery.data ?? [];
  const messages = chatMessagesQuery.data ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleReply = useCallback(() => {
    if (!replyContent.trim() || !selectedChatId) return;
    replyMutation.mutate({
      chatId: selectedChatId,
      content: replyContent.trim(),
    });
  }, [replyContent, selectedChatId, replyMutation]);

  if (selectedChatId) {
    const selectedChat = chats.find((c: SupportChat) => c.id === selectedChatId);
    return (
      <div className="space-y-4">
        {/* Back button + chat header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedChatId(null)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Назад
          </Button>
          <div className="flex-1">
            <h3 className="font-medium text-gray-900">{selectedChat?.subject}</h3>
            <p className="text-xs text-gray-400">
              Чат #{selectedChatId} &middot; Пользователь #{selectedChat?.userId}
            </p>
          </div>
          <Badge variant={selectedChat?.status === "open" ? "default" : "secondary"}>
            {selectedChat?.status === "open" ? "Открыт" : "Закрыт"}
          </Badge>
        </div>

        {/* Messages */}
        <Card>
          <CardContent className="p-0">
            <div className="h-[400px] overflow-y-auto p-4 space-y-3">
              {chatMessagesQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : (
                messages.map((msg: SupportMessage) => {
                  const isAdmin = msg.senderRole === "admin";
                  return (
                    <div
                      key={msg.id}
                      className={cn("flex", isAdmin ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-2xl px-4 py-2.5",
                          isAdmin
                            ? "bg-purple-600 text-white rounded-br-md"
                            : "bg-gray-100 text-gray-900 rounded-bl-md"
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {isAdmin ? (
                            <Shield className="w-3 h-3 opacity-70" />
                          ) : (
                            <UserIcon className="w-3 h-3 opacity-70" />
                          )}
                          <span
                            className={cn(
                              "text-[10px] font-medium",
                              isAdmin ? "text-purple-200" : "text-gray-500"
                            )}
                          >
                            {isAdmin ? "Поддержка" : "Пользователь"}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p
                          className={cn(
                            "text-[10px] mt-1",
                            isAdmin ? "text-purple-200" : "text-gray-400"
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

            {/* Reply form */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <Input
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleReply();
                    }
                  }}
                  placeholder="Написать ответ..."
                  className="flex-1"
                />
                <Button
                  onClick={handleReply}
                  disabled={!replyContent.trim() || replyMutation.isPending}
                  size="icon"
                >
                  {replyMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {chatsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
        </div>
      ) : chats.length === 0 ? (
        <div className="text-center py-12">
          <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Нет чатов поддержки</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {chats.map((chat: SupportChat) => (
            <button
              key={chat.id}
              onClick={() => setSelectedChatId(chat.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <MessageSquare
                  className={cn(
                    "w-5 h-5 flex-shrink-0",
                    chat.status === "open" ? "text-green-500" : "text-gray-400"
                  )}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {chat.subject}
                  </p>
                  <p className="text-xs text-gray-400">
                    Пользователь #{chat.userId} &middot;{" "}
                    {formatDateTime(chat.updatedAt)}
                  </p>
                </div>
              </div>
              <Badge
                variant={chat.status === "open" ? "default" : "secondary"}
                className="flex-shrink-0 ml-2"
              >
                {chat.status === "open" ? "Открыт" : "Закрыт"}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== FAQ Tab ====================
function FaqTab() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<FaqArticle | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [formPublished, setFormPublished] = useState(true);

  const articlesQuery = trpc.admin.listFaq.useQuery();
  const createMutation = trpc.admin.createFaq.useMutation({
    onSuccess: () => {
      articlesQuery.refetch();
      resetForm();
      setIsCreateOpen(false);
    },
  });
  const updateMutation = trpc.admin.updateFaq.useMutation({
    onSuccess: () => {
      articlesQuery.refetch();
      resetForm();
      setEditingArticle(null);
    },
  });
  const deleteMutation = trpc.admin.deleteFaq.useMutation({
    onSuccess: () => {
      articlesQuery.refetch();
      setDeleteConfirmId(null);
    },
  });

  const articles = articlesQuery.data ?? [];

  const resetForm = useCallback(() => {
    setFormTitle("");
    setFormContent("");
    setFormCategory("");
    setFormKeywords("");
    setFormPublished(true);
  }, []);

  const openEditDialog = useCallback((article: FaqArticle) => {
    setEditingArticle(article);
    setFormTitle(article.title);
    setFormContent(article.content);
    setFormCategory(article.category);
    setFormKeywords(article.keywords.join(", "));
    setFormPublished(article.published);
  }, []);

  const handleCreate = useCallback(() => {
    if (!formTitle.trim() || !formContent.trim()) return;
    createMutation.mutate({
      title: formTitle.trim(),
      content: formContent.trim(),
      category: formCategory.trim() || "Общее",
      keywords: formKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      published: formPublished,
    });
  }, [formTitle, formContent, formCategory, formKeywords, formPublished, createMutation]);

  const handleUpdate = useCallback(() => {
    if (!editingArticle || !formTitle.trim() || !formContent.trim()) return;
    updateMutation.mutate({
      id: editingArticle.id,
      title: formTitle.trim(),
      content: formContent.trim(),
      category: formCategory.trim() || "Общее",
      keywords: formKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      published: formPublished,
    });
  }, [editingArticle, formTitle, formContent, formCategory, formKeywords, formPublished, updateMutation]);

  const handleDelete = useCallback(() => {
    if (deleteConfirmId === null) return;
    deleteMutation.mutate({ id: deleteConfirmId });
  }, [deleteConfirmId, deleteMutation]);

  const isFormOpen = isCreateOpen || !!editingArticle;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Всего статей: {articles.length}
        </p>
        <Button
          onClick={() => {
            resetForm();
            setIsCreateOpen(true);
          }}
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1" />
          Новая статья
        </Button>
      </div>

      {articlesQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Нет статей FAQ</p>
        </div>
      ) : (
        <div className="space-y-2">
          {articles.map((article: FaqArticle) => (
            <div
              key={article.id}
              className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-start justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    {article.title}
                  </span>
                  <Badge
                    variant={article.published ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {article.published ? "Опубликована" : "Черновик"}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">
                  {article.content}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {article.category}
                  </Badge>
                  <span className="text-[10px] text-gray-400">
                    {formatDateTime(article.updatedAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditDialog(article)}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirmId(article.id)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingArticle(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingArticle ? "Редактирование статьи" : "Новая статья FAQ"}
            </DialogTitle>
            <DialogDescription>
              {editingArticle
                ? "Измените данные статьи и сохраните."
                : "Заполните данные для новой статьи базы знаний."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="faq-title">Заголовок</Label>
              <Input
                id="faq-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Заголовок статьи"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="faq-content">Содержание</Label>
              <Textarea
                id="faq-content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Текст статьи..."
                rows={6}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="faq-category">Категория</Label>
                <Input
                  id="faq-category"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="Общее"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="faq-keywords">Ключевые слова</Label>
                <Input
                  id="faq-keywords"
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                  placeholder="слово1, слово2, слово3"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="faq-published"
                checked={formPublished}
                onChange={(e) => setFormPublished(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <Label htmlFor="faq-published">Опубликовать</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateOpen(false);
                setEditingArticle(null);
              }}
            >
              Отмена
            </Button>
            <Button
              onClick={editingArticle ? handleUpdate : handleCreate}
              disabled={
                !formTitle.trim() ||
                !formContent.trim() ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              )}
              <Save className="w-4 h-4 mr-1" />
              {editingArticle ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удаление статьи</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить эту статью? Это действие необратимо.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              )}
              <Trash2 className="w-4 h-4 mr-1" />
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== Main Admin Page ====================
export function AdminPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Панель администратора</h1>
        <p className="text-sm text-gray-500 mt-1">
          Управление пользователями, чатами поддержки и базой знаний
        </p>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="w-4 h-4" />
            Пользователи
          </TabsTrigger>
          <TabsTrigger value="chats" className="gap-1.5">
            <MessageSquare className="w-4 h-4" />
            Чаты поддержки
          </TabsTrigger>
          <TabsTrigger value="faq" className="gap-1.5">
            <BookOpen className="w-4 h-4" />
            FAQ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersTab />
        </TabsContent>

        <TabsContent value="chats">
          <SupportChatsTab />
        </TabsContent>

        <TabsContent value="faq">
          <FaqTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

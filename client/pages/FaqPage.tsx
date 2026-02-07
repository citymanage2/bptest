import { useState, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Search,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Loader2,
  FileQuestion,
} from "lucide-react";
import type { FaqArticle } from "@shared/types";

export function FaqPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const publishedQuery = trpc.support.getPublishedFaq.useQuery();
  const searchFaqQuery = trpc.support.searchFaq.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length > 0 }
  );

  const isSearching = debouncedQuery.length > 0;
  const articles: FaqArticle[] = isSearching
    ? (searchFaqQuery.data ?? [])
    : (publishedQuery.data ?? []);
  const isLoading = isSearching ? searchFaqQuery.isLoading : publishedQuery.isLoading;

  // Group articles by category
  const groupedArticles = useMemo(() => {
    const groups = new Map<string, FaqArticle[]>();
    for (const article of articles) {
      const category = article.category || "Общее";
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(article);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [articles]);

  const toggleExpanded = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-7 h-7 text-purple-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            База знаний
          </h1>
          <p className="text-gray-500 mb-8 max-w-lg mx-auto">
            Ответы на часто задаваемые вопросы о работе с платформой Business Process Builder
          </p>

          {/* Search bar */}
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по базе знаний..."
              className="pl-11 h-12 text-base rounded-xl"
            />
            {isSearching && searchFaqQuery.isLoading && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileQuestion className="w-12 h-12 text-gray-300 mb-4" />
            {isSearching ? (
              <>
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                  Ничего не найдено
                </h3>
                <p className="text-sm text-gray-500">
                  Попробуйте изменить поисковый запрос или{" "}
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-purple-600 hover:underline"
                  >
                    сбросить поиск
                  </button>
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                  Статей пока нет
                </h3>
                <p className="text-sm text-gray-500">
                  База знаний находится в процессе наполнения.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {isSearching && (
              <p className="text-sm text-gray-500">
                Найдено статей: {articles.length}
              </p>
            )}

            {groupedArticles.map(([category, categoryArticles]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="secondary" className="text-xs">
                    {category}
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {categoryArticles.length}{" "}
                    {categoryArticles.length === 1 ? "статья" : "статей"}
                  </span>
                </div>

                <div className="space-y-2">
                  {categoryArticles.map((article) => {
                    const isExpanded = expandedIds.has(article.id);
                    return (
                      <div
                        key={article.id}
                        className="bg-white rounded-lg border border-gray-200 overflow-hidden transition-shadow hover:shadow-sm"
                      >
                        <button
                          onClick={() => toggleExpanded(article.id)}
                          className="w-full flex items-center justify-between px-5 py-4 text-left"
                        >
                          <span className="text-sm font-medium text-gray-900 pr-4">
                            {article.title}
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-5 pb-4 border-t border-gray-100">
                            <div className="pt-3 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                              {article.content}
                            </div>
                            {article.keywords && article.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-4">
                                {article.keywords.map((keyword, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full"
                                  >
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

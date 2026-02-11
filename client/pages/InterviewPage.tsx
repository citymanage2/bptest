import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { getQuestionsByMode } from "@shared/questions";
import type { InterviewQuestion } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useGenerationProgress } from "@/hooks/useGenerationProgress";
import {
  ChevronLeft,
  ChevronRight,
  Mic,
  MicOff,
  Square,
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  SkipForward,
  Save,
  Paperclip,
  FileText,
  Trash2,
  AlertCircle,
  Upload,
  Check,
} from "lucide-react";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  storedName: string;
  url: string;
  uploadedAt: string;
}

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
}

// Average monthly salaries for role suggestions (question e1)
const ROLE_SALARIES: Record<string, number> = {
  "Менеджер": 75000,
  "Аналитик": 95000,
  "Руководитель": 150000,
  "Бухгалтер": 60000,
  "Юрист": 85000,
  "Технический специалист": 90000,
};

function formatSalary(value: number): string {
  return value.toLocaleString("ru-RU") + " ₽";
}

export function InterviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const interviewId = Number(id);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const genProgress = useGenerationProgress({ duration: 120000 });
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [recordingQuestionId, setRecordingQuestionId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef(false);

  const interviewQuery = trpc.interview.getById.useQuery(
    { id: interviewId },
    { enabled: !!interviewId }
  );

  const saveAnswersMutation = trpc.interview.saveAnswers.useMutation({
    onSuccess: () => {
      setIsSaving(false);
      setLastSavedAt(new Date());
      pendingSaveRef.current = false;
    },
    onError: () => {
      setIsSaving(false);
    },
  });

  const completeMutation = trpc.interview.complete.useMutation();
  const generateMutation = trpc.process.generate.useMutation();

  const interview = interviewQuery.data;
  const mode = interview?.mode ?? "full";

  const questions = useMemo(() => getQuestionsByMode(mode), [mode]);

  const blocks = useMemo(() => {
    const blockMap = new Map<string, { block: string; blockName: string; questions: InterviewQuestion[] }>();
    for (const q of questions) {
      if (!blockMap.has(q.block)) {
        blockMap.set(q.block, { block: q.block, blockName: q.blockName, questions: [] });
      }
      blockMap.get(q.block)!.questions.push(q);
    }
    return Array.from(blockMap.values());
  }, [questions]);

  const currentBlock = blocks[currentBlockIndex];

  // Initialize answers and files from interview data
  useEffect(() => {
    if (interview?.answers) {
      setAnswers((prev) => {
        const merged = { ...prev };
        for (const [key, value] of Object.entries(interview.answers)) {
          if (key === "__files__") continue; // Skip file metadata
          if (!(key in merged) || !merged[key]) {
            merged[key] = value;
          }
        }
        return Object.keys(merged).length === Object.keys(prev).length &&
          Object.keys(merged).every((k) => merged[k] === prev[k])
          ? prev
          : merged;
      });
      // Load uploaded files
      const files = (interview.answers as Record<string, unknown>).__files__;
      if (Array.isArray(files)) {
        setUploadedFiles(files as UploadedFile[]);
      }
    }
  }, [interview?.answers]);

  // Debounced auto-save
  const scheduleSave = useCallback(
    (updatedAnswers: Record<string, string>) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      pendingSaveRef.current = true;
      saveTimerRef.current = setTimeout(() => {
        setIsSaving(true);
        saveAnswersMutation.mutate({ id: interviewId, answers: updatedAnswers });
      }, 3000);
    },
    [interviewId, saveAnswersMutation]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const handleAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: value };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const handleSkip = useCallback(
    (questionId: string) => {
      handleAnswerChange(questionId, "");
    },
    [handleAnswerChange]
  );

  // Voice recording
  const startRecording = useCallback(async (questionId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        // In a real implementation, we'd send the audio blob to a Whisper API.
        // For now, we insert a placeholder text.
        setAnswers((prev) => {
          const currentText = prev[questionId] || "";
          const next = {
            ...prev,
            [questionId]: currentText
              ? currentText + "\n[Голосовая запись]"
              : "[Голосовая запись]",
          };
          scheduleSave(next);
          return next;
        });
        setRecordingQuestionId(null);
      };

      mediaRecorder.start();
      setRecordingQuestionId(questionId);
    } catch {
      // User denied microphone access or browser doesn't support it
      console.error("Не удалось получить доступ к микрофону");
    }
  }, [scheduleSave]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // File upload
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError(null);

    const remainingSlots = MAX_FILES - uploadedFiles.length;
    if (remainingSlots <= 0) {
      setUploadError(`Достигнут лимит: максимум ${MAX_FILES} файлов на анкету`);
      e.target.value = "";
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    for (const file of filesToUpload) {
      if (file.size > MAX_FILE_SIZE) {
        setUploadError(`Файл "${file.name}" превышает максимальный размер 10 МБ`);
        continue;
      }

      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const token = localStorage.getItem("auth_token");
        const response = await fetch(`/api/interview/${interviewId}/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json();
          setUploadError(err.error || "Ошибка при загрузке файла");
          continue;
        }

        const fileMeta: UploadedFile = await response.json();
        setUploadedFiles((prev) => [...prev, fileMeta]);
      } catch {
        setUploadError("Ошибка сети при загрузке файла");
      }
    }

    setIsUploading(false);
    e.target.value = "";
  }, [interviewId, uploadedFiles.length]);

  const handleFileDelete = useCallback(async (fileId: string) => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(`/api/interview/${interviewId}/file/${fileId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (response.ok) {
        setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
        setUploadError(null);
      }
    } catch {
      setUploadError("Ошибка при удалении файла");
    }
  }, [interviewId]);

  const handleNavigateBlock = useCallback(
    (direction: "prev" | "next") => {
      if (direction === "prev" && currentBlockIndex > 0) {
        setCurrentBlockIndex((i) => i - 1);
      } else if (direction === "next" && currentBlockIndex < blocks.length - 1) {
        setCurrentBlockIndex((i) => i + 1);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [currentBlockIndex, blocks.length]
  );

  const handleComplete = useCallback(async () => {
    try {
      setIsGenerating(true);
      genProgress.start();

      // Save current answers first
      if (pendingSaveRef.current && saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      await saveAnswersMutation.mutateAsync({ id: interviewId, answers });

      // Complete interview
      await completeMutation.mutateAsync({ id: interviewId });

      // Generate process
      const process = await generateMutation.mutateAsync({ interviewId });
      genProgress.finish();
      navigate(`/process/${process.id}`);
    } catch (error) {
      console.error("Ошибка при генерации:", error);
      genProgress.reset();
      setIsGenerating(false);
    }
  }, [interviewId, answers, saveAnswersMutation, completeMutation, generateMutation, navigate, genProgress]);

  // Warn before leaving during generation
  useEffect(() => {
    if (!isGenerating) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isGenerating]);

  // Count answered questions
  const answeredCount = useMemo(
    () => questions.filter((q) => answers[q.id]?.trim()).length,
    [questions, answers]
  );

  const requiredUnanswered = useMemo(
    () => questions.filter((q) => q.required && !answers[q.id]?.trim()),
    [questions, answers]
  );

  const completionPercent = useMemo(
    () => (questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0),
    [answeredCount, questions.length]
  );

  // Loading state
  if (interviewQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (interviewQuery.error || !interview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-gray-500">Интервью не найдено</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Назад
        </Button>
      </div>
    );
  }

  // Generation overlay
  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center">
            {genProgress.phase === "done" ? (
              <Check className="w-10 h-10 text-green-600" />
            ) : (
              <Sparkles className="w-10 h-10 text-purple-600 animate-pulse" />
            )}
          </div>
          {genProgress.phase !== "done" && (
            <div className="absolute inset-0 rounded-full border-4 border-purple-200 border-t-purple-600 animate-spin" />
          )}
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-gray-900">
            {genProgress.phase === "done"
              ? "Готово!"
              : `Генерация бизнес-процесса... ${genProgress.progress}%`}
          </h2>
          <p className="text-gray-500">
            {genProgress.phase === "done"
              ? "Перенаправление на страницу процесса..."
              : "ИИ анализирует ваши ответы и формирует структуру процесса."}
          </p>
        </div>
        <div className="w-64 space-y-2">
          <Progress value={genProgress.progress} className="w-full" />
          <p className="text-xs text-amber-600 text-center flex items-center justify-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Пожалуйста, не покидайте страницу
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header with progress */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Интервью</h1>
            <p className="text-sm text-gray-500 mt-1">
              {mode === "express" ? "Экспресс-режим" : "Полный режим"} &middot;{" "}
              {answeredCount} из {questions.length} вопросов
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSaving && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                Сохранение...
              </span>
            )}
            {!isSaving && lastSavedAt && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <Save className="w-3 h-3" />
                Сохранено
              </span>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Прогресс</span>
            <span className="font-medium text-purple-600">{completionPercent}%</span>
          </div>
          <Progress value={completionPercent} />
        </div>
      </div>

      {/* Block navigation tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {blocks.map((block, index) => {
          const blockAnswered = block.questions.filter((q) => answers[q.id]?.trim()).length;
          const blockTotal = block.questions.length;
          const isComplete = blockAnswered === blockTotal;
          const isCurrent = index === currentBlockIndex;

          return (
            <button
              key={block.block}
              onClick={() => {
                setCurrentBlockIndex(index);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                isCurrent
                  ? "bg-purple-600 text-white"
                  : isComplete
                    ? "bg-green-50 text-green-700 hover:bg-green-100"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {isComplete ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <Circle className="w-3.5 h-3.5" />
              )}
              Блок {block.block}
              <span className="text-xs opacity-75">
                ({blockAnswered}/{blockTotal})
              </span>
            </button>
          );
        })}
      </div>

      {/* Current block questions */}
      {currentBlock && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <Badge variant="secondary" className="mb-2">
                  Блок {currentBlock.block}
                </Badge>
                <CardTitle className="text-lg">{currentBlock.blockName}</CardTitle>
              </div>
              <span className="text-sm text-gray-500">
                {currentBlock.questions.filter((q) => answers[q.id]?.trim()).length} из{" "}
                {currentBlock.questions.length}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-8">
            {currentBlock.questions.map((question, qIndex) => {
              const isAnswered = !!answers[question.id]?.trim();
              const isRecording = recordingQuestionId === question.id;

              return (
                <div key={question.id} className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium",
                          isAnswered
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        )}
                      >
                        {qIndex + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {question.question}
                        </p>
                        {question.hint && question.id !== "e1" && (
                          <p className="text-xs text-gray-400 mt-0.5 italic">{question.hint}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {question.required && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              Обязательный
                            </Badge>
                          )}
                          {question.expressMode && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              Экспресс
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Role chips with salaries for question e1 */}
                  {question.id === "e1" && (
                    <div className="ml-10 flex flex-wrap gap-2 mt-1">
                      {Object.entries(ROLE_SALARIES).map(([role, salary]) => {
                        const currentAnswer = answers[question.id] || "";
                        const roles = currentAnswer.split(",").map((s) => s.trim()).filter(Boolean);
                        const isSelected = roles.includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => {
                              const updated = isSelected
                                ? roles.filter((r) => r !== role)
                                : [...roles, role];
                              handleAnswerChange(question.id, updated.join(", "));
                            }}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                              isSelected
                                ? "bg-purple-100 text-purple-700 border-purple-300"
                                : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                            )}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                            {role}
                            <span className={cn(
                              "font-normal",
                              isSelected ? "text-purple-500" : "text-gray-400"
                            )}>
                              — {formatSalary(salary)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="ml-10">
                    <div className="relative">
                      <Textarea
                        value={answers[question.id] || ""}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                        placeholder="Введите ваш ответ..."
                        rows={3}
                        className={cn(
                          "pr-12 resize-y",
                          isRecording && "border-red-400 ring-2 ring-red-200"
                        )}
                      />
                      {/* Voice recording button */}
                      <div className="absolute right-2 top-2">
                        {isRecording ? (
                          <button
                            onClick={stopRecording}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                            title="Остановить запись"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            <span className="text-xs font-medium animate-pulse">REC</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => startRecording(question.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                            title="Записать голос"
                          >
                            <Mic className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Skip button for non-required questions */}
                    {!question.required && !isAnswered && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSkip(question.id)}
                        className="mt-2 text-gray-400 hover:text-gray-600"
                      >
                        <SkipForward className="w-3.5 h-3.5 mr-1" />
                        Пропустить
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* File upload section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-gray-500" />
              Прикрепленные файлы
            </CardTitle>
            <span className="text-sm text-gray-500">
              {uploadedFiles.length} из {MAX_FILES}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Прикрепите имеющиеся у вас регламенты, инструкции, описания процессов и другие документы — они будут учтены при генерации бизнес-процесса
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* File list */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 bg-gray-50/50 group"
                >
                  <FileText className="w-4 h-4 text-purple-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFileDelete(file.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500"
                    title="Удалить файл"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {uploadError && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{uploadError}</p>
            </div>
          )}

          {/* Upload button */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf,.odt,.ods,.ppt,.pptx,.csv,.png,.jpg,.jpeg"
          />
          {uploadedFiles.length < MAX_FILES && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {isUploading ? "Загрузка..." : "Прикрепить файлы"}
            </Button>
          )}

          {/* Limits info */}
          <p className="text-[11px] text-gray-400 text-center">
            Макс. размер файла: 10 МБ. Форматы: PDF, DOC, DOCX, XLS, XLSX, TXT, RTF, PPT, PPTX, CSV, изображения
          </p>
        </CardContent>
      </Card>

      {/* Navigation footer */}
      <div className="flex items-center justify-between pt-4 pb-8">
        <Button
          variant="outline"
          onClick={() => handleNavigateBlock("prev")}
          disabled={currentBlockIndex === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Предыдущий блок
        </Button>

        <div className="flex items-center gap-3">
          {currentBlockIndex === blocks.length - 1 ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleComplete}
                    disabled={requiredUnanswered.length > 0 || isGenerating}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Sparkles className="w-4 h-4 mr-1" />
                    Завершить и сгенерировать
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Это может занять несколько минут</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button onClick={() => handleNavigateBlock("next")}>
              Следующий блок
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>

      {/* Required questions reminder */}
      {requiredUnanswered.length > 0 && currentBlockIndex === blocks.length - 1 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
          <p className="text-sm font-medium text-yellow-800 mb-2">
            Не все обязательные вопросы заполнены ({requiredUnanswered.length})
          </p>
          <ul className="space-y-1">
            {requiredUnanswered.map((q) => (
              <li key={q.id} className="text-xs text-yellow-700 flex items-center gap-1.5">
                <Circle className="w-2.5 h-2.5" />
                Блок {q.block}: {q.question}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

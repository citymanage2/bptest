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
import { cn } from "@/lib/utils";
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
} from "lucide-react";

export function InterviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const interviewId = Number(id);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [recordingQuestionId, setRecordingQuestionId] = useState<string | null>(null);

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

  // Initialize answers from interview data
  useEffect(() => {
    if (interview?.answers) {
      setAnswers((prev) => {
        const merged = { ...prev };
        for (const [key, value] of Object.entries(interview.answers)) {
          if (!(key in merged) || !merged[key]) {
            merged[key] = value;
          }
        }
        return Object.keys(merged).length === Object.keys(prev).length &&
          Object.keys(merged).every((k) => merged[k] === prev[k])
          ? prev
          : merged;
      });
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

      // Save current answers first
      if (pendingSaveRef.current && saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      await saveAnswersMutation.mutateAsync({ id: interviewId, answers });

      // Complete interview
      await completeMutation.mutateAsync({ id: interviewId });

      // Generate process
      const process = await generateMutation.mutateAsync({ interviewId });
      navigate(`/process/${process.id}`);
    } catch (error) {
      console.error("Ошибка при генерации:", error);
      setIsGenerating(false);
    }
  }, [interviewId, answers, saveAnswersMutation, completeMutation, generateMutation, navigate]);

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
            <Sparkles className="w-10 h-10 text-purple-600 animate-pulse" />
          </div>
          <div className="absolute inset-0 rounded-full border-4 border-purple-200 border-t-purple-600 animate-spin" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-gray-900">
            Генерация бизнес-процесса...
          </h2>
          <p className="text-gray-500">
            ИИ анализирует ваши ответы и формирует структуру процесса. Это может занять 1-2 минуты.
          </p>
        </div>
        <Progress value={undefined} className="w-64" />
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
                        {question.hint && (
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
            <Button
              onClick={handleComplete}
              disabled={requiredUnanswered.length > 0 || isGenerating}
              className="bg-green-600 hover:bg-green-700"
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Завершить и сгенерировать
            </Button>
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

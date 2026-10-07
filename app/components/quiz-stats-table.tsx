import type { QuizStats } from "~/services/analyticsService";

const EM_DASH = "—";

function formatPercent(rate: number | null) {
  return rate === null ? EM_DASH : `${Math.round(rate * 100)}%`;
}

export function QuizStatsTable({ quizzes }: { quizzes: QuizStats[] }) {
  if (quizzes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This course has no quizzes.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="pb-2 pr-4 font-medium">Quiz</th>
          <th className="pb-2 pr-4 font-medium">Lesson</th>
          <th className="pb-2 pr-4 text-right font-medium">Pass rate</th>
          <th className="pb-2 pr-4 text-right font-medium">Avg best score</th>
          <th className="pb-2 text-right font-medium">Avg attempts</th>
        </tr>
      </thead>
      <tbody>
        {quizzes.map((quiz) => (
          <tr key={quiz.quizId} className="border-b last:border-0">
            <td className="py-2 pr-4 font-medium">{quiz.quizTitle}</td>
            <td className="py-2 pr-4 text-muted-foreground">
              {quiz.lessonTitle}
            </td>
            <td className="py-2 pr-4 text-right tabular-nums">
              {quiz.passRate === null ? (
                EM_DASH
              ) : (
                <>
                  {formatPercent(quiz.passRate)}{" "}
                  <span className="text-muted-foreground">
                    ({quiz.passedCount} of {quiz.attemptedCount})
                  </span>
                </>
              )}
            </td>
            <td className="py-2 pr-4 text-right tabular-nums">
              {formatPercent(quiz.averageBestScore)}
            </td>
            <td className="py-2 text-right tabular-nums">
              {quiz.averageAttempts === null
                ? EM_DASH
                : quiz.averageAttempts.toFixed(1)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

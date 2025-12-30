// frontend/src/components/quiz/Section2_FillInTheBlank.tsx
import React from 'react';
import { Question } from '../../lib/quizParser';
import FillInTheBlankInput from './FillInTheBlankInput';

interface Props {
  questions: Question[];
  wordBank: string[];
  answers: string[];
  onAnswerChange: (index: number, value: string) => void;
  isReview?: boolean;
}

export default function Section2_FillInTheBlank({ questions, wordBank, answers, onAnswerChange, isReview = false }: Props) {
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-gray-700">Section 2: Fill in the Blanks</h2>
      <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg">
        <h3 className="font-semibold text-blue-800">Word Bank</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          {wordBank.map(word => (
            <span key={word} className="px-3 py-1 bg-white border border-gray-300 rounded-full text-sm font-mono">
              {word}
            </span>
          ))}
        </div>
      </div>
      {questions.map((q, i) => (
        <FillInTheBlankInput
          key={q.word} // Use a stable key
          prompt={q.prompt!}
          value={answers[i] || ''}
          onChange={e => onAnswerChange(i, e.target.value)}
          isReview={isReview}
          correct={(q as any).correct}
        />
      ))}
    </div>
  );
}

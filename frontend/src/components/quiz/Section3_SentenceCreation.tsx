// frontend/src/components/quiz/Section3_SentenceCreation.tsx
import React from 'react';
import { Question } from '../../lib/quizParser';
import SentenceInput from './SentenceInput';

interface Props {
  questions: Question[];
  answers: string[];
  onAnswerChange: (index: number, value: string) => void;
  isReview?: boolean;
}

export default function Section3_SentenceCreation({ questions, answers, onAnswerChange, isReview = false }: Props) {
  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-gray-700">Section 3: Apply Your Knowledge</h2>
      <p className="text-gray-600">Create a unique sentence for each of the following words.</p>
      {questions.map((q, i) => (
        <SentenceInput
          key={q.word}
          word={q.word}
          value={answers[i] || ''}
          onChange={e => onAnswerChange(i, e.target.value)}
          isReview={isReview}
          aiFeedback={(q as any).aiFeedback}
        />
      ))}
    </div>
  );
}

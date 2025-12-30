// frontend/src/components/quiz/Section1_Definitions.tsx
import React from 'react';
import { Question } from '../../lib/quizParser';
import { BookOpenIcon } from '@heroicons/react/24/outline';

interface Props {
  questions: Question[];
}

export default function Section1_Definitions({ questions }: Props) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-gray-700">Section 1: Vocabulary Review</h2>
      <p className="text-gray-600">Familiarize yourself with the following words and their meanings.</p>
      <div className="p-4 bg-gray-50 rounded-lg border space-y-4">
        {questions.map((q, i) => (
          <div key={i} className="border-b pb-2">
            <div className="flex items-center space-x-3">
              <p className="text-lg font-semibold text-gray-800">{q.word}</p>
              <a
                href={`https://dictionary.cambridge.org/dictionary/english/${q.word}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Look up in Cambridge Dictionary"
                className="text-gray-400 hover:text-blue-600 transition-colors"
              >
                <BookOpenIcon className="h-6 w-6" />
              </a>
            </div>
            <p className="text-gray-700 pl-2">{q.definition}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

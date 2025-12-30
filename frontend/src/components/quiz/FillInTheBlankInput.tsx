import React from 'react';

interface Props {
  prompt: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isReview?: boolean;
  correct?: boolean;
}

export default function FillInTheBlankInput({ prompt, value, onChange, isReview, correct }: Props) {
  const borderColor = isReview ? (correct ? 'border-green-500' : 'border-red-500') : 'border-gray-300';
  const ringColor = isReview ? (correct ? 'focus:ring-green-500' : 'focus:ring-red-500') : 'focus:ring-blue-500';

  return (
    <div className={`p-4 border rounded-lg bg-white shadow-sm ${isReview ? 'border-2' : ''} ${borderColor}`}>
      <p className="text-lg text-gray-700 mb-2">{prompt.replace('___', '______')}</p>
      <input
        type="text"
        value={value}
        onChange={onChange}
        disabled={isReview}
        className={`w-full px-3 py-2 border ${borderColor} rounded-md focus:outline-none focus:ring-2 ${ringColor} ${isReview ? 'bg-gray-100' : ''}`}
        placeholder="Type the missing word"
      />
      {isReview && (
        <p className={`mt-2 text-sm ${correct ? 'text-green-600' : 'text-red-600'}`}>
          {correct ? 'Correct!' : 'Incorrect.'}
        </p>
      )}
    </div>
  );
}

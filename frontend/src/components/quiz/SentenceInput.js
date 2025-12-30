import React from 'react';

export default function SentenceInput({ word, value, onChange, isReview, aiFeedback }) {
  const getBorderColor = () => {
    if (!isReview || !aiFeedback) return 'border-gray-300';
    if (aiFeedback.score >= 3) return 'border-green-500';
    if (aiFeedback.score >= 1) return 'border-yellow-500';
    return 'border-red-500';
  };

  const borderColor = getBorderColor();

  return (
    <div className={`p-4 border rounded-lg bg-white shadow-sm ${isReview ? 'border-2' : ''} ${borderColor}`}>
      <p className="text-lg text-gray-700 mb-2">
        Make a sentence using the word: <strong className="font-semibold">{word}</strong>
      </p>
      <textarea
        value={value}
        onChange={onChange}
        disabled={isReview}
        className={`w-full px-3 py-2 border ${borderColor} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isReview ? 'bg-gray-100' : ''}`}
        placeholder="Write your sentence here..."
        rows={3}
      />
      {isReview && aiFeedback && (
        <div className="mt-2 text-sm">
          <p><strong>Score:</strong> {aiFeedback.score}/4</p>
          <p><strong>Feedback:</strong> {aiFeedback.feedback}</p>
        </div>
      )}
    </div>
  );
}


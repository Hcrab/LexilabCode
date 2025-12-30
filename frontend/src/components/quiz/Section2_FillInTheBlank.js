import React from 'react';

export default function Section2_FillInTheBlank({ questions, wordBank, answers, onAnswerChange, isReview }) {
  const shuffledBank = React.useMemo(() => {
    const qWords = (questions || []).map(q => q.word);
    const base = Array.isArray(wordBank) ? [...wordBank] : [];
    const shuffleOnce = (arr) => arr.sort(() => Math.random() - 0.5);
    let out = shuffleOnce(base);
    // Ensure it is not in the exact same order as the questions
    let tries = 0;
    const sameOrder = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    while (sameOrder(out, qWords) && tries < 5) { out = shuffleOnce([...base]); tries++; }
    return out;
  }, [wordBank, questions]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-700">Section 2: Fill in the Blank</h2>
      <p className="text-gray-600">Use the word bank below to complete each sentence.</p>

      {/* Sticky Word Bank */}
      <div className="sticky top-0 z-20 bg-white/95 border-b py-2">
        <div className="flex flex-wrap gap-2">
          {shuffledBank.map((w, i) => (
            <button
              key={i}
              type="button"
              className="px-3 py-1.5 text-sm border border-blue-500 text-blue-700 bg-blue-50 rounded-full hover:bg-blue-100"
              onClick={() => {
                const idx = answers.findIndex(v => !v || v.trim() === '');
                if (idx >= 0) onAnswerChange(idx, w);
              }}
            >{w}</button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.id} className="p-3 bg-white rounded border">
            <div className="text-lg mb-2">{q.prompt}</div>
            <input
              className="border p-2 rounded w-full"
              placeholder="Type the word"
              value={answers[i] || ''}
              onChange={e => onAnswerChange(i, e.target.value)}
              disabled={isReview}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

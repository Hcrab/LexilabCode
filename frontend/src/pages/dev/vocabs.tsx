import React, { useState, useEffect } from 'react';
import withAdminAuth from '../../components/withAdminAuth';

interface Word {
  _id: string;
  word: string;
  pos: string;
  definition: {
    en: string;
    cn: string;
  };
  variant_id: number;
  lab_exercises: any;
  created_at: string;
}

const AllVocabsPage = () => {
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWords = async () => {
      try {
        const res = await fetch('/api/words');
        if (!res.ok) {
          throw new Error(`Failed to fetch words: ${res.statusText}`);
        }
        const data = await res.json();
        setWords(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchWords();
  }, []);

  if (loading) {
    return <div className="p-8 text-center">Loading vocabulary...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  }

  return (
    <div className="p-8 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">All Vocabulary Words</h1>
      <div className="space-y-4">
        {words.map((word) => (
          <div key={word._id} className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-bold text-blue-600">{word.word} (v{word.variant_id})</h2>
            <pre className="mt-2 p-3 bg-gray-800 text-white rounded-md text-sm whitespace-pre-wrap">
              {JSON.stringify(word, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
};

export default withAdminAuth(AllVocabsPage);

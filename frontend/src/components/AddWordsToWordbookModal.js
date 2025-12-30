import React, { useState, useEffect } from 'react';

const AddWordsToWordbookModal = ({ isOpen, onClose, onWordsAdded, wordbookId, existingWords }) => {
  const [allWords, setAllWords] = useState([]);
  const [selectedWords, setSelectedWords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      const fetchAllWords = async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch('/api/words', {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (!response.ok) throw new Error('Failed to fetch words');
          const data = await response.json();
          
          // Filter out words that are already in the wordbook
          const existingWordNames = existingWords.map(w => w.word);
          const availableWords = data.filter(w => !existingWordNames.includes(w.word));
          
          setAllWords(availableWords);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      fetchAllWords();
    }
  }, [isOpen, existingWords]);

  const handleSelectWord = (wordName) => {
    setSelectedWords(prev =>
      prev.includes(wordName)
        ? prev.filter(name => name !== wordName)
        : [...prev, wordName]
    );
  };

  const handleSubmit = async () => {
    if (selectedWords.length === 0) {
      onClose();
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/wordbooks/${wordbookId}/words`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ words: selectedWords }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to add words');
      }
      onWordsAdded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredWords = allWords.filter(word => 
    word.word.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl h-4/5 flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">Add Words to Wordbook</h2>
          <input
            type="text"
            placeholder="Search words..."
            className="w-full mt-4 px-4 py-2 border rounded-lg"
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="p-6 overflow-y-auto flex-grow">
          {loading && <p>Loading...</p>}
          {error && <p className="text-red-500">{error}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWords.map(word => (
              <div
                key={word._id}
                onClick={() => handleSelectWord(word.word)}
                className={`p-3 rounded-lg cursor-pointer border-2 ${
                  selectedWords.includes(word.word)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <p className="font-semibold">{word.word}</p>
                <p className="text-sm text-gray-600">{word.definition_cn}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 border-t flex justify-end gap-4 bg-gray-50">
          <button onClick={onClose} className="py-2 px-4 bg-gray-200 rounded-lg">Cancel</button>
          <button onClick={handleSubmit} className="py-2 px-6 bg-blue-600 text-white rounded-lg" disabled={loading}>
            {loading ? 'Adding...' : `Add ${selectedWords.length} words`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddWordsToWordbookModal;

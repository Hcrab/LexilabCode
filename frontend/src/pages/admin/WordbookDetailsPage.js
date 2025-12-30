import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
// import AddWordsToWordbookModal from '../../components/AddWordsToWordbookModal';
import EditWordModal from '../../components/EditWordModal';

// Reusable API utility from WordListPage
const api = {
  get: async (endpoint) => {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Request failed');
    }
    return response.json();
  },
  put: async (endpoint, body) => {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Request failed');
    }
    return response.json();
  },
  delete: async (endpoint) => {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Request failed');
    }
    return response.json();
  }
};


const WordbookDetailsPage = () => {
  const [wordbook, setWordbook] = useState(null);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // const [isModalOpen, setIsModalOpen] = useState(false);
  const { wordbookId } = useParams();

  // New states for filtering and editing
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLetter, setSelectedLetter] = useState('All');
  const [editingWord, setEditingWord] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalWords, setTotalWords] = useState(0);

  const fetchWordbookDetails = useCallback(async (page, search, letter) => {
    setLoading(true);
    try {
      const limit = 50;
      const url = `/api/wordbooks/${wordbookId}?page=${page}&limit=${limit}&sort=entry_number&search=${search}&letter=${letter}`;
      const data = await api.get(url);

      setWordbook(data);
      // Use entries from the wordbook for display, as they contain tags
      setWords(data.entries || []);
      setTotalPages(data.pages || 0);
      setTotalWords(data.total_entries || 0);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [wordbookId]);

  useEffect(() => {
    fetchWordbookDetails(currentPage, searchTerm, selectedLetter);
  }, [fetchWordbookDetails, currentPage, searchTerm, selectedLetter]);

  // --- Word Deletion and Editing Logic ---
  const handleDelete = async (wordIdentifier) => {
    if (window.confirm('Remove this word from the wordbook?')) {
        try {
            // Note: This should be an endpoint to remove a word from a wordbook, not delete the word itself.
            // Assuming such an endpoint exists. If not, this needs backend implementation.
            await api.delete(`/api/wordbooks/${wordbookId}/words/${encodeURIComponent(wordIdentifier)}`);
            fetchWordbookDetails(currentPage, searchTerm, selectedLetter); // Refresh list
        } catch (err) {
            setError(err.message);
        }
    }
  };

  const handleEdit = (word) => {
    // The word object from entries might be just { word: "name", tags: [] }
    // We need to fetch the full word details for editing.
    const wordIdentifier = word.word;
    api.get(`/api/words/practice/${wordIdentifier}`).then(fullWord => {
        setEditingWord(fullWord);
    }).catch(err => {
        setError(err.message);
    });
  };

  const handleSave = async (updatedWord) => {
    setIsSaving(true);
    try {
        await api.put(`/api/words/${updatedWord._id}`, updatedWord);
        setEditingWord(null);
        // No need to refetch the whole list, but we do it for simplicity
        fetchWordbookDetails(currentPage, searchTerm, selectedLetter); 
    } catch (err) {
        setError(err.message);
    } finally {
        setIsSaving(false);
    }
  };

  // --- Filtering and Pagination Handlers ---
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset page on new search
  };

  const handleLetterChange = (letter) => {
    setSelectedLetter(letter);
    setCurrentPage(1); // Reset page on new filter
  };

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const alphabet = ['All', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

  if (loading && !wordbook) {
    return <div className="text-center py-10">Loading...</div>;
  }

  if (error) {
    return <div className="text-center py-10 text-red-500">Error: {error}</div>;
  }

  if (!wordbook) {
    return <div className="text-center py-10">Wordbook not found.</div>;
  }
  
  const isAZWordbook = wordbook.title.toLowerCase().includes('a-z');

  return (
    <>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
          <div className="flex-grow">
            <h1 className="text-3xl font-bold mb-2 text-gray-800">{wordbook.title}</h1>
            <p className="text-lg text-gray-600">{wordbook.description}</p>
          </div>
        </div>

        {/* A-Z Filter and Search */}
        <div className="bg-white p-4 rounded-lg shadow-md mb-6">
          {isAZWordbook && (
            <div className="flex flex-wrap gap-2 mb-4">
              {alphabet.map(letter => (
                <button
                  key={letter}
                  onClick={() => handleLetterChange(letter)}
                  className={`px-3 py-1 text-sm font-semibold rounded-full ${
                    selectedLetter === letter
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            placeholder="Search words..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="w-full p-3 bg-gray-50 border rounded-lg"
          />
        </div>
        
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Word
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Chinese definition
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Tags
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {words.map((entry, index) => (
                <tr key={`${entry.word}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-5 py-4 border-b border-gray-200 text-sm">
                    <p className="text-gray-900 whitespace-no-wrap">{entry.word}</p>
                  </td>
                  <td className="px-5 py-4 border-b border-gray-200 text-sm">
                    <p className="text-gray-900 whitespace-no-wrap">{entry.definition_cn}</p>
                  </td>
                  <td className="px-5 py-4 border-b border-gray-200 text-sm">
                    <div className="flex flex-wrap gap-1">
                      {entry.tags && entry.tags.map(tag => (
                        <span key={tag} className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-4 border-b border-gray-200 text-sm text-right">
                    <div className="flex justify-end items-center gap-x-4">
                      <button onClick={() => handleEdit(entry)} className="text-blue-600 hover:underline">Edit</button>
                      <button onClick={() => handleDelete(entry.word)} className="text-red-600 hover:underline">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="self-start">
                <p className="text-sm text-gray-600">
                    Total {totalWords} words, page {currentPage} of {totalPages}
                </p>
            </div>
            <div className="flex self-end">
                <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1 || loading}
                    className="px-4 py-2 bg-gray-200 rounded-l-md hover:bg-gray-300 disabled:opacity-50"
                >
                    Previous
                </button>
                <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages || loading}
                    className="px-4 py-2 bg-gray-200 rounded-r-md hover:bg-gray-300 disabled:opacity-50"
                >
                    Next
                </button>
            </div>
        </div>
      </div>
      {/* <AddWordsToWordbookModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onWordsAdded={() => fetchWordbookDetails(1, '', 'All')}
        wordbookId={wordbookId}
        existingWords={words.map(e => e.word) || []}
      /> */}
      {editingWord && (
        <EditWordModal
            word={editingWord}
            onSave={handleSave}
            onCancel={() => setEditingWord(null)}
            isSaving={isSaving}
        />
      )}
    </>
  );
};

export default WordbookDetailsPage;

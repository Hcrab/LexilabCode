import React, { useState, useEffect, useCallback } from 'react';
import EditWordModal from '../../components/EditWordModal';

// Reusable API utility
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
  post: async (endpoint, body) => {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body || {})
    });
    if (!response.ok) {
      let errorData = {};
      try { errorData = await response.json(); } catch (e) {}
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

const WordListPage = () => {
    const [words, setWords] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    // applied search term (used for fetching)
    const [searchTerm, setSearchTerm] = useState('');
    // input box value (does not auto-fetch)
    const [inputTerm, setInputTerm] = useState('');
    const [editingWord, setEditingWord] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [totalWords, setTotalWords] = useState(0);

    const fetchWords = useCallback(async (page, search) => {
        try {
            setIsLoading(true);
            const limit = 50;
            const response = await api.get(`/api/words?sort=word&page=${page}&limit=${limit}&search=${search}`);
            setWords(response.words || []);
            setTotalPages(response.pages || 0);
            setTotalWords(response.total || 0);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const [ready, setReady] = useState(false);

    // Call ghost-cleanup endpoint once on mount, then enable fetching
    useEffect(() => {
        let cancelled = false;
        const init = async () => {
            try {
                await api.post('/api/admin/cleanup-ghosts', {});
            } catch (e) {
                // Swallow errors; do not block page
                console.warn('Cleanup ghosts failed:', e?.message || e);
            } finally {
                if (!cancelled) setReady(true);
            }
        };
        init();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!ready) return;
        fetchWords(currentPage, searchTerm);
    }, [ready, fetchWords, currentPage, searchTerm]);

    const handleDelete = async (wordId) => {
        if (window.confirm('Are you sure you want to delete this word?')) {
            try {
                await api.delete(`/api/words/${wordId}`);
                // Refetch current page to reflect deletion
                fetchWords(currentPage, searchTerm);
            } catch (err) {
                setError(err.message);
            }
        }
    };

    const handleEdit = (word) => {
        api.get(`/api/words/practice/${word.word}`).then(fullWord => {
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
            fetchWords(currentPage, searchTerm); // Refetch to show updated data
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };
    
    // Only change input state; do not fetch here
    const handleSearchChange = (e) => {
        setInputTerm(e.target.value);
    };

    // Apply the search only when user clicks the button (or presses Enter)
    const handleApplySearch = () => {
        // Reset to first page when applying a new search
        setCurrentPage(1);
        setSearchTerm(inputTerm.trim());
    };

    const handlePageChange = (newPage) => {
        if (newPage > 0 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-700">Vocabulary Management</h3>
            <div className="flex gap-2 mb-6">
                <input
                    type="text"
                    placeholder="Enter keyword, press “Search” to start"
                    value={inputTerm}
                    onChange={handleSearchChange}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleApplySearch(); }}
                    className="flex-1 p-3 bg-gray-50 border rounded"
                />
                <button
                    onClick={handleApplySearch}
                    disabled={isLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    Search
                </button>
            </div>

            {isLoading && <p>Loading words...</p>}
            {error && <p className="text-red-600">{error}</p>}

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="p-3">Word (A-Z)</th>
                            <th className="p-3">Chinese definition</th>
                            <th className="p-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {words.map(word => (
                            <tr key={word._id} className="border-b hover:bg-gray-50">
                                <td className="p-3">{word.word}</td>
                                <td className="p-3">{word.definition_cn}</td>
                                <td className="p-3">
                                    <button onClick={() => handleEdit(word)} className="text-blue-600 hover:underline mr-4">Edit</button>
                                    <button onClick={() => handleDelete(word._id)} className="text-red-600 hover:underline">Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-6 flex justify-between items-center">
                <div>
                    <p className="text-sm text-gray-600">
                        Total {totalWords} words, page {currentPage} of {totalPages}
                    </p>
                </div>
                <div className="flex">
                    <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1 || isLoading}
                        className="px-4 py-2 bg-gray-200 rounded-l-md hover:bg-gray-300 disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages || isLoading}
                        className="px-4 py-2 bg-gray-200 rounded-r-md hover:bg-gray-300 disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>

            {editingWord && (
                <EditWordModal
                    word={editingWord}
                    onSave={handleSave}
                    onCancel={() => setEditingWord(null)}
                    isSaving={isSaving}
                />
            )}
        </div>
    );
};

export default WordListPage;

import React, { useState } from 'react';

// Reusable API utility
const api = {
  post: async (endpoint, body) => {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
      method: 'POST',
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
  }
};

// SpecifyMeaningModal removed in simplified flow


// Modal to display generated word data for confirmation
const ConfirmationModal = ({ wordData, onConfirm, onDiscard, isSaving }) => {
    if (!wordData) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-8 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold mb-6 text-gray-800">Please review the generated word</h2>
                <div className="space-y-4 text-left">
                    <p><strong>Word:</strong> {wordData.word}</p>
                    {wordData.word_root && <p><strong>Word root:</strong> {wordData.word_root}</p>}
                    <p><strong>Chinese definition:</strong> {wordData.definition_cn}</p>
                    <p><strong>English definition:</strong> {wordData.definition_en}</p>
                    
                    <div className="pt-4">
                        <h3 className="text-lg font-semibold mb-2">Example sentences:</h3>
                        <ul className="list-disc list-inside space-y-2 pl-4">
                            {wordData.sample_sentences.map((s, i) => <li key={i}>{s.sentence} ({s.translation})</li>)}
                        </ul>
                    </div>

                    <div className="pt-4">
                        <h3 className="text-lg font-semibold mb-2">Exercises:</h3>
                        {wordData.exercises.map((ex, i) => (
                            <div key={i} className="pl-4 mb-3">
                                <p className="font-semibold capitalize">Type: {ex.type.replace('_', ' ')}</p>
                                {ex.sentences && <ul className="list-disc list-inside pl-4">
                                    <li>Tier 1: {ex.sentences.tier_1}</li>
                                    <li>Tier 2: {ex.sentences.tier_2}</li>
                                    <li>Tier 3: {ex.sentences.tier_3}</li>
                                </ul>}
                                {ex.sentence_answer && <ul className="list-disc list-inside pl-4">
                                    <li>Tier 1: {ex.sentence_answer.tier_1}</li>
                                    <li>Tier 2: {ex.sentence_answer.tier_2}</li>
                                    <li>Tier 3: {ex.sentence_answer.tier_3}</li>
                                </ul>}
                                {ex.sentence && <ul className="list-disc list-inside pl-4">
                                    <li>Tier 1: {ex.sentence.tier_1}</li>
                                    <li>Tier 2: {ex.sentence.tier_2}</li>
                                    <li>Tier 3: {ex.sentence.tier_3}</li>
                                </ul>}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end gap-4 mt-8">
                    <button onClick={onDiscard} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-6 rounded-lg">
                        Discard
                    </button>
                    <button onClick={onConfirm} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-400">
                        {isSaving ? 'Saving...' : 'Confirm and save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// The main page component
const AddWordPage = () => {
    const [word, setWord] = useState('');
    const [error, setError] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [generatedData, setGeneratedData] = useState(null);
    const [successMessage, setSuccessMessage] = useState('');
    // simplified flow; no specify-meaning modal

    const handleInitialSubmit = (e) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        // Directly trigger generation with most common meaning
        handleStartGeneration();
    };

    const handleStartGeneration = async () => {
        setIsGenerating(true);
        try {
            const payload = { word };
            const data = await api.post('/api/words/generate-data', payload);
            setGeneratedData(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleConfirm = async () => {
        setError('');
        setSuccessMessage('');
        setIsSaving(true);
        try {
            await api.post('/api/words/add-word', generatedData);
            setSuccessMessage(`Word "${generatedData.word}" added successfully!`);
            setGeneratedData(null);
            setWord('');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscard = () => {
        setGeneratedData(null);
        setError('');
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-700">AI Generated Vocabulary</h3>
            <p className="mb-6 text-gray-600">Enter an English word; AI will automatically generate its definition, examples, and exercises for your review before adding it to the database.</p>
            <form onSubmit={handleInitialSubmit}>
                <div className="flex items-center gap-4">
                    <input
                        type="text"
                        value={word}
                        onChange={(e) => setWord(e.target.value)}
                        placeholder="Enter an English word"
                        className="flex-grow p-3 rounded bg-gray-50 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        required
                    />
                    <button
                        type="submit"
                        disabled={isGenerating}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 disabled:bg-gray-400"
                    >
                        {isGenerating ? 'Generating...' : 'Next'}
                    </button>
                </div>
                {error && <p className="mt-3 text-red-600 text-center">{error}</p>}
                {successMessage && <p className="mt-3 text-green-600 text-center">{successMessage}</p>}
            </form>

            {/* specify-meaning modal removed */}

            <ConfirmationModal 
                wordData={generatedData}
                onConfirm={handleConfirm}
                onDiscard={handleDiscard}
                isSaving={isSaving}
            />
        </div>
    );
};

export default AddWordPage;

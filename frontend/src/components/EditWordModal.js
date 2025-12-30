import React, { useState, useEffect } from 'react';

const EditWordModal = ({ word, onSave, onCancel, isSaving }) => {
    const [formData, setFormData] = useState(word);

    useEffect(() => {
        setFormData(word);
    }, [word]);

    if (!word) return null;

    const handleChange = (e, path) => {
        const { name, value } = e.target;
        const keys = path ? path.split('.') : [name];
        
        setFormData(prev => {
            let current = { ...prev };
            let ref = current;
            for (let i = 0; i < keys.length - 1; i++) {
                ref = ref[keys[i]];
            }
            ref[keys[keys.length - 1]] = value;
            return current;
        });
    };

    const handleExerciseChange = (e, index, field, subField = null) => {
        const { value } = e.target;
        setFormData(prev => {
            const newExercises = [...prev.exercises];
            if (subField) {
                newExercises[index][field][subField] = value;
            } else {
                newExercises[index][field] = value;
            }
            return { ...prev, exercises: newExercises };
        });
    };
    
    const handleSentenceChange = (e, index, field) => {
        const { value } = e.target;
        setFormData(prev => {
            const newSentences = [...prev.sample_sentences];
            newSentences[index][field] = value;
            return { ...prev, sample_sentences: newSentences };
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const exerciseTypeTranslations = {
        'fill_in_the_blank': 'Fill-in-the-blank',
        'multiple_choice': 'Multiple choice',
        'sentence_correction': 'Sentence correction',
        'sentence_translation': 'Sentence translation',
        'infer_meaning': 'Infer meaning',
        'sentence_reordering': 'Sentence reordering',
        'synonym_replacement': 'Synonym replacement',
    };

    const translateExerciseType = (type) => {
        return exerciseTypeTranslations[type] || type.replace('_', ' ');
    }

    const tierTranslations = {
        'easy': 'Easy',
        'medium': 'Medium',
        'hard': 'Hard',
    }

    const translateTier = (tier) => {
        return tierTranslations[tier] || tier;
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold mb-6 text-gray-800">Edit Word: {word.word}</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block font-semibold text-gray-700">Word</label>
                        <input type="text" name="word" value={formData.word} onChange={handleChange} className="w-full p-2 mt-1 bg-gray-50 border rounded" />
                    </div>
                    <div>
                        <label className="block font-semibold text-gray-700">Word root</label>
                        <input type="text" name="word_root" value={formData.word_root} onChange={handleChange} className="w-full p-2 mt-1 bg-gray-50 border rounded" />
                    </div>
                    {/* Part-of-speech field removed */}
                    <div>
                        <label className="block font-semibold text-gray-700">Chinese definition</label>
                        <input type="text" name="definition_cn" value={formData.definition_cn} onChange={handleChange} className="w-full p-2 mt-1 bg-gray-50 border rounded" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block font-semibold text-gray-700">English definition</label>
                        <textarea name="definition_en" value={formData.definition_en} onChange={handleChange} className="w-full p-2 mt-1 bg-gray-50 border rounded" rows="2"></textarea>
                    </div>
                </div>

                <div className="mt-6">
                    <h3 className="text-lg font-bold mb-2">Sample sentences</h3>
                    {formData.sample_sentences.map((s, i) => (
                        <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2 p-2 border rounded">
                            <input value={s.sentence} onChange={(e) => handleSentenceChange(e, i, 'sentence')} className="w-full p-2 bg-gray-50 border rounded" />
                            <input value={s.translation} onChange={(e) => handleSentenceChange(e, i, 'translation')} className="w-full p-2 bg-gray-50 border rounded" />
                        </div>
                    ))}
                </div>

                <div className="mt-6">
                    <h3 className="text-lg font-bold mb-2">Exercises</h3>
                    {formData.exercises.map((ex, i) => (
                        <div key={i} className="mb-4 p-4 border rounded">
                            <p className="font-semibold capitalize mb-2">{translateExerciseType(ex.type)}</p>
                            {ex.sentences && Object.keys(ex.sentences).map(tier => (
                                <div key={tier}>
                                    <label className="capitalize text-sm text-gray-600">{translateTier(tier)}</label>
                                    <input value={ex.sentences[tier]} onChange={(e) => handleExerciseChange(e, i, 'sentences', tier)} className="w-full p-2 mb-2 bg-gray-50 border rounded" />
                                </div>
                            ))}
                            {ex.sentence_answer && Object.keys(ex.sentence_answer).map(tier => (
                                <div key={tier}>
                                    <label className="capitalize text-sm text-gray-600">{translateTier(tier)}</label>
                                    <input value={ex.sentence_answer[tier]} onChange={(e) => handleExerciseChange(e, i, 'sentence_answer', tier)} className="w-full p-2 mb-2 bg-gray-50 border rounded" />
                                </div>
                            ))}
                             {ex.sentence && Object.keys(ex.sentence).map(tier => (
                                <div key={tier}>
                                    <label className="capitalize text-sm text-gray-600">{translateTier(tier)}</label>
                                    <input value={ex.sentence[tier]} onChange={(e) => handleExerciseChange(e, i, 'sentence', tier)} className="w-full p-2 mb-2 bg-gray-50 border rounded" />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                <div className="flex justify-end gap-4 mt-8">
                    <button type="button" onClick={onCancel} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-6 rounded-lg">
                        Cancel
                    </button>
                    <button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-400">
                        {isSaving ? 'Saving...' : 'Save changes'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default EditWordModal;

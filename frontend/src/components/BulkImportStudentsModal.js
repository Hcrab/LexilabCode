import React, { useState } from 'react';

const BulkImportStudentsModal = ({ isOpen, onClose, onImportSuccess, classId }) => {
  const [mode, setMode] = useState('generate'); // 'generate' | 'upload'
  const [prefix, setPrefix] = useState('');
  const [count, setCount] = useState('');
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setResult(null);

    const token = localStorage.getItem('token');
    try {
      let response;
      if (mode === 'upload') {
        if (!file) throw new Error('Please choose a CSV/XLSX file.');
        const formData = new FormData();
        formData.append('file', file);
        response = await fetch(`/api/classes/${classId}/bulk-import-students`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
      } else {
        response = await fetch(`/api/classes/${classId}/bulk-import-students`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ prefix, count: parseInt(count, 10) })
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Import failed.');
      }
      
      setResult(data);
      onImportSuccess(); // Refresh class list
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Bulk Import Students</h2>
        
        {!result ? (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <div className="inline-flex rounded-md shadow-sm" role="group">
                <button type="button" onClick={()=>setMode('generate')} className={`px-4 py-2 text-sm font-medium border ${mode==='generate'?'bg-blue-600 text-white':'bg-white text-gray-700'}`}>Generate</button>
                <button type="button" onClick={()=>setMode('upload')} className={`px-4 py-2 text-sm font-medium border -ml-px ${mode==='upload'?'bg-blue-600 text-white':'bg-white text-gray-700'}`}>Upload CSV/XLSX</button>
              </div>
            </div>

            {mode === 'generate' ? (
              <>
                <div className="mb-4">
                  <label htmlFor="prefix" className="block text-gray-700 font-medium mb-2">Student Username Prefix</label>
                  <input
                    id="prefix"
                    type="text"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., zx"
                    required
                  />
                </div>
                <div className="mb-6">
                  <label htmlFor="count" className="block text-gray-700 font-medium mb-2">Number of Students</label>
                  <input
                    id="count"
                    type="number"
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 30"
                    min="1"
                    max="200"
                    required
                  />
                </div>
                <p className="text-sm text-gray-500 mb-4">Note: Bulk-created students have default password 123456.</p>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-gray-700 font-medium mb-2">Upload CSV or XLSX</label>
                  <input type="file" accept=".csv,.xlsx" onChange={(e)=> setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} className="w-full" />
                </div>
                <div className="mb-4 text-sm text-gray-600">
                  File columns (header required): <code>username,password,e_name</code>. Password optional (defaults to 123456); e_name optional.
                </div>
              </>
            )}

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <div className="flex justify-end space-x-4">
              <button type="button" onClick={onClose} className="text-gray-600 hover:text-gray-800 font-medium">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-5 rounded-lg transition duration-300 disabled:bg-blue-300"
              >
                {isLoading ? 'Importing…' : 'Start Import'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <h3 className="text-xl font-bold text-green-600 mb-4">Import Complete!</h3>
            <div className="space-y-2">
              <p><strong>Created:</strong> {result.created_students.length} students</p>
              {result.created_students.length > 0 && (
                <div className="text-sm text-gray-600 p-2 bg-gray-100 rounded">
                  {result.created_students.join(', ')}
                </div>
              )}
              <p><strong>Already exist (skipped):</strong> {result.existing_students.length} students</p>
              {result.existing_students.length > 0 && (
                <div className="text-sm text-gray-600 p-2 bg-gray-100 rounded">
                  {result.existing_students.join(', ')}
                </div>
              )}
              {Array.isArray(result.invalid_rows) && result.invalid_rows.length > 0 && (
                <div className="mt-3">
                  <p className="font-semibold">Invalid rows:</p>
                  <div className="text-sm text-red-600 p-2 bg-red-50 rounded">
                    {result.invalid_rows.map((r,i)=> (<div key={i}>Line {r.line}: {r.error}</div>))}
                  </div>
                </div>
              )}
              <p className="text-sm text-gray-600 mt-2">Note: Newly created students have default password 123456.</p>
            </div>
            <div className="flex justify-end mt-6">
              <button onClick={onClose} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-5 rounded-lg">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkImportStudentsModal;

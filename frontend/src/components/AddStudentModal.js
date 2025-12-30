import React, { useState, useEffect } from 'react';

const api = {
  get: async (endpoint) => {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Network response was not ok');
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
      body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Request failed');
    }
    return response.json();
  }
};

const AddStudentModal = ({ classId, onClose, onStudentsAdded }) => {
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        setIsLoading(true);
        const allStudents = await api.get('/api/users/students');
        setStudents(allStudents);
        setError('');
      } catch (err) {
        setError('Failed to load students.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchStudents();
  }, []);

  const handleSelectStudent = (studentId) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSubmit = async () => {
    if (selectedStudents.length === 0) {
      setError('Please select at least one student.');
      return;
    }
    try {
      await api.post(`/api/classes/${classId}/students`, { student_ids: selectedStudents });
      onStudentsAdded();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add students.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Add Students to Class</h2>
        {isLoading ? (
          <p>Loading students...</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <div className="max-h-80 overflow-y-auto border rounded-lg p-4 mb-6">
            {students.map(student => (
              <div key={student._id} className="flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
                <label htmlFor={`student-${student._id}`} className="flex-grow cursor-pointer">
                  {student.username}
                </label>
                <input
                  type="checkbox"
                  id={`student-${student._id}`}
                  checked={selectedStudents.includes(student._id)}
                  onChange={() => handleSelectStudent(student._id)}
                  className="form-checkbox h-5 w-5 text-blue-600"
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-4">
          <button onClick={onClose} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-6 rounded-lg">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={isLoading || selectedStudents.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-400">
            Add Selected
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddStudentModal;

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

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

const InviteStudentPage = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        setIsLoading(true);
        // Fetch only students who are not in the current class
        const availableStudents = await api.get(`/api/users/students`);
        setStudents(availableStudents);
        setError('');
      } catch (err) {
        setError('Failed to load student list.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchStudents();
  }, [classId]);

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
      navigate(`/class/${classId}`);
    } catch (err) {
      setError(err.message || 'Failed to add student.');
    }
  };

  return (
    <div>
        <div className="mb-6">
            <Link to={`/class/${classId}`} className="text-blue-600 hover:underline">&larr; Back to Student List</Link>
        </div>
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Invite Students to Class</h2>
            {isLoading ? (
            <p>Loading student list...</p>
            ) : error ? (
            <p className="text-red-600">{error}</p>
            ) : (
            <div className="max-h-80 overflow-y-auto border rounded-lg p-4 mb-6">
                {students.length > 0 ? students.map(student => (
                <div key={student._id} className="flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
                    <label htmlFor={`student-${student._id}`} className="flex-grow cursor-pointer">
                      {student.nickname ? `${student.nickname} (${student.username})` : student.username}
                    </label>
                    <input
                    type="checkbox"
                    id={`student-${student._id}`}
                    checked={selectedStudents.includes(student._id)}
                    onChange={() => handleSelectStudent(student._id)}
                    className="form-checkbox h-5 w-5 text-blue-600"
                    />
                </div>
                )) : <p className="text-gray-500">No students available to invite.</p>}
            </div>
            )}
            <div className="flex justify-end gap-4">
            <button onClick={() => navigate(`/admin/class/${classId}`)} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-6 rounded-lg">
                Cancel
            </button>
            <button onClick={handleSubmit} disabled={isLoading || selectedStudents.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-400">
                Confirm Invite
            </button>
            </div>
        </div>
    </div>
  );
};

export default InviteStudentPage;

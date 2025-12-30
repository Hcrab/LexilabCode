import React, { useState, useEffect } from 'react';

const StudentDetailsModal = ({ isOpen, onClose, studentId }) => {
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && studentId) {
      setLoading(true);
      setError(null);
      const fetchStudentDetails = async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/students/${studentId}/details`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || 'Failed to fetch student details');
          }
          setStudent(await response.json());
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      fetchStudentDetails();
    }
  }, [isOpen, studentId]);

  const handleClose = () => {
    setStudent(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl h-auto max-h-4/5 flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">Student Details</h2>
        </div>

        <div className="p-6 overflow-y-auto flex-grow">
          {loading && <p>Loading...</p>}
          {error && <p className="text-red-500">{error}</p>}
          {student && (
            <div>
              <div className="mb-6">
                <p><strong>Username:</strong> {student.username}</p>
                <p><strong>Nickname:</strong> {student.nickname || 'N/A'}</p>
                <p><strong>Learning tier:</strong> {(() => {
                  switch (student.tier) {
                    case 'tier_1': return 'Excellent';
                    case 'tier_2': return 'Steady progress';
                    case 'tier_3':
                    default: return 'Needs support';
                  }
                })()}</p>
              </div>
              
              <h3 className="text-xl font-semibold mb-4">To-be-mastered Words ({student.to_be_mastered?.length || 0})</h3>
              <div className="bg-gray-50 p-4 rounded-lg max-h-80 overflow-y-auto">
                {student.to_be_mastered && student.to_be_mastered.length > 0 ? (
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className="text-left pb-2">Word</th>
                        <th className="text-left pb-2">Assigned Date</th>
                        <th className="text-left pb-2">Due Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {student.to_be_mastered.map((item, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2">{item.word}</td>
                          <td className="py-2">{item.assigned_date}</td>
                          <td className="py-2">{item.due_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>This student currently has no words to master.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t flex justify-end bg-gray-50">
          <button onClick={handleClose} className="py-2 px-6 bg-gray-600 text-white rounded-lg">Close</button>
        </div>
      </div>
    </div>
  );
};

export default StudentDetailsModal;


import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

const ExamStatsModal = ({ isOpen, onClose, exam, classId }) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedStudentHistory, setSelectedStudentHistory] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        if (isOpen && exam && classId) {
            fetchExamStats();
        } else {
            // Reset states when modal is closed or props are invalid
            setStats(null);
            setSelectedStudentHistory(null);
            setError('');
        }
    }, [isOpen, exam, classId]);

    const fetchExamStats = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await axios.get(`/api/exams/${exam._id}/class/${classId}/stats`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            setStats(response.data);
        } catch (err) {
            setError('Failed to fetch exam statistics. Please try again later.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStudentHistory = async (studentId) => {
        if (selectedStudentHistory && selectedStudentHistory.student_id === studentId) {
            // If the same student is clicked again, hide the history
            setSelectedStudentHistory(null);
            return;
        }

        setHistoryLoading(true);
        try {
            // Corrected API endpoint based on user feedback and historical assignments page pattern
            const response = await axios.get(`/api/exams/${exam._id}/student/${studentId}/submissions`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            setSelectedStudentHistory({ student_id: studentId, history: response.data });
        } catch (err) {
            console.error('Failed to fetch student submission history:', err);
            // Optionally set an error message for history fetching
        } finally {
            setHistoryLoading(false);
        }
    };

    const { completed_students, uncompleted_students } = useMemo(() => {
        if (!stats) return { completed_students: [], uncompleted_students: [] };
        
        const completed = stats.completed_students || [];
        const uncompleted = stats.uncompleted_students || [];

        return {
            completed_students: completed,
            uncompleted_students: uncompleted
        };
    }, [stats]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">{exam?.name} - Exam Statistics</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl">&times;</button>
                </div>

                {loading && <p>Loading...</p>}
                {error && <p className="text-red-500">{error}</p>}

                {stats && (
                    <div>
                        <div className="mb-6 p-4 bg-gray-100 rounded-lg">
                            <h3 className="text-xl font-semibold">Overview</h3>
                            <p className="text-lg">Class average (first attempts only): <span className="font-bold text-blue-600">{stats.average_score}</span></p>
                            <p className="text-lg">Completed: <span className="font-bold text-green-600">{completed_students.length}</span></p>
                            <p className="text-lg">Incomplete: <span className="font-bold text-red-600">{uncompleted_students.length}</span></p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="text-xl font-semibold mb-2 text-green-700">Completed Students</h3>
                                <div className="overflow-y-auto max-h-96">
                                    <table className="w-full text-left table-auto">
                                        <thead className="bg-gray-200 sticky top-0">
                                            <tr>
                                                <th className="px-4 py-2">Name</th>
                                                <th className="px-4 py-2">First Score</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {completed_students.map(student => (
                                                <tr key={student.student_id} className="border-b hover:bg-gray-50">
                                                    <td 
                                                        className="px-4 py-2 cursor-pointer text-blue-600 hover:underline"
                                                        onClick={() => fetchStudentHistory(student.student_id)}
                                                    >
                                                        {student.nickname || student.username}
                                                    </td>
                                                    <td className="px-4 py-2">{student.first_score}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold mb-2 text-red-700">Incomplete Students</h3>
                                <div className="overflow-y-auto max-h-96">
                                    <table className="w-full text-left table-auto">
                                        <thead className="bg-gray-200 sticky top-0">
                                            <tr>
                                                <th className="px-4 py-2">Name</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {uncompleted_students.map(student => (
                                                <tr key={student.student_id} className="border-b">
                                                    <td className="px-4 py-2">{student.nickname || student.username}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {historyLoading && <p className="mt-6">Loading submission history...</p>}
                        
                        {selectedStudentHistory && (
                            <div className="mt-6 p-4 border border-gray-300 rounded-lg">
                                <h3 className="text-xl font-semibold mb-2">
                                    {completed_students.find(s => s.student_id === selectedStudentHistory.student_id)?.nickname || completed_students.find(s => s.student_id === selectedStudentHistory.student_id)?.username} - Submission History
                                </h3>
                                <table className="w-full text-left table-auto">
                                    <thead className="bg-gray-200">
                                        <tr>
                                            <th className="px-4 py-2">Submitted At</th>
                                            <th className="px-4 py-2">Score</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedStudentHistory.history.map(sub => (
                                            <tr key={sub._id} className="border-b">
                                                <td className="px-4 py-2">{new Date(sub.submitted_at).toLocaleString()}</td>
                                                <td className="px-4 py-2">{sub.score}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExamStatsModal;

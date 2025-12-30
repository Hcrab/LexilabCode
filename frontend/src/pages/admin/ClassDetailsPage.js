import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import CreateStudentModal from '../../components/CreateStudentModal';
import BulkImportStudentsModal from '../../components/BulkImportStudentsModal';
import AssignWordsModal from '../../components/AssignWordsModal';
import SetClassSecretModal from '../../components/SetClassSecretModal';
import AssignWordsToStudentModal from '../../components/AssignWordsToStudentModal';

const api = {
  get: async (endpoint) => {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Network response was not ok');
    return response.json();
  },
  delete: async (endpoint) => {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Network response was not ok');
    return response.json();
  },
  put: async (endpoint, body) => {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error('Network response was not ok');
    return response.json();
  }
};

const tierMapping = {
  tier_1: 'Excelling',
  tier_2: 'Steady progress',
  tier_3: 'Needs support'
};

const ClassDetailsPage = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [classDetails, setClassDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');

  // Modal states
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isBulkImportModalOpen, setBulkImportModalOpen] = useState(false);
  const [isAssignWordsModalOpen, setAssignWordsModalOpen] = useState(false);
  // 学生详情跳转到独立页面，不再使用弹窗
  const [assignForStudent, setAssignForStudent] = useState(null);
  const [isSelectStudentOpen, setSelectStudentOpen] = useState(false);
  const [showSetSecret, setShowSetSecret] = useState(false);
  const [goalValue, setGoalValue] = useState('');
  const [applyingGoal, setApplyingGoal] = useState(false);
  const [goalLoading, setGoalLoading] = useState(false);

  const fetchClassDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get(`/api/classes/${classId}`);
      setClassDetails(data);
    } catch (err) {
      setError('Failed to load class details.');
    } finally {
      setIsLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    fetchClassDetails();
  }, [fetchClassDetails]);

  // Load current class learning goal snapshot
  useEffect(() => {
    const loadGoal = async () => {
      setGoalLoading(true);
      try {
        const data = await api.get(`/api/classes/${classId}/learning-goal`);
        const g = (data && typeof data.goal === 'number') ? data.goal : '';
        setGoalValue(String(g));
      } catch (_) {
        // ignore
      } finally { setGoalLoading(false); }
    };
    loadGoal();
  }, [classId]);


  const handleWordsAssigned = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(''), 5000); // Hide after 5 seconds
  };

  const handleShowStudentDetails = (studentId) => {
    const back = encodeURIComponent(`/admin/class/${classId}`);
    navigate(`/admin/student/${studentId}?back=${back}`);
  };

  const handleRemoveStudent = async (studentId) => {
    if (window.confirm('Remove this student?')) {
      try {
        await api.delete(`/api/classes/${classId}/students/${studentId}`);
        fetchClassDetails(); // Refresh the list
      } catch (err) {
        setError('Failed to remove student.');
      }
    }
  };

  const handleRenameStudent = async (studentId, currentName) => {
    const newName = window.prompt('Enter new nickname (leave blank to clear):', currentName || '');
    if (newName === null) return; // cancelled
    try {
      await api.put(`/api/admin/students/${studentId}/nickname`, { nickname: newName.trim() });
      setNotification('Student nickname updated.');
      setTimeout(() => setNotification(''), 3000);
      fetchClassDetails();
    } catch (err) {
      setError(err?.message || 'Failed to update nickname');
    }
  };

  const handleTierChange = async (studentId, newTier) => {
    // Optimistically update the UI
    setClassDetails(prevDetails => ({
      ...prevDetails,
      students: prevDetails.students.map(student =>
        student._id === studentId ? { ...student, tier: newTier } : student
      )
    }));

    try {
      await api.put(`/api/students/${studentId}/tier`, { tier: newTier });
      setNotification('Student tier updated.');
      setTimeout(() => setNotification(''), 3000);
    } catch (err) {
      setError('Failed to update tier, please refresh and retry.');
      // Revert the change if the API call fails
      fetchClassDetails();
    }
  };

  if (isLoading) return <div className="text-center p-8">Loading...</div>;
  if (error) return <div className="text-center p-8 text-red-600">{error}</div>;
  if (!classDetails) return null;

  return (
    <div>
      <div className="mb-6">
        <Link to="/admin/dashboard" className="text-blue-600 hover:underline">&larr; Back to all classes</Link>
      </div>

      {notification && (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6" role="alert">
          <p>{notification}</p>
        </div>
      )}

      <div className="bg-white p-8 rounded-xl shadow-lg">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h2 className="text-3xl font-bold text-gray-800">{classDetails.name}</h2>
                    <p className="text-gray-500 mt-1">Students ({classDetails.students?.length || 0})</p>
                </div>
                <div className="flex flex-col items-end space-y-3">
                    <div className="flex space-x-3 flex-wrap items-center">
                        <button
                            onClick={() => navigate(`/admin/class/${classId}/stats`)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-lg transition duration-300"
                        >
                            View class stats
                        </button>
                        <button
                            onClick={() => setAssignWordsModalOpen(true)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-lg transition duration-300"
                        >
                            Assign word to class
                        </button>
                        <button
                            onClick={() => setShowSetSecret(true)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-5 rounded-lg transition duration-300"
                        >
                            Set class custom wordbook
                        </button>
                        {/* Inline class learning goal control */}
                        <div className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2">
                          <label className="text-sm text-gray-700">Class learning goal</label>
                          <input
                            type="text"
                            value={goalValue}
                            onChange={(e)=> setGoalValue(e.target.value)}
                            className="w-20 p-1 border rounded text-center"
                            placeholder={goalLoading ? '…' : 'e.g., 10'}
                          />
                          <button
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm disabled:opacity-50"
                            disabled={applyingGoal || goalLoading || String(goalValue).trim()===''}
                            onClick={async ()=>{
                              try {
                                setApplyingGoal(true);
                                const n = parseInt(goalValue, 10);
                                if (isNaN(n) || n < 0 || n > 500) { setError('Goal must be an integer between 0 and 500'); setApplyingGoal(false); return; }
                                await api.put(`/api/classes/${classId}/learning-goal`, { goal: n });
                                setNotification('Class learning goal updated');
                                setTimeout(()=>setNotification(''), 3000);
                              } catch (e) {
                                setError(e?.message || 'Failed to apply');
                              } finally { setApplyingGoal(false); }
                            }}
                          >{applyingGoal ? 'Saving…' : 'Save'}</button>
                        </div>
                        {/* 词汇布置历史入口移除以简化产品 */}
                    </div>
                    <div className="flex space-x-3">
                        <button onClick={() => setBulkImportModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition">Bulk import</button>
                        <button onClick={() => setCreateModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition">Create student</button>
                        <button onClick={() => navigate(`/admin/class/${classId}/invite`)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition">Invite students</button>
                    </div>
                </div>
            </div>
        
        {classDetails.students && classDetails.students.length > 0 ? (
          <ul className="space-y-3">
            {classDetails.students.map(student => (
              <li key={student._id} className="bg-gray-50 p-4 rounded-md flex justify-between items-center">
                <button
                  onClick={() => handleShowStudentDetails(student._id)}
                  className="text-gray-800 font-medium hover:text-blue-600 text-left"
                >
                  {(() => {
                    const parts = [];
                    if (student.nickname) parts.push(student.nickname);
                    if (student.english_name) parts.push(student.english_name);
                    // Always show username for disambiguation
                    parts.push(`(${student.username})`);
                    return parts.join(' ');
                  })()}
                </button>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => setAssignForStudent(student)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded-lg text-sm transition"
                  >
                    Assign words
                  </button>
                  <select
                    value={student.tier || 'tier_3'} // Default to 'tier_3' if undefined
                    onChange={(e) => handleTierChange(student._id, e.target.value)}
                    className="bg-white border border-gray-300 rounded-md py-1 px-2 text-sm"
                  >
                    {Object.entries(tierMapping).map(([key, value]) => (
                      <option key={key} value={key}>{value}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleRenameStudent(student._id, student.nickname)}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-1 px-3 rounded-lg text-sm transition"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleRemoveStudent(student._id)}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-lg text-sm transition"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-center py-4">This class has no students yet.</p>
        )}
      </div>
      
      <CreateStudentModal isOpen={isCreateModalOpen} onClose={() => setCreateModalOpen(false)} onStudentCreated={fetchClassDetails} />
      <BulkImportStudentsModal isOpen={isBulkImportModalOpen} onClose={() => setBulkImportModalOpen(false)} onImportSuccess={fetchClassDetails} classId={classId} />
      {/* Retain class-level modal for future use, but hidden by default */}
      <AssignWordsModal isOpen={isAssignWordsModalOpen} onClose={() => setAssignWordsModalOpen(false)} classId={classId} onWordsAssigned={handleWordsAssigned} assignedWords={classDetails.assigned_words || []} />
      {/* 详情弹窗改为跳转到学生管理页，这里移除弹窗 */}
      {assignForStudent && (
        <AssignWordsToStudentModal
          isOpen={!!assignForStudent}
          onClose={() => setAssignForStudent(null)}
          classId={classId}
          student={assignForStudent}
          onAssigned={(msg) => { setNotification(msg || 'Assigned'); fetchClassDetails(); }}
        />
      )}

      <SetClassSecretModal
        isOpen={showSetSecret}
        onClose={() => setShowSetSecret(false)}
        classId={classId}
        onApplied={(msg) => { setNotification(msg || 'Applied'); fetchClassDetails(); }}
      />

      {/* Inline control replaces modal for class goal */}
      {isSelectStudentOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Select a student</h3>
              <button onClick={() => setSelectStudentOpen(false)} className="text-gray-500 hover:text-gray-800 text-2xl leading-none">×</button>
            </div>
            <div className="p-4 overflow-y-auto">
              {(!classDetails.students || classDetails.students.length === 0) && (
                <p className="text-gray-500">No students in this class.</p>
              )}
              <ul className="divide-y">
                {classDetails.students?.map(stu => (
                  <li key={stu._id}>
                    <button
                      onClick={() => { setAssignForStudent(stu); setSelectStudentOpen(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 flex justify-between items-center"
                    >
                      <span>
                        {(() => {
                          const parts = [];
                          if (stu.nickname) parts.push(stu.nickname);
                          if (stu.english_name) parts.push(stu.english_name);
                          parts.push(`(${stu.username})`);
                          return parts.join(' ');
                        })()}
                      </span>
                      <span className="text-xs text-gray-500">Assign words</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
};

export default ClassDetailsPage;

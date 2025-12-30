import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Reusable API utility
const api = {
  get: async (endpoint) => {
    const token = localStorage.getItem('token');
    const response = await fetch(endpoint, {
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

const UserProfile = ({ user, isLoading, error }) => {
  if (isLoading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="bg-white p-6 rounded-xl shadow-md mb-8">
      <h3 className="text-xl font-bold mb-4 text-gray-700">User Info</h3>
      <p><span className="font-semibold">Username:</span> {user.username}</p>
      <p><span className="font-semibold">Nickname:</span> {user.nickname || 'Not set'}</p>
      <div className="mt-2">
        <p className="font-semibold">Classes:</p>
        {Array.isArray(user.classes) && user.classes.length > 0 ? (
          <ul className="list-disc list-inside text-gray-700">
            {user.classes.map(c => (
              <li key={c.id}>{c.name || c.id}</li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">No classes</p>
        )}
      </div>
    </div>
  );
};

const UpdateNicknameForm = ({ onProfileUpdate }) => {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      await api.put('/api/user/profile', { nickname });
      setSuccess('Nickname updated!');
      onProfileUpdate(); // Refresh the profile
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-md mb-8">
      <h3 className="text-xl font-bold mb-4 text-gray-700">Update Nickname</h3>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Enter new nickname"
          className="w-full p-3 rounded bg-gray-50 border border-gray-300 mb-4"
          required
        />
        <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg">
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
        {error && <p className="mt-3 text-red-600">{error}</p>}
        {success && <p className="mt-3 text-green-600">{success}</p>}
      </form>
    </div>
  );
};

const UpdatePasswordForm = () => {
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    setPasswords({ ...passwords, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      setError('New password does not match.');
      return;
    }
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      await api.put('/api/user/profile', {
        current_password: passwords.currentPassword,
        new_password: passwords.newPassword
      });
      setSuccess('Password updated!');
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-md">
      <h3 className="text-xl font-bold mb-4 text-gray-700">Change Password</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="password"
          name="currentPassword"
          value={passwords.currentPassword}
          onChange={handleChange}
          placeholder="Current password"
          className="w-full p-3 rounded bg-gray-50 border border-gray-300"
          required
        />
        <input
          type="password"
          name="newPassword"
          value={passwords.newPassword}
          onChange={handleChange}
          placeholder="New password"
          className="w-full p-3 rounded bg-gray-50 border border-gray-300"
          required
        />
        <input
          type="password"
          name="confirmPassword"
          value={passwords.confirmPassword}
          onChange={handleChange}
          placeholder="Confirm new password"
          className="w-full p-3 rounded bg-gray-50 border border-gray-300"
          required
        />
        <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg">
          {isSubmitting ? 'Updating...' : 'Update Password'}
        </button>
        {error && <p className="mt-3 text-red-600">{error}</p>}
        {success && <p className="mt-3 text-green-600">{success}</p>}
      </form>
    </div>
  );
};

const UpdateSecurityAnswerForm = () => {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      await api.put('/api/user/profile', { security_answer: answer });
      setSuccess('Security answer updated!');
      setAnswer('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-md mt-8">
      <h3 className="text-xl font-bold mb-2 text-gray-700">Security Question</h3>
      <p className="text-sm text-gray-600 mb-4">What is your favorite animal?</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Enter answer (used for password recovery)"
          className="w-full p-3 rounded bg-gray-50 border border-gray-300"
          required
        />
        <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg">
          {isSubmitting ? 'Saving...' : 'Save Answer'}
        </button>
        {error && <p className="mt-3 text-red-600">{error}</p>}
        {success && <p className="mt-3 text-green-600">{success}</p>}
      </form>
    </div>
  );
};


const StudentProfilePage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState({ username: '', nickname: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUserProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get('/api/user/profile');
      setUser(data);
      setError('');
    } catch (err) {
      setError('Unable to load profile.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  return (
    <div className="max-w-2xl mx-auto">
        <button 
            onClick={() => navigate(-1)} 
            className="mb-6 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg text-sm transition duration-300"
        >
            &larr; Back
        </button>
        <UserProfile user={user} isLoading={isLoading} error={error} />
        {/* Only allow updating nickname if nickname is missing or empty */}
        {(!user?.nickname || String(user.nickname).trim() === '') && (
          <UpdateNicknameForm onProfileUpdate={fetchUserProfile} />
        )}
        <UpdatePasswordForm />
        <UpdateSecurityAnswerForm />
    </div>
  );
};

export default StudentProfilePage;

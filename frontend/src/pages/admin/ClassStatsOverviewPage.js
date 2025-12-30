import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const ClassStatsOverviewPage = () => {
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchClasses = async () => {
            setLoading(true);
            try {
                const response = await fetch('/api/classes', {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                if (!response.ok) throw new Error('Failed to fetch class list');
                const data = await response.json();
                setClasses(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchClasses();
    }, []);

    return (
        <div className="p-6">
            <h1 className="text-3xl font-bold mb-6">Class Overview</h1>
            {loading && <p>Loading...</p>}
            {error && <p className="text-red-500">{error}</p>}
            {!loading && !error && (
                <div className="bg-white shadow-md rounded-lg p-6">
                    {classes.length === 0 ? (
                        <p>No classes found.</p>
                    ) : (
                        <ul className="divide-y divide-gray-200">
                            {classes.map(cls => (
                                <li key={cls._id} className="py-4 flex justify-between items-center">
                                    <div>
                                        <h2 className="text-xl font-semibold">{cls.name}</h2>
                                        <p className="text-gray-500">{cls.students.length} students</p>
                                    </div>
                                    <Link 
                                        to={`/admin/class/${cls._id}/stats`} 
                                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                                    >
                                        View completion rate
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

export default ClassStatsOverviewPage;

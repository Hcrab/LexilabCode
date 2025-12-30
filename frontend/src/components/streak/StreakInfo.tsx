"use client"
import { useEffect, useState, useContext } from 'react';
import AuthContext from '../../contexts/AuthContext';

interface StreakData {
  current_streak: number;
  max_streak: number;
  percentile: number;
}

const StreakInfo = () => {
  const { user } = useContext(AuthContext);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [quote, setQuote] = useState('');
  const [encouragement, setEncouragement] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Ensure user and user.username are available before fetching
    if (!user?.username) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch streak data
        const streakRes = await fetch(`/api/stats/streaks?username=${user.username}`);
        if (!streakRes.ok) {
            const errData = await streakRes.json();
            throw new Error(errData.error || 'Failed to fetch streak data');
        }
        const streakJson = await streakRes.json();
        setStreakData(streakJson);

        // Fetch quotes
        const quoteRes = await fetch('/inspiring_quote.txt');
        if (!quoteRes.ok) throw new Error('Failed to fetch quotes');
        const quoteText = await quoteRes.text();
        const quotes = quoteText.split('\n').filter(q => q.trim() !== '');
        setQuote(quotes[Math.floor(Math.random() * quotes.length)]);

        // Fetch encouragements
        const encouragementRes = await fetch('/encouragement.txt');
        if (!encouragementRes.ok) throw new Error('Failed to fetch encouragements');
        const encouragementText = await encouragementRes.text();
        const encouragements = encouragementText.split('\n').filter(e => e.trim() !== '');
        
        let selectedEncouragement = "Keep up the great work!";
        if (streakJson.current_streak > 0) {
            for (const line of encouragements) {
                const match = line.match(/^Day (\d+):/);
                if (match) {
                    const day = parseInt(match[1], 10);
                    if (streakJson.current_streak >= day) {
                        selectedEncouragement = line.replace(/^Day \d+:\s*/, '');
                    }
                }
            }
        }
        setEncouragement(selectedEncouragement);

      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.username]); // Depend on user.username specifically

  if (loading) {
    return <div className="p-4 text-center">Loading streak information...</div>;
  }

  // Don't show the component if there's an error or no user
  if (error || !user) {
    return null;
  }
  
  if (!streakData) {
    return null;
  }

  return (
    <div className="bg-white shadow-md rounded-lg p-6 my-4 w-full max-w-4xl">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Your Progress</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-4xl font-bold text-blue-600">{streakData.current_streak}</p>
          <p className="text-gray-600">Current Streak (days)</p>
        </div>
        <div>
          <p className="text-4xl font-bold text-gray-500">{streakData.max_streak}</p>
          <p className="text-gray-600">Max Streak (days)</p>
        </div>
      </div>
      {streakData.current_streak > 0 && (
        <div className="mt-6 text-center">
          <p className="text-lg italic text-gray-700">\"{quote}\"</p>
          <p className="text-md text-blue-700 mt-2 font-semibold">{encouragement}</p>
        </div>
      )}
    </div>
  );
};

export default StreakInfo;

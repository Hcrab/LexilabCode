import Link from 'next/link';
import {
  AcademicCapIcon,
  ListBulletIcon,
  ChartBarIcon,
  BookmarkIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import StreakInfo from '../components/streak/StreakInfo';
import { useContext } from 'react';
import AuthContext from '../contexts/AuthContext';

const menuItems = [
  { href: '/quiz-list', title: 'Start a Quiz', description: 'Take a new quiz to test your skills.', icon: AcademicCapIcon },
  { href: '/review', title: 'Review Past Quizzes', description: 'Look at your previous attempts and scores.', icon: ListBulletIcon },
  { href: '/my-progress', title: 'Track Your Progress', description: 'See your statistics and completion rates.', icon: ChartBarIcon },
  { href: '/my-bookmarks', title: 'My Bookmarks', description: 'Review your saved words and questions.', icon: BookmarkIcon },
  { href: '/my-profile', title: 'My Profile', description: 'View and manage your account details.', icon: UserCircleIcon },
  { href: '/login', title: 'Login', description: 'Access your account.', icon: ArrowRightOnRectangleIcon },
  { href: '/lab', title: 'LAB', description: 'Access experimental features.', icon: BeakerIcon },
];

const NavCard = ({ item }: { item: typeof menuItems[0] }) => (
  <Link href={item.href} className="group block p-6 bg-white rounded-xl shadow-lg hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300 ease-in-out border border-gray-200 hover:border-blue-500">
    <div className="flex items-center space-x-4">
      <div className="bg-blue-100 p-3 rounded-full group-hover:bg-blue-500 transition-colors duration-300">
        <item.icon className="h-8 w-8 text-blue-600 group-hover:text-white transition-colors duration-300" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-gray-800 group-hover:text-blue-600 transition-colors duration-300">{item.title}</h3>
        <p className="text-gray-600 mt-1">{item.description}</p>
      </div>
    </div>
  </Link>
);

export default function Home() {
  const { user } = useContext(AuthContext);

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="text-center mb-12">
        <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 tracking-tight">
          Welcome to <span className="text-blue-600">Lexilab</span>
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600">
          Your personal space to learn, practice, and improve your English skills.
        </p>
      </div>

      {user && <StreakInfo />}

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
        {menuItems.map((item) => {
          if (item.href === '/lab' && process.env.NODE_ENV !== 'development') return null;
          if (!user && (item.href.startsWith('/my-') || item.href === '/review' || item.href === '/lab')) return null;
          if (user && item.href === '/login') return null;
          return <NavCard key={item.href} item={item} />;
        })}
      </div>
    </main>
  );
}

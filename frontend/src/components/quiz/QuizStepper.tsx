// frontend/src/components/quiz/QuizStepper.tsx
import React from 'react';

interface Props {
  currentSection: number;
  setSection: (section: number) => void;
  sectionTitles: string[];
  sectionStatus: string[]; // e.g., ['completed', 'attempted', 'untouched']
}

export default function QuizStepper({ currentSection, setSection, sectionTitles, sectionStatus }: Props) {
  return (
    <div className="flex justify-center border-b mb-6">
      {sectionTitles.map((title, index) => {
        const sectionNumber = index + 1;
        const status = sectionStatus[index];
        const isActive = sectionNumber === currentSection;

        // Determine color based on status, with active section having priority
        const getStatusClasses = () => {
          if (isActive) {
            return 'border-blue-600 text-blue-600'; // Active section
          }
          switch (status) {
            case 'completed':
              return 'border-green-500 text-green-600 hover:bg-gray-50'; // Completed
            case 'attempted':
              return 'border-yellow-500 text-yellow-600 hover:bg-gray-50'; // Attempted but not completed
            case 'untouched':
            default:
              return 'border-transparent text-gray-500 hover:bg-gray-50'; // Not yet visited
          }
        };

        return (
          <button
            key={sectionNumber}
            onClick={() => setSection(sectionNumber)}
            className={`flex-1 p-4 text-center font-medium border-b-4 transition-colors ${getStatusClasses()}`}
          >
            {`Section ${sectionNumber}: ${title}`}
          </button>
        );
      })}
    </div>
  );
}

import React from 'react';

export default function QuizStepper({ currentSection, setSection, sectionTitles, sectionStatus }) {
  return (
    <div className="flex justify-center border-b mb-6">
      {sectionTitles.map((title, index) => {
        const sectionNumber = index + 1;
        const status = sectionStatus[index];
        const isActive = sectionNumber === currentSection;

        const getStatusClasses = () => {
          if (isActive) return 'border-blue-600 text-blue-600';
          switch (status) {
            case 'completed':
              return 'border-green-500 text-green-600 hover:bg-gray-50';
            case 'attempted':
              return 'border-yellow-500 text-yellow-600 hover:bg-gray-50';
            case 'untouched':
            default:
              return 'border-transparent text-gray-500 hover:bg-gray-50';
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

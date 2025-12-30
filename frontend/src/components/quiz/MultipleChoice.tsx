import React from 'react';

interface Props {
  questionText: string;
  options: string[];
  selectedValue: string;
  onChange: (value: string) => void;
}

export default function MultipleChoice({ questionText, options, selectedValue, onChange }: Props) {
  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <p className="text-lg text-gray-700 mb-3">{questionText}</p>
      <div className="space-y-2">
        {options.map((option, index) => (
          <label
            key={index}
            className={`flex items-center p-3 border rounded-md cursor-pointer transition-colors ${
              selectedValue === option ? 'bg-blue-100 border-blue-500' : 'bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <input
              type="radio"
              name={questionText}
              value={option}
              checked={selectedValue === option}
              onChange={() => onChange(option)}
              className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-3 text-gray-800">{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

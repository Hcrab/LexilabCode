// frontend/src/lib/quizParser.ts

export interface Question {
  id?: string;
  type: 'definition' | 'fill-in-the-blank' | 'sentence';
  word: string;
  prompt?: string; // The question text for fill-in-the-blank
  definition?: string;
  correctAnswer?: string;
  // For results page
  answer?: string;
  correct?: boolean;
  score?: number;
  feedback?: string;
}

export interface ParsedQuizData {
  definitions: Question[];
  fillInTheBlanks: Question[];
  sentences: Question[];
}

/**
 * The definitive, robust parser. It transforms ALL quiz data formats from the backend
 * into a standardized, sectioned object. This is the single source of truth.
 *
 * @param rawItems The raw 'items' array from a quiz's 'data' field.
 * @returns A ParsedQuizData object.
 */
export const parseAndCategorizeQuizData = (rawItems: any): ParsedQuizData => {
  const output: ParsedQuizData = {
    definitions: [],
    fillInTheBlanks: [],
    sentences: [],
  };

  if (!Array.isArray(rawItems)) {
    return output;
  }

  const definitionsSet = new Set<string>();

  rawItems.forEach((item: any) => {
    if (!item || typeof item !== 'object' || !item.word) {
      return; // Skip invalid items
    }

    // --- Universal Definition Handling ---
    if (item.definition && !definitionsSet.has(item.word)) {
      output.definitions.push({
        id: item.id,
        type: 'definition',
        word: item.word,
        definition: item.definition,
      });
      definitionsSet.add(item.word);
    }

    // --- Question Type Handling ---
    const questionType = item.type || (item.blank ? 'fill-in-the-blank' : (item.write ? 'sentence' : null));

    switch (questionType) {
      case 'fill-in-the-blank':
        output.fillInTheBlanks.push({
          id: item.id,
          type: 'fill-in-the-blank',
          word: item.word,
          // Super defensive prompt assignment to prevent crashes.
          // It checks for 'prompt', then 'sentence', then falls back to a placeholder.
          prompt: item.prompt || item.sentence || '___',
          correctAnswer: item.word,
        });
        break;
      
      case 'sentence':
        output.sentences.push({
          id: item.id,
          type: 'sentence',
          word: item.word,
          definition: item.definition,
        });
        break;
    }
  });

  return output;
};
